const { chromium } = require("playwright"),
  assert = require("node:assert/strict");
(async () => {
  const b = await chromium.launch({
    args: [
      "--no-sandbox",
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
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
      window.m = (await import("/src/lib/mediaState.ts")).useMediaState;
    });
    await p.waitForFunction(() => !!e.localPeer);
    await p.evaluate(async () => {
      e.leaveRoom();
      window.online = true;
      Object.defineProperty(navigator, "onLine", {
        configurable: true,
        get: () => online,
      });
      window.peers = [];
      window.calls = [];
      class Events {
        constructor() {
          this.events = {};
        }
        on(k, fn) {
          (this.events[k] ||= []).push(fn);
        }
        emit(k, v) {
          for (const fn of this.events[k] || []) fn(v);
        }
      }
      window.Data = class extends Events {
        constructor(peer) {
          super();
          this.peer = peer;
          this.open = false;
        }
        send() {}
        close() {
          this.open = false;
          this.emit("close");
        }
      };
      window.makeCall = () => {
        const call = new Events();
        call.closed = false;
        call.peer = "cbshub-v2-hotfix-p-remote";
        call.peerConnection = {
          connectionState: "connected",
          iceConnectionState: "connected",
          signalingState: "stable",
          getSenders: () => [],
          getReceivers: () => [],
          getStats: async () =>
            new Map([
              [
                "in",
                {
                  type: "inbound-rtp",
                  kind: "audio",
                  packetsReceived: window.rx,
                  packetsLost: 0,
                },
              ],
              [
                "out",
                { type: "outbound-rtp", kind: "audio", bytesSent: window.tx },
              ],
            ]),
          setLocalDescription: async () => {},
          setRemoteDescription: async () => {},
        };
        call.close = () => {
          if (call.closed) return;
          call.closed = true;
          call.emit("close");
        };
        calls.push(call);
        return call;
      };
      e.createSignalingPeer = (id) => {
        const peer = new Events();
        Object.assign(peer, {
          id,
          open: false,
          disconnected: false,
          destroyed: false,
          retries: 0,
          connect(target) {
            const conn = new Data(target);
            if (window.autoDirectory && target.endsWith("-beacon"))
              setTimeout(() => {
                conn.open = true;
                conn.emit("open");
                conn.emit("data", { type: "directory_response", peers: [] });
              }, 0);
            return conn;
          },
          call() {
            return makeCall();
          },
          reconnect() {
            this.retries++;
            this.disconnected = false;
          },
          destroy() {
            this.destroyed = true;
            this.open = false;
            this.emit("close");
          },
        });
        peers.push(peer);
        return peer;
      };
      e.currentRoomSlug = "hotfix";
      s.getState().setRoomId("hotfix");
      e.openRoomPeer("hotfix", false);
      window.localPeer = e.localPeer;
      localPeer.open = true;
      localPeer.emit("open", localPeer.id);
      window.beacon = e.beaconPeer;
      beacon.open = true;
      beacon.emit("open", beacon.id);
      window.remote = {
        peerId: "cbshub-v2-hotfix-p-remote",
        clientId: "remote-client",
        nickname: "Remoto",
        avatarColor: "#6eddbd",
        inVoiceCall: true,
        isLocal: false,
        isMuted: false,
        isDeafened: false,
        isSpeaking: false,
        isWebcamActive: false,
        isScreenSharing: false,
      };
      s.getState().setParticipants({
        ...s.getState().participants,
        [remote.peerId]: remote,
      });
      window.data = new Data(remote.peerId);
      e.setupDataConnection(data, remote.clientId);
      data.open = true;
      data.emit("open");
      window.session = e.sessions.get(remote.peerId);
      window.rx = 10;
      window.tx = 100;
      await e.joinVoiceCall();
      session.voiceCall.emit("stream", e.audioPipeline.getProcessedStream());
      e.toggleMute(true);
      e.toggleDeafen(true);
    });
    await p.clock.runFor(2000);
    await p.evaluate(() => {
      online = false;
      e.notifyNetwork(false);
      localPeer.open = false;
      localPeer.disconnected = true;
      localPeer.emit("disconnected");
      beacon.open = false;
      beacon.disconnected = true;
      beacon.emit("disconnected");
    });
    await p.clock.runFor(3500);
    assert.equal(await p.evaluate(() => m.getState().reconnecting), true);
    await p.evaluate(() => {
      online = true;
      e.notifyNetwork(true);
    });
    await p.clock.runFor(1500);
    assert.equal(await p.evaluate(() => localPeer.retries), 1);
    await p.evaluate(() => {
      localPeer.open = true;
      localPeer.emit("open", localPeer.id);
    });
    assert.equal(
      await p.evaluate(() => beacon.retries),
      1,
      "old owner beacon must reconnect",
    );
    assert.equal(
      await p.evaluate(() => m.getState().reconnecting),
      true,
      "socket open must not finish discovery/media recovery",
    );
    await p.evaluate(() => {
      beacon.open = true;
      beacon.emit("open", beacon.id);
      window.query = e.directoryConn;
      query.open = true;
      query.emit("open");
      query.emit("data", { type: "directory_response", peers: [] });
    });
    await p.clock.runFor(2200);
    assert.equal(await p.evaluate(() => m.getState().recoveryPhase), "media");
    assert.equal(
      await p.evaluate(() => m.getState().reconnecting),
      true,
      "unchanged cumulative RTP counters are not recovered media",
    );
    assert.equal(
      await p.evaluate(() => beacon.events.connection.length),
      1,
      "re-open must not duplicate connection listeners",
    );
    await p.evaluate(() => {
      window.oldCall = session.voiceCall;
      window.autoDirectory = true;
    });
    await p.clock.runFor(16000);
    assert.equal(
      await p.evaluate(
        () => !!session.voiceCall && session.voiceCall !== oldCall,
      ),
      true,
    );
    await p.evaluate(() => {
      rx += 10;
      tx += 100;
      session.voiceCall.emit("stream", e.audioPipeline.getProcessedStream());
    });
    await p.clock.runFor(2200);
    assert.equal(await p.evaluate(() => m.getState().reconnecting), false);
    assert.equal(
      await p.evaluate(() => m.getState().quality[session.peerId].flowing),
      true,
    );
    assert.equal(
      await p.evaluate(
        () =>
          s.getState().isMuted &&
          s.getState().isDeafened &&
          e.rawMicStream.active,
      ),
      true,
      "mute/deafen/capture preserved",
    );
    await p.evaluate(() => {
      const before = e.sessions.size;
      query.emit("data", {
        type: "directory_response",
        peers: [{ peerId: "cbshub-v2-other-p-injection", clientId: "x" }],
      });
      if (e.sessions.size !== before)
        throw Error("obsolete directory packet applied");
      online = false;
      e.notifyNetwork(false);
    });
    await p.clock.runFor(180000);
    assert.equal(
      await p.evaluate(
        () =>
          m.getState().recoveryPhase === "failed" &&
          !m.getState().reconnecting &&
          e.recoveryTimer === null,
      ),
      true,
    );
    await p.clock.runFor(10000);
    assert.equal(
      await p.evaluate(() => m.getState().reconnecting),
      false,
      "stats ticks must not re-enter endless recovering after exhaustion",
    );
    await p.evaluate(() => {
      e.cancelRecovery();
      online = true;
      e.notifyNetwork(true);
    });
    assert.equal(await p.evaluate(() => e.recoveryTimer === null), true);
    await p.evaluate(() => {
      e.leaveVoiceCall();
      e.leaveRoom();
      query.emit("open");
      query.emit("data", { type: "directory_response", peers: [] });
    });
    await p.clock.runFor(30000);
    assert.equal(
      await p.evaluate(
        () =>
          !s.getState().inVoiceCall &&
          e.sessions.size === 0 &&
          e.directoryTimer === null &&
          e.recoveryTimer === null,
      ),
      true,
    );
    console.log(
      "PASS controlled short/long outage, beacon owner recovery, directory ACK before ready, fresh RTP counters before media confirmation, failed media rebuild, mute/deafen/capture preservation, bounded exhaustion and cancelled/obsolete callbacks. Adapters, not real remote audio transport.",
    );
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
