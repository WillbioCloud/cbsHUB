const { chromium } = require("playwright"),
  assert = require("node:assert/strict");
(async () => {
  const b = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: [
      "--no-sandbox",
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  });
  try {
    const p = await b.newPage();
    await p.clock.install();
    await p.route("**/*", (r) =>
      new URL(r.request().url()).hostname === "127.0.0.1"
        ? r.continue()
        : r.abort(),
    );
    await p.goto("http://127.0.0.1:5173");
    await p.getByRole("textbox", { name: /Mensagem para/ }).waitFor();
    await p.evaluate(async () => {
      window.e = (await import("/src/lib/webrtcEngine.ts")).webrtcEngine;
      window.s = (await import("/src/store/useHubStore.ts")).useHubStore;
    });
    await p.waitForFunction(() => !!e.localPeer);
    await p.evaluate(async () => {
      e.cancelRecovery();
      window.video = await navigator.mediaDevices.getUserMedia({ video: true });
      window.pc = { getStats: async () => new Map() };
      e.startReceiverStats(pc, video, "peer-A");
    });
    await p.clock.runFor(1500);
    assert.deepEqual(
      await p.evaluate(() => ({
        fps: s.getState().telemetry.fps,
        rtt: s.getState().telemetry.rttMs,
        loss: s.getState().telemetry.lossMeasured,
        bitrate: s.getState().telemetry.bitrateMeasured,
      })),
      { fps: 0, rtt: 0, loss: false, bitrate: false },
      "missing stats must never become 60FPS/18ms/zero measured loss",
    );
    await p.evaluate(() => {
      pc.getStats = async () =>
        new Map([
          [
            "video",
            {
              type: "inbound-rtp",
              kind: "video",
              framesPerSecond: 24,
              bytesReceived: 48000,
              packetsLost: 2,
              packetsReceived: 98,
            },
          ],
          [
            "pair",
            {
              type: "candidate-pair",
              state: "succeeded",
              currentRoundTripTime: 0.041,
            },
          ],
        ]);
    });
    await p.clock.runFor(1500);
    assert.equal(await p.evaluate(() => s.getState().telemetry.rttMs), 41);
    assert.equal(await p.evaluate(() => s.getState().telemetry.fps), 24);
    assert.equal(
      await p.evaluate(() => s.getState().telemetry.sourcePeerId),
      "peer-A",
    );
    await p.evaluate(() => {
      const local = Object.values(s.getState().participants).find(
        (p) => p.isLocal,
      );
      s.getState().setParticipants({
        ...s.getState().participants,
        "peer-A": {
          ...local,
          peerId: "peer-A",
          clientId: "client-A",
          nickname: "Participante A",
          isLocal: false,
          isScreenSharing: true,
          inVoiceCall: true,
        },
        "peer-B": {
          ...local,
          peerId: "peer-B",
          clientId: "client-B",
          nickname: "Participante B",
          isLocal: false,
          isScreenSharing: true,
          inVoiceCall: true,
        },
      });
      s.getState().setRemoteStream("peer-A", "screen", video);
      s.getState().setRemoteStream("peer-B", "screen", video);
      s.getState().setInVoiceCall(true);
      s.getState().setFocusedPeerStreamKey("screen-peer-B");
      s.getState().setCallStageMode("spotlight");
    });
    await p.clock.runFor(1600);
    assert.equal(
      await p.locator('[data-stream-metrics="peer-A"]').count(),
      0,
      "A metrics must not appear on B spotlight",
    );
    await p.evaluate(() => {
      e.sessions.set("peer-B", {
        peerId: "peer-B",
        clientId: "client-B",
        dataConn: { open: true, close() {} },
        voiceCall: null,
        webcamCall: null,
        screenCall: {
          peerConnection: {
            getStats: async () =>
              new Map([
                [
                  "pair",
                  {
                    type: "candidate-pair",
                    state: "succeeded",
                    currentRoundTripTime: 0.077,
                  },
                ],
              ]),
          },
          close() {},
        },
        remoteSpeakingInterval: null,
      });
      e.observeScreenTelemetry("peer-B");
    });
    await p.clock.runFor(1500);
    await p.locator('[data-stream-metrics="peer-B"]').waitFor();
    await p.clock.runFor(1600);
    assert.equal(
      await p.evaluate(() => s.getState().telemetry.sourcePeerId),
      "peer-B",
      "unfocused producer cannot overwrite current spotlight",
    );
    await p.evaluate(() => {
      s.getState().setCallStageMode("grid");
      pc.getStats = () =>
        new Promise((resolve) => {
          window.resolveOld = resolve;
        });
      e.startReceiverStats(pc, video, "peer-A");
    });
    await p.clock.runFor(1500);
    await p.evaluate(() => {
      e.startReceiverStats(
        {
          getStats: async () =>
            new Map([
              [
                "pair",
                {
                  type: "candidate-pair",
                  state: "succeeded",
                  currentRoundTripTime: 0.055,
                },
              ],
            ]),
        },
        video,
        "peer-B",
      );
    });
    await p.clock.runFor(1500);
    await p.evaluate(() =>
      resolveOld(
        new Map([
          [
            "pair",
            {
              type: "candidate-pair",
              state: "succeeded",
              currentRoundTripTime: 0.999,
            },
          ],
        ]),
      ),
    );
    assert.equal(
      await p.evaluate(() => s.getState().telemetry.sourcePeerId),
      "peer-B",
    );
    assert.equal(
      await p.evaluate(() => s.getState().telemetry.rttMs),
      55,
      "late stats from obsolete PC must be ignored",
    );
    await p.evaluate(() => {
      e.stopReceiverStats();
      s.getState().setScreenSharing(true);
      e.startAbrLoop(
        { getStats: async () => new Map() },
        {},
        s.getState().videoQualityConfig,
        "peer-A",
      );
    });
    await p.clock.runFor(9000);
    assert.equal(
      await p.evaluate(() => e.consecutiveGoodCycles),
      0,
      "unknown network does not count as good ABR cycles",
    );
    assert.equal(await p.evaluate(() => s.getState().telemetry.fps), 0);
    assert.equal(await p.evaluate(() => s.getState().telemetry.rttMs), 0);
    await p.evaluate(() => {
      e.leaveRoom();
      video.getTracks().forEach((t) => t.stop());
    });
    console.log(
      "PASS stream telemetry without invented FPS/RTT; scoped peer/spotlight; stale async stats ignored; unknown stats do not drive ABR recovery. Controlled adapters only.",
    );
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
