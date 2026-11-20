// Real RTCPeerConnections/ICE on localhost, two isolated browser contexts.
// A minimal MediaConnection adapter replaces PeerJS cloud signaling only.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: [
      "--no-sandbox",
      "--disable-features=WebRtcHideLocalIpsWithMdns",
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
  const errors = [];
  async function create() {
    const context = await browser.newContext(),
      p = await context.newPage();
    p.on("pageerror", (err) => {
      errors.push(err.message);
      console.log("PAGE ERROR", err.message);
    });
    p.on("console", (msg) => {
      if (msg.text().startsWith("TEST")) console.log(msg.text());
    });
    await p.route("**/*", (r) =>
      new URL(r.request().url()).hostname === "127.0.0.1"
        ? r.continue()
        : r.abort(),
    );
    await p.goto("http://127.0.0.1:5173");
    await p.waitForFunction(async () => {
      const { webrtcEngine } = await import("/src/lib/webrtcEngine.ts");
      return !!webrtcEngine.localPeer && webrtcEngine.roomGeneration >= 3;
    });
    await p.evaluate(async () => {
      window.e = (await import("/src/lib/webrtcEngine.ts")).webrtcEngine;
      window.s = (await import("/src/store/useHubStore.ts")).useHubStore;
      window.sb = (
        await import("/src/lib/soundboardEngine.ts")
      ).soundboardEngine;
      window.m = (await import("/src/lib/mediaState.ts")).useMediaState;
      while (!e.localPeer)
        await new Promise((resolve) => setTimeout(resolve, 25));
      window.calls = [];
      window.makeCall = (channel, stream) => {
        const pc = new RTCPeerConnection({ iceServers: [] }),
          handlers = {};
        const call = {
          peer: window.remote.peerId,
          metadata: { channel },
          peerConnection: pc,
          closed: false,
          on(event, handler) {
            (handlers[event] ||= []).push(handler);
          },
          answer(stream) {
            if (stream)
              stream.getTracks().forEach((t) => pc.addTrack(t, stream));
          },
          close() {
            if (this.closed) return;
            this.closed = true;
            pc.close();
            (handlers.close || []).forEach((f) => f());
          },
        };
        pc.ontrack = (event) =>
          (handlers.stream || []).forEach((f) => f(event.streams[0]));
        if (stream) stream.getTracks().forEach((t) => pc.addTrack(t, stream));
        calls.push(call);
        return call;
      };
      const local = Object.values(s.getState().participants).find(
        (p) => p.isLocal,
      );
      const old = e.localPeer;
      e.localPeer = {
        id: local.peerId,
        destroyed: false,
        call: (peer, stream, options) =>
          makeCall(options.metadata.channel, stream),
        destroy() {},
      };
      old.destroy();
      if (e.recoveryTimer !== null) clearTimeout(e.recoveryTimer);
      e.recoveryTimer = null;
      await e.joinVoiceCall();
    });
    return p;
  }
  async function identity(p) {
    return p.evaluate(() => ({
      ...s.getState().participants[e.localPeer.id],
      inVoiceCall: true,
    }));
  }
  async function bind(p, remote) {
    await p.evaluate((remote) => {
      window.remote = remote;
      window.session = {
        peerId: remote.peerId,
        clientId: remote.clientId,
        nickname: remote.nickname,
        dataConn: { open: true, send() {}, close() {} },
        voiceCall: null,
        webcamCall: null,
        screenCall: null,
        remoteSpeakingInterval: null,
      };
      e.sessions.set(remote.peerId, session);
      s.getState().setParticipants({
        ...s.getState().participants,
        [remote.peerId]: { ...remote, isLocal: false },
      });
    }, remote);
  }
  async function connect(a, b, channel) {
    const index = await a.evaluate(
      (channel) =>
        calls.findLastIndex((c) => c.metadata.channel === channel && !c.closed),
      channel,
    );
    assert(index >= 0);
    const offer = await a.evaluate(async (index) => {
      const pc = calls[index].peerConnection;
      await pc.setLocalDescription(await pc.createOffer());
      await new Promise((resolve) => {
        if (pc.iceGatheringState === "complete") resolve();
        else
          pc.onicegatheringstatechange = () => {
            if (pc.iceGatheringState === "complete") resolve();
          };
      });
      return pc.localDescription.toJSON();
    }, index);
    const answer = await b.evaluate(
      async ({ channel, offer }) => {
        const call = makeCall(channel);
        window.lastIncoming = call;
        const pc = call.peerConnection;
        e.handleIncomingMediaCall(call);
        await pc.setRemoteDescription(offer);
        await pc.setLocalDescription(await pc.createAnswer());
        await new Promise((resolve) => {
          if (pc.iceGatheringState === "complete") resolve();
          else
            pc.onicegatheringstatechange = () => {
              if (pc.iceGatheringState === "complete") resolve();
            };
        });
        return pc.localDescription.toJSON();
      },
      { channel, offer },
    );
    await a.evaluate(
      async ({ index, answer }) =>
        calls[index].peerConnection.setRemoteDescription(answer),
      { index, answer },
    );
    const candidateCount = await a.evaluate(
      (index) =>
        calls[index].peerConnection.localDescription.sdp
          .split("\r\n")
          .filter((line) => line.startsWith("a=candidate")).length,
      index,
    );
    if (!candidateCount)
      throw new Error(
        "BLOCKED: Chromium não disponibilizou candidatos ICE locais. Transporte entre dispositivos NÃO validado.",
      );
    await a.waitForFunction(
      (index) => calls[index].peerConnection.connectionState === "connected",
      index,
      { timeout: 12000 },
    );
    await b.waitForFunction(
      () => lastIncoming.peerConnection.connectionState === "connected",
    );
  }
  try {
    const a = await create(),
      b = await create();
    await bind(a, await identity(b));
    await bind(b, await identity(a));
    await a.evaluate(() => e.initiateVoiceCallWithPeer(session));
    await connect(a, b, "voice");
    await a.waitForFunction(
      () => !!s.getState().remoteStreams[remote.peerId]?.voice,
    );
    await b.waitForFunction(() => !!session.voiceAudioEl?.srcObject);
    await a.waitForFunction(
      () => m.getState().quality[remote.peerId]?.state === "connected",
    );
    const packets = await a.evaluate(async () => {
      let n = 0;
      (await session.voiceCall.peerConnection.getStats()).forEach((r) => {
        if (r.type === "outbound-rtp") n += r.packetsSent || 0;
      });
      return n;
    });
    assert(packets > 0);
    await b.evaluate(() => e.setPeerVolume(remote.clientId, 0.35));
    assert.equal(await b.evaluate(() => session.voiceAudioEl.volume), 0.35);
    await b.evaluate(() => e.toggleDeafen(true));
    assert.equal(await b.evaluate(() => session.voiceAudioEl.muted), true);
    await b.evaluate(() => e.toggleDeafen(false));
    // Real received signal while source mic is muted: soundboard bypasses gate.
    await a.evaluate(() => {
      e.toggleMute(true);
      sb.stopAll();
    });
    await b.evaluate(() => {
      window.measureCtx = new AudioContext();
      window.an = measureCtx.createAnalyser();
      an.fftSize = 2048;
      measureCtx
        .createMediaStreamSource(
          s.getState().remoteStreams[remote.peerId].voice,
        )
        .connect(an);
      window.rms = () => {
        const data = new Float32Array(an.fftSize);
        an.getFloatTimeDomainData(data);
        return Math.sqrt(data.reduce((v, x) => v + x * x, 0) / data.length);
      };
    });
    await b.waitForFunction(() => rms() < 0.001);
    await a.evaluate(() =>
      sb.playClip(
        s
          .getState()
          .soundboardClips.find((c) => c.id === "builtin-sad_trombone"),
      ),
    );
    await b.waitForFunction(() => rms() > 0.005);
    await a.evaluate(() => sb.stopAll());
    await b.waitForFunction(() => rms() < 0.001);
    console.log(
      "PASS real local WebRTC voice/packets/stats, volume/deafen and soundboard received with mic muted",
    );
    await a.evaluate(() => e.toggleWebcam());
    await connect(a, b, "webcam");
    await b.evaluate(() => e.toggleWebcam());
    await connect(b, a, "webcam");
    await a.waitForFunction(
      () =>
        s.getState().remoteStreams[remote.peerId]?.webcam?.getVideoTracks()[0]
          ?.readyState === "live",
    );
    const received = await a.evaluate(() => {
      window.receivedWebcam = session.webcamCall;
      return receivedWebcam.peerConnection.connectionState;
    });
    assert.equal(received, "connected");
    await a.evaluate(() => e.toggleWebcam());
    assert.equal(
      await a.evaluate(
        () =>
          !s.getState().isWebcamActive &&
          session.webcamCall === receivedWebcam &&
          !receivedWebcam.closed,
      ),
      true,
      "stopping local webcam must preserve incoming webcam",
    );
    console.log(
      "PASS simultaneous webcam directions and independent local stop",
    );
    // Existing screen pipeline with synthetic display stream (not OS picker).
    for (const p of [a, b])
      await p.evaluate(() => {
        navigator.mediaDevices.getDisplayMedia = async () =>
          navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        return e.startScreenShare("", s.getState().videoQualityConfig);
      });
    await connect(a, b, "screen");
    await connect(b, a, "screen");
    await a.evaluate(() => {
      window.incomingScreen = session.screenCall;
      e.stopScreenShare();
    });
    assert.equal(
      await a.evaluate(
        () =>
          !s.getState().isScreenSharing &&
          session.screenCall === incomingScreen &&
          !incomingScreen.closed,
      ),
      true,
    );
    await a.evaluate(() => e.toggleDeafen(true));
    await a.waitForFunction(() =>
      [...document.querySelectorAll("video")].every((v) => v.muted),
    );
    console.log(
      "PASS simultaneous synthetic screen directions, independent stop and deafen on screen elements",
    );
    // Failure state drives existing retry path; renegotiate real local media afterwards.
    await a.evaluate(() => {
      Object.defineProperty(
        session.voiceCall.peerConnection,
        "connectionState",
        { get: () => "failed" },
      );
      window.beforeCalls = calls.length;
    });
    await a.waitForFunction(
      () => calls.length > beforeCalls && !!session.voiceCall,
      {},
      { timeout: 10000 },
    );
    await b.evaluate(() => session.voiceCall?.close());
    await connect(a, b, "voice");
    await a.waitForFunction(
      () => session.voiceCall.peerConnection.connectionState === "connected",
    );
    console.log(
      "PASS failed-state recovery + real local renegotiation (failure injected; no physical network outage)",
    );
    await a.evaluate(() => {
      window.ctx = session.voiceAudioCtx;
      e.leaveVoiceCall();
    });
    await a.waitForFunction(() => !ctx || ctx.state === "closed");
    assert.equal(
      await a.evaluate(
        () =>
          !session.voiceAudioEl &&
          e.sessions.size === 1 &&
          !s.getState().inVoiceCall,
      ),
      true,
    );
    await b.evaluate(() => e.leaveVoiceCall());
    assert.deepEqual(errors, []);
    console.log("PASS media teardown keeps data session; no browser errors");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
