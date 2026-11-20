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
    await page.route("**/*", (r) =>
      new URL(r.request().url()).hostname === "127.0.0.1"
        ? r.continue()
        : r.abort(),
    );
    await page.goto("http://127.0.0.1:5173");
    await page.getByRole("textbox", { name: /Mensagem para/ }).waitFor();
    await page.evaluate(async () => {
      window.e = (await import("/src/lib/webrtcEngine.ts")).webrtcEngine;
      window.s = (await import("/src/store/useHubStore.ts")).useHubStore;
      window.m = (await import("/src/lib/mediaState.ts")).useMediaState;
      window.sb = (
        await import("/src/lib/soundboardEngine.ts")
      ).soundboardEngine;
    });
    await page.waitForFunction(() => !!e.localPeer && e.roomGeneration >= 3);
    await page.evaluate(async () => {
      const old = e.localPeer;
      window.sent = [];
      window.calls = [];
      const local = Object.values(s.getState().participants).find(
        (p) => p.isLocal,
      );
      window.makeCall = (channel, stream) => {
        const handlers = {};
        const call = {
          peer: "remote-test",
          metadata: { channel },
          closed: false,
          stream,
          peerConnection: {
            connectionState: "connected",
            getSenders: () => [],
            getReceivers: () => [],
            getStats: async () =>
              new Map([
                [
                  "pair",
                  {
                    type: "candidate-pair",
                    state: "succeeded",
                    nominated: true,
                    currentRoundTripTime: 0.035,
                  },
                ],
                [
                  "audio",
                  {
                    type: "inbound-rtp",
                    kind: "audio",
                    packetsReceived: 100,
                    packetsLost: 2,
                  },
                ],
              ]),
            setLocalDescription: async () => {},
            setRemoteDescription: async () => {},
          },
          on(key, fn) {
            (handlers[key] ||= []).push(fn);
          },
          answer(value) {
            this.answered = value;
          },
          emit(key, value) {
            for (const fn of handlers[key] || []) fn(value);
          },
          close() {
            if (this.closed) return;
            this.closed = true;
            this.emit("close");
          },
        };
        calls.push(call);
        return call;
      };
      e.localPeer = {
        id: local.peerId,
        destroyed: false,
        open: true,
        disconnected: false,
        call: (peer, stream, options) =>
          makeCall(options.metadata.channel, stream),
        destroy() {},
        connect() {
          return { on() {} };
        },
      };
      old.destroy();
      if (e.recoveryTimer !== null) clearTimeout(e.recoveryTimer);
      e.recoveryTimer = null;
      await e.joinVoiceCall();
      window.session = {
        peerId: "remote-test",
        clientId: "remote-client",
        nickname: "Participante",
        dataConn: {
          open: true,
          send: (packet) => sent.push(packet),
          close() {},
        },
        voiceCall: null,
        webcamCall: null,
        screenCall: null,
        remoteSpeakingInterval: null,
      };
      e.sessions.set(session.peerId, session);
      window.remote = {
        peerId: session.peerId,
        clientId: session.clientId,
        nickname: session.nickname,
        avatarColor: "#6eddbd",
        inVoiceCall: true,
        isMuted: false,
        isDeafened: false,
        isSpeaking: false,
        isWebcamActive: false,
        isScreenSharing: false,
      };
      s.getState().setParticipants({
        ...s.getState().participants,
        [session.peerId]: { ...remote, isLocal: false },
      });
      e.initiateVoiceCallWithPeer(session);
      session.voiceCall.emit("stream", e.audioPipeline.getProcessedStream());
    });
    await page.waitForFunction(
      () => m.getState().quality["remote-test"]?.rttMs === 35,
    );
    assert.equal(
      await page.evaluate(
        () => Math.abs(m.getState().quality["remote-test"].loss - 2) < 0.1,
      ),
      true,
    );
    await page.evaluate(() => e.setPeerVolume("remote-client", 0.4));
    assert.equal(await page.evaluate(() => session.voiceAudioEl.volume), 0.4);
    await page.evaluate(() => e.toggleDeafen(true));
    assert.equal(await page.evaluate(() => session.voiceAudioEl.muted), true);
    await page.evaluate(() => e.toggleDeafen(false));
    // Measure actual pipeline output, independent of simulated connection/stats above.
    await page.evaluate(() => {
      e.toggleMute(true);
      window.ctx = e.audioPipeline.getAudioContext();
      window.an = ctx.createAnalyser();
      an.fftSize = 2048;
      ctx
        .createMediaStreamSource(e.audioPipeline.getProcessedStream())
        .connect(an);
      window.rms = () => {
        const d = new Float32Array(an.fftSize);
        an.getFloatTimeDomainData(d);
        return Math.sqrt(d.reduce((v, x) => v + x * x, 0) / d.length);
      };
    });
    await page.waitForFunction(() => rms() < 0.001);
    await page.evaluate(() =>
      sb.playClip(
        s
          .getState()
          .soundboardClips.find((c) => c.id === "builtin-sad_trombone"),
        true,
      ),
    );
    assert.equal(
      await page.evaluate(() => rms() < 0.001),
      true,
      "preview must not inject into voice",
    );
    await page.evaluate(() => {
      sb.stopAll();
      return sb.playClip(
        s
          .getState()
          .soundboardClips.find((c) => c.id === "builtin-sad_trombone"),
      );
    });
    await page.waitForFunction(() => rms() > 0.005);
    await page.evaluate(() => e.toggleDeafen(true));
    assert.equal(
      await page.evaluate(() =>
        [...sb.monitorGains.values()].every((g) => g.gain.value === 0),
      ),
      true,
      "deafen must affect running local sounds",
    );
    await page.evaluate(() => sb.stopAll());
    await page.waitForFunction(() => rms() < 0.001);
    console.log(
      "PASS actual WebAudio mic mute / soundboard bypass / preview isolation / running deafen / stopAll; simulated peer volume/stats",
    );
    // Both directions use independent handles. Actual synthetic video stream; simulated calls.
    await page.evaluate(async () => {
      await e.toggleWebcam();
      window.outgoing = session.outgoingWebcam;
      window.incoming = makeCall("webcam");
      e.handleIncomingMediaCall(incoming);
      incoming.emit(
        "stream",
        await navigator.mediaDevices.getUserMedia({ video: true }),
      );
      await e.toggleWebcam();
    });
    assert.equal(
      await page.evaluate(
        () =>
          outgoing.closed &&
          !incoming.closed &&
          session.webcamCall === incoming,
      ),
      true,
    );
    // A late voice member receives the active camera through state sync.
    await page.evaluate(async () => {
      s.getState().updateParticipant(session.peerId, { inVoiceCall: false });
      await e.toggleWebcam();
      e.handleIncomingSignalingPacket(session, {
        type: "peer_state_sync",
        state: remote,
      });
    });
    assert.equal(await page.evaluate(() => !!session.outgoingWebcam), true);
    await page.evaluate(async () => {
      navigator.mediaDevices.getDisplayMedia = () =>
        navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      await e.startScreenShare("", s.getState().videoQualityConfig);
      window.screenOut = session.outgoingScreen;
      window.screenIn = makeCall("screen");
      e.handleIncomingMediaCall(screenIn);
      screenIn.emit(
        "stream",
        await navigator.mediaDevices.getUserMedia({ video: true, audio: true }),
      );
      e.stopScreenShare();
    });
    assert.equal(
      await page.evaluate(
        () =>
          screenOut.closed &&
          !screenIn.closed &&
          session.screenCall === screenIn,
      ),
      true,
    );
    await page.waitForFunction(() =>
      [...document.querySelectorAll("video")].every((v) => v.muted),
    );
    console.log(
      "PASS synthetic camera/screen independent directions, late camera participant and screen deafen (call adapter)",
    );
    await page.evaluate(() => {
      window.oldCall = session.voiceCall;
      oldCall.peerConnection.connectionState = "failed";
    });
    await page.waitForFunction(
      () => session.voiceCall && session.voiceCall !== oldCall,
      {},
      { timeout: 10000 },
    );
    assert.equal(await page.evaluate(() => oldCall.closed), true);
    // Signaling retry uses backoff and is cancelled on room teardown.
    await page.evaluate(() => {
      e.localPeer.disconnected = true;
      window.retries = 0;
      e.localPeer.reconnect = () => {
        retries++;
        e.localPeer.disconnected = false;
      };
      e.retryConnection();
    });
    await page.waitForFunction(() => retries === 1);
    await page.evaluate(() => {
      window.detector = session.voiceAudioCtx;
      e.leaveVoiceCall();
    });
    await page.waitForFunction(() => !detector || detector.state === "closed");
    assert.equal(
      await page.evaluate(
        () =>
          !session.voiceAudioEl &&
          e.sessions.size === 1 &&
          !s.getState().inVoiceCall,
      ),
      true,
    );
    await page.evaluate(() => {
      e.leaveRoom();
    });
    assert.equal(
      await page.evaluate(
        () => e.recoveryTimer === null && e.localPeer === null,
      ),
      true,
    );
    console.log(
      "PASS injected media failure retries, signaling retry, teardown cancels recovery and closes audio contexts; chat session preserved on voice exit",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
