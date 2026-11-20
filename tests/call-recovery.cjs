const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    args: [
      "--no-sandbox",
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
  try {
    const context = await browser.newContext({
      permissions: ["clipboard-read", "clipboard-write"],
    });
    const page = await context.newPage();
    await page.clock.install();
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
      window.d = await import("/src/lib/callDiagnostics.ts");
    });
    await page.waitForFunction(() => !!e.localPeer);
    await page.evaluate(async () => {
      const original = e.localPeer;
      e.localPeer = {
        id: "a-local",
        destroyed: false,
        open: true,
        disconnected: false,
        destroy() {},
        connect() {
          return makeData();
        },
        call() {
          return makeCall();
        },
      };
      original.destroy();
      e.cancelRecovery();
      await e.joinVoiceCall();
      window.makeData = () => {
        const handlers = {};
        return {
          peer: "z-remote",
          open: false,
          on(key, fn) {
            (handlers[key] ||= []).push(fn);
          },
          emit(key, value) {
            for (const fn of handlers[key] || []) fn(value);
          },
          send() {},
          close() {
            this.open = false;
            this.emit("close");
          },
        };
      };
      window.makeCall = () => {
        const handlers = {};
        return {
          peer: "z-remote",
          metadata: { channel: "voice" },
          closed: false,
          peerConnection: {
            connectionState: "connected",
            iceConnectionState: "connected",
            signalingState: "stable",
            getSenders: () => [],
            getReceivers: () => [],
            getStats: async () => {
              throw Error("stats unavailable");
            },
            setLocalDescription: async () => {},
            setRemoteDescription: async () => {},
          },
          on(key, fn) {
            (handlers[key] ||= []).push(fn);
          },
          close() {
            if (this.closed) return;
            this.closed = true;
            for (const fn of handlers.close || []) fn();
          },
        };
      };
      s.getState().setParticipants({
        ...s.getState().participants,
        "z-remote": {
          peerId: "z-remote",
          clientId: "remote-client",
          nickname: "Remote",
          inVoiceCall: true,
          isLocal: false,
        },
      });
      window.data = makeData();
      e.setupDataConnection(data, "remote-client");
      data.open = true;
      data.emit("open");
      window.session = e.sessions.get("z-remote");
      e.initiateVoiceCallWithPeer(session);
      window.voice = session.voiceCall;
      data.close();
    });
    assert.equal(
      await page.evaluate(
        () =>
          e.sessions.get("z-remote") === session &&
          session.voiceCall === voice &&
          !voice.closed &&
          s.getState().inVoiceCall,
      ),
      true,
      "data close must preserve healthy voice and session",
    );
    await page.clock.runFor(16000);
    assert.equal(
      await page.evaluate(() => session.voiceCall === voice && !voice.closed),
      true,
      "connected media survives data grace expiry",
    );
    await page.evaluate(() => {
      window.replacement = makeData();
      e.setupDataConnection(replacement);
      replacement.open = true;
      replacement.emit("open");
      data.emit("close");
    });
    assert.equal(
      await page.evaluate(
        () =>
          e.sessions.get("z-remote") === session &&
          session.dataConn === replacement &&
          !voice.closed,
      ),
      true,
      "data replacement must reuse media session and ignore stale events",
    );
    await page.evaluate(() => {
      voice.peerConnection.connectionState = "disconnected";
      voice.peerConnection.iceConnectionState = "disconnected";
    });
    await page.clock.runFor(6000);
    assert.equal(
      await page.evaluate(() => voice.closed),
      false,
      "transient disconnect is not failure",
    );
    await page.evaluate(() => {
      voice.peerConnection.connectionState = "connected";
    });
    await page.clock.runFor(2000);
    assert.equal(await page.evaluate(() => voice.closed), false);
    await page.evaluate(() => {
      voice.peerConnection.connectionState = "failed";
    });
    await page.clock.runFor(2000);
    assert.equal(
      await page.evaluate(() => voice.closed),
      true,
      "failure is detected even if getStats rejects",
    );
    await page.clock.runFor(1000);
    assert.equal(
      await page.evaluate(
        () => !!session.voiceCall && session.voiceCall !== voice,
      ),
      true,
      "failed call retries",
    );
    await page.evaluate(() => {
      e.cancelRecovery();
      session.voiceRetryAttempts = 6;
      session.voiceCall.close();
      e.recoveryCancelled = false;
      e.scheduleVoiceRetry(session);
    });
    assert.equal(
      await page.evaluate(
        () => session.voiceRetryAttempts === 7 && !session.voiceRetryTimer,
      ),
      true,
      "retry limit must terminate",
    );
    await page.evaluate(() => e.initiateVoiceCallWithPeer(session));
    assert.equal(
      await page.evaluate(() => session.voiceCall),
      null,
      "state sync cannot bypass retry exhaustion",
    );
    await page.evaluate(() => {
      e.retryConnection();
    });
    assert.equal(
      await page.evaluate(() => !!session.voiceRetryTimer),
      true,
      "manual retry resets limit",
    );
    await page.evaluate(() => e.cancelRecovery());
    await page.clock.runFor(20000);
    assert.equal(
      await page.evaluate(
        () =>
          !session.voiceCall &&
          !session.voiceRetryTimer &&
          e.recoveryTimer === null,
      ),
      true,
      "cancel clears pending retry work",
    );
    await page.evaluate(() => {
      window.savedPeer = e.localPeer;
      window.originalOpen = e.openRoomPeer;
      window.stalledRebuilds = 0;
      savedPeer.open = false;
      savedPeer.disconnected = true;
      savedPeer.reconnect = function () {
        this.disconnected = false;
      };
      e.openRoomPeer = () => {
        stalledRebuilds++;
        e.signalingPendingAt = Date.now();
        e.localPeer = { ...savedPeer, open: false, disconnected: false };
      };
      e.retryConnection();
    });
    await page.clock.runFor(5000);
    assert.equal(
      await page.evaluate(() => m.getState().reconnecting),
      true,
      "reconnect() is not proof of an open signaling socket",
    );
    await page.clock.runFor(25000);
    assert.equal(
      await page.evaluate(
        () =>
          stalledRebuilds > 0 &&
          s.getState().inVoiceCall &&
          e.rawMicStream.active,
      ),
      true,
      "stalled handshake is rebuilt without losing local capture",
    );
    await page.evaluate(() => {
      e.cancelRecovery();
      e.openRoomPeer = originalOpen;
      e.localPeer = savedPeer;
      savedPeer.open = true;
      savedPeer.disconnected = false;
    });
    await page.evaluate(() => {
      e.recoveryCancelled = false;
      e.localPeer = null;
      window.openRoomPeer = e.openRoomPeer;
      window.rebuilds = 0;
      e.openRoomPeer = () => {
        rebuilds++;
        throw Error("injected construction error");
      };
      e.retryConnection();
    });
    await page.clock.runFor(180000);
    assert.equal(
      await page.evaluate(
        () =>
          rebuilds === 8 &&
          e.recoveryTimer === null &&
          !m.getState().reconnecting &&
          s.getState().inVoiceCall &&
          e.rawMicStream.active,
      ),
      true,
      "failed signaling reconstruction is bounded and preserves local capture",
    );
    await page.evaluate(() => {
      e.openRoomPeer = openRoomPeer;
      e.cancelRecovery();
    });
    const privacy = await page.evaluate(() => {
      d.clearCallDiagnostics();
      const clean = d.cleanCallEvent({
        at: Date.now(),
        event: "media_state",
        peer: "192.168.0.1",
        connection: "connected",
        ice: "checking",
        signaling: "stable",
        token: "secret",
        message: "private",
        reason: "private address",
        delayMs: Infinity,
      });
      if (
        clean.peer ||
        clean.token ||
        clean.message ||
        clean.reason ||
        clean.delayMs !== undefined
      )
        throw Error("unsafe diagnostics");
      for (let i = 0; i < 230; i++)
        d.callEvent("data_closed", {}, "raw-private-peer-id");
      return JSON.parse(d.diagnosticReport());
    });
    assert.equal(privacy.events.length, 200);
    assert(privacy.events.every((e) => e.peer === "par-1"));
    assert(!JSON.stringify(privacy).includes("raw-private"));
    await page
      .getByRole("button", { name: "Configurações do perfil", exact: true })
      .click();
    await page.getByRole("tab", { name: "Diagnóstico", exact: true }).click();
    await page
      .getByRole("button", { name: "Copiar relatório", exact: true })
      .click();
    await page.getByText("Relatório copiado.", { exact: true }).waitFor();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    assert.equal(JSON.parse(copied).format, "cbshub-call-diagnostics");
    assert(!copied.includes("raw-private"));
    await page
      .getByRole("button", { name: "Limpar registros", exact: true })
      .click();
    await page
      .getByText("Nenhum evento registrado.", { exact: true })
      .waitFor();
    await page.keyboard.press("Escape");
    await page.evaluate(() => {
      window.track = e.rawMicStream.getTracks()[0];
      // The failed signaling-rebuild scenario intentionally removed old sessions.
      // Establish a new text channel before verifying independent voice teardown.
      window.afterRecoveryData = makeData();
      e.setupDataConnection(afterRecoveryData, "remote-client");
      afterRecoveryData.open = true;
      afterRecoveryData.emit("open");
      e.leaveVoiceCall();
    });
    await page.clock.runFor(20000);
    assert.equal(
      await page.evaluate(
        () =>
          !s.getState().inVoiceCall &&
          track.readyState === "ended" &&
          !session.voiceRetryTimer &&
          e.sessions.size === 1,
      ),
      true,
      "voice exit stops capture and preserves chat",
    );
    await page.evaluate(() => e.leaveRoom());
    assert.equal(
      await page.evaluate(
        () => e.sessions.size === 0 && e.recoveryTimer === null,
      ),
      true,
    );
    console.log(
      "PASS controlled data loss/replacement preserves voice; transient vs failed media; getStats failure; bounded/cancellable retry; privacy/ring/copy/clear diagnostics; manual teardown. No real ICE transport tested.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
