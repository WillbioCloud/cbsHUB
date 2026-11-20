const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: [
      "--no-sandbox",
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
  try {
    const page = await browser.newPage();
    page.on("pageerror", (error) => console.log("PAGE ERROR", error.message));
    await page.route("**/*", (r) =>
      new URL(r.request().url()).hostname === "127.0.0.1"
        ? r.continue()
        : r.abort(),
    );
    await page.goto("http://127.0.0.1:5173");
    await page
      .getByRole("button", { name: "Entrar na voz", exact: true })
      .waitFor();
    const offline = await page.evaluate(async () => {
      const { createAudioPeakGuard } = await import(
        "/src/lib/audioPeakGuard.ts"
      );
      const results = [];
      for (const amplitude of [0.1, 1, 16]) {
        const ctx = new OfflineAudioContext(1, 48000, 48000),
          guard = createAudioPeakGuard(ctx);
        const tone = ctx.createOscillator(),
          gain = ctx.createGain();
        tone.frequency.value = 7000;
        gain.gain.value = amplitude;
        tone.connect(gain).connect(guard).connect(ctx.destination);
        tone.start();
        const data = (await ctx.startRendering()).getChannelData(0);
        results.push({
          peak: data.reduce((m, v) => Math.max(m, Math.abs(v)), 0),
          finite: data.every(Number.isFinite),
        });
      }
      return results;
    });
    assert(offline.every((r) => r.finite && r.peak <= 0.981));
    assert(
      offline[0].peak > 0.099 && offline[0].peak < 0.101,
      "ordinary gain unchanged",
    );
    assert(offline[2].peak > 0.97, "loud audio limited, not silenced");
    await page.evaluate(async () => {
      window.e = (await import("/src/lib/webrtcEngine.ts")).webrtcEngine;
      window.s = (await import("/src/store/useHubStore.ts")).useHubStore;
      window.m = (await import("/src/lib/mediaState.ts")).useMediaState;
      window.d = (
        await import("/src/lib/callDiagnostics.ts")
      ).useCallDiagnostics;
      e.cancelRecovery();
      await e.joinVoiceCall();
      s.getState().setDeafened(true);
      window.initialPeer = e.localPeer;
      if (!initialPeer) throw Error("Test requires the initialized room engine");
      window.initialGeneration = e.roomGeneration;
      window.pipeline = e.audioPipeline;
      window.mic = e.rawMicStream;
      window.ctx = pipeline.getAudioContext();
      window.analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      ctx
        .createMediaStreamSource(pipeline.getProcessedStream())
        .connect(analyser);
      window.tone = ctx.createOscillator();
      tone.frequency.value = 7000;
      window.gain = ctx.createGain();
      gain.gain.value = 16;
      tone.connect(gain).connect(pipeline.getSoundboardInputNode());
      gain.connect(pipeline.highPassFilter); // simultaneous high microphone and effect paths
      pipeline.updateConfig({ micGain: Number.NaN });
      tone.start();
    });
    await page.waitForTimeout(600);
    const live = await page.evaluate(() => {
      const samples = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(samples);
      return {
        peak: samples.reduce((m, v) => Math.max(m, Math.abs(v)), 0),
        finite: samples.every(Number.isFinite),
        inVoice: s.getState().inVoiceCall,
        active: mic.active,
        same:
          e.audioPipeline === pipeline &&
          e.localPeer === initialPeer &&
          e.roomGeneration === initialGeneration,
      };
    });
    assert(live.finite && live.peak <= 0.981 && live.peak > 0.9);
    assert(live.inVoice && live.active && live.same);
    // Loud uploaded PCM also retains the call; local monitoring is deafened.
    await page.evaluate(async () => {
      tone.stop();
      tone.disconnect();
      gain.disconnect();
      const sb = (await import("/src/lib/soundboardEngine.ts"))
        .soundboardEngine;
      const { trimWav } = await import("/src/lib/audioTrim.ts");
      const buffer = ctx.createBuffer(1, 48000, 48000),
        data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++)
        data[i] = Math.sin((i * 2 * Math.PI * 6500) / 48000);
      await sb.playClip({
        id: "loud-regression",
        audioBlob: trimWav(buffer, 0, 1),
        volume: 2,
      });
    });
    await page.waitForTimeout(250);
    assert(
      await page.evaluate(
        () =>
          s.getState().inVoiceCall &&
          mic.active &&
          e.audioPipeline === pipeline,
      ),
    );
    const gate = await page.evaluate(() => {
      const gate = pipeline.workletNode;
      if (!gate) return { present: false, events: d.getState().events };
      gate.dispatchEvent(
        new ErrorEvent("processorerror", {
          message: "Injected processor failure",
        }),
      );
      return {
        present: true,
        bypass: pipeline.workletNode === null,
        inVoice: s.getState().inVoiceCall,
        active: pipeline.getProcessedStream().active,
      };
    });
    assert(
      gate.present && gate.bypass && gate.inVoice && gate.active,
      JSON.stringify(gate),
    );
    // Controlled capture interruption, with a healthy mocked RTP sender/connection.
    await page.evaluate(() => {
      window.replacements = [];
      window.callCloseCount = 0;
      window.sender = {
        track: pipeline.getProcessedStream().getAudioTracks()[0],
        replaceTrack: async (track) => {
          replacements.push(track);
          sender.track = track;
        },
      };
      window.call = {
        peerConnection: { getSenders: () => [sender] },
        close: () => {
          callCloseCount++;
        },
      };
      window.session = {
        peerId: "peak-test",
        clientId: "peak-client",
        voiceCall: call,
        dataConn: { open: true, send: () => {} },
        voiceAudioEl: null,
      };
      e.sessions.set("peak-test", session);
      mic.getAudioTracks()[0].stop();
      mic.getAudioTracks()[0].dispatchEvent(new Event("ended"));
    });
    await page.waitForFunction(
      () => !m.getState().microphoneBusy && e.rawMicStream !== mic,
    );
    assert(
      await page.evaluate(
        () =>
          e.rawMicStream.active &&
          s.getState().inVoiceCall &&
          session.voiceCall === call &&
          callCloseCount === 0 &&
          replacements.length === 1 &&
          e.localPeer === initialPeer &&
          e.roomGeneration === initialGeneration,
      ),
    );
    // Rapid repeat: stays in the call, shows a notice and reconnects by itself
    // (short waits here; production backs off 0/1/2.5/5/10/20 s).
    await page.evaluate(() => {
      e.micRecoveryDelaysMs = [0, 150, 150, 150, 150, 150];
      window.recovered = e.rawMicStream;
      recovered.getAudioTracks()[0].stop();
      recovered.getAudioTracks()[0].dispatchEvent(new Event("ended"));
    });
    await page.waitForFunction(
      () =>
        m.getState().error &&
        (m.getState().error.includes("Reconectando") ||
          m.getState().error.includes("A chamada continua")),
    );
    await page.waitForFunction(
      () => !m.getState().microphoneBusy && e.rawMicStream !== recovered,
    );
    assert(
      await page.evaluate(
        () =>
          e.rawMicStream.active &&
          s.getState().inVoiceCall &&
          callCloseCount === 0 &&
          replacements.length === 2,
      ),
    );
    // Track muted by the OS/driver without "ended": watchdog reconnects the capture.
    await page.evaluate(() => {
      e.micMuteWatchdogMs = 100;
      window.mutedCapture = e.rawMicStream;
      const t = mutedCapture.getAudioTracks()[0];
      Object.defineProperty(t, "muted", { configurable: true, get: () => true });
      t.dispatchEvent(new Event("mute"));
    });
    await page.waitForFunction(
      () => !m.getState().microphoneBusy && e.rawMicStream !== mutedCapture,
    );
    assert(
      await page.evaluate(
        () =>
          e.rawMicStream.active &&
          s.getState().inVoiceCall &&
          callCloseCount === 0 &&
          replacements.length === 3,
      ),
    );
    // A short mute that unmutes by itself must not replace the capture.
    await page.evaluate(async () => {
      e.micMuteWatchdogMs = 300;
      window.briefMute = e.rawMicStream;
      const t = briefMute.getAudioTracks()[0];
      Object.defineProperty(t, "muted", { configurable: true, get: () => true });
      t.dispatchEvent(new Event("mute"));
      await new Promise((r) => setTimeout(r, 50));
      t.dispatchEvent(new Event("unmute"));
      await new Promise((r) => setTimeout(r, 450));
    });
    assert(
      await page.evaluate(
        () => e.rawMicStream === briefMute && replacements.length === 3,
      ),
    );
    // Capture permission/device failure: bounded automatic retries, call and room intact.
    await page.evaluate(() => {
      window.originalCapture = navigator.mediaDevices.getUserMedia.bind(
        navigator.mediaDevices,
      );
      window.captureAttempts = 0;
      navigator.mediaDevices.getUserMedia = async () => {
        captureAttempts++;
        throw Error("device interrupted");
      };
      e.micRecoveryDelaysMs = [0, 50, 50];
      e.micRecoveryAttempt = 0;
      e.lastMicRecoveredAt = -Infinity;
      window.stuck = e.rawMicStream;
      stuck.getAudioTracks()[0].stop();
      stuck.getAudioTracks()[0].dispatchEvent(new Event("ended"));
    });
    await page.waitForFunction(
      () =>
        captureAttempts === 3 &&
        !m.getState().microphoneBusy &&
        m.getState().error.includes("parou de responder"),
    );
    await page.waitForTimeout(400);
    assert(
      await page.evaluate(
        () =>
          captureAttempts === 3 &&
          s.getState().inVoiceCall &&
          session.voiceCall === call &&
          callCloseCount === 0 &&
          !d.getState().events.some((x) => x.event === "call_ended"),
      ),
    );
    // Explicit leave during an outstanding capture must not resurrect the call.
    await page.evaluate(async () => {
      window.late = await originalCapture({ audio: true });
      navigator.mediaDevices.getUserMedia = () =>
        new Promise((resolve) => {
          window.resolveCapture = resolve;
        });
      window.pending = e.setupLocalMicrophone();
      e.leaveVoiceCall();
      resolveCapture(late);
      await pending;
      navigator.mediaDevices.getUserMedia = originalCapture;
    });
    assert(
      await page.evaluate(
        () =>
          !s.getState().inVoiceCall &&
          e.rawMicStream === null &&
          late.getTracks().every((t) => t.readyState === "ended"),
      ),
    );
    await page.evaluate(() => e.leaveRoom());
    console.log(
      "PASS high-frequency overdrive/PCM bounded without call loss; gate failure bypass; capture restart replaces track without closing peer; repeated/failed recovery retried with bounded backoff; muted-track watchdog reconnects while brief mutes are ignored; leave cancels late capture. Synthetic audio and mocked RTP sender; no physical two-device test.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
