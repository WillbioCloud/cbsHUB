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
    const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
    await p.route("**/*", (r) =>
      new URL(r.request().url()).hostname === "127.0.0.1"
        ? r.continue()
        : r.abort(),
    );
    await p.addInitScript(() => {
      window.notices = [];
      window.cbsHubAPI = {
        notifyNative: async (n) => {
          notices.push(n);
          return true;
        },
        onNotificationActivated: (fn) => {
          window.activateNotice = fn;
          return () => {};
        },
      };
    });
    const start = Date.now();
    await p.goto("http://127.0.0.1:5173");
    await p.getByLabel("Inicializando cbsHUB", { exact: true }).waitFor();
    await p.waitForTimeout(1000);
    assert.equal(
      await p.getByRole("textbox", { name: /Mensagem para/ }).count(),
      0,
    );
    await p.getByRole("textbox", { name: /Mensagem para/ }).waitFor();
    assert(Date.now() - start >= 4900);
    assert.equal(
      await p
        .locator(".native-titlebar")
        .getByRole("button", {
          name: "Diagnóstico da transmissão",
          exact: true,
        })
        .count(),
      1,
    );
    assert.equal(
      await p
        .getByRole("button", {
          name: "Diagnóstico da transmissão",
          exact: true,
        })
        .innerText(),
      "",
    );
    await p.evaluate(async () => {
      window.e = (await import("/src/lib/webrtcEngine.ts")).webrtcEngine;
      window.s = (await import("/src/store/useHubStore.ts")).useHubStore;
      window.sb = (
        await import("/src/lib/soundboardEngine.ts")
      ).soundboardEngine;
      e.cancelRecovery();
      await e.joinVoiceCall();
      window.peer = e.localPeer;
      window.generation = e.roomGeneration;
      window.mic = e.rawMicStream;
      await e.joinRoom(s.getState().roomId);
    });
    assert(
      await p.evaluate(
        () =>
          e.localPeer === peer &&
          e.roomGeneration === generation &&
          e.rawMicStream === mic &&
          mic.active &&
          s.getState().inVoiceCall,
      ),
    );
    await p
      .getByRole("button", { name: "Mutar microfone", exact: true })
      .waitFor();
    assert.equal(
      await p
        .getByRole("button", { name: "Dispositivos e opções", exact: true })
        .count(),
      0,
    );
    const rejected = await p.evaluate(async () => {
      let n = 0;
      for (const blob of [
        new Blob(["invalid"], { type: "audio/wav" }),
        new Blob([new Uint8Array(6 * 1024 * 1024)], { type: "audio/wav" }),
      ])
        try {
          await sb.playClip({ id: "bad", audioBlob: blob, volume: 1 });
        } catch {
          n++;
        }
      return n;
    });
    assert.equal(rejected, 2);
    assert(
      await p.evaluate(
        () => mic.active && e.localPeer === peer && s.getState().inVoiceCall,
      ),
    );
    await p.evaluate(async () => {
      await sb.playClip(s.getState().soundboardClips[0]);
      sb.stopAll();
      e.leaveVoiceCall();
      window.remote = {
        peerId: "test-remote",
        clientId: "remote-client",
        nickname: "Remoto",
        avatarColor: "#ff00ff",
        inVoiceCall: false,
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
      window.session = {
        peerId: remote.peerId,
        clientId: remote.clientId,
        nickname: remote.nickname,
        dataConn: { open: true, send() {}, close() {} },
      };
      e.sessions.set(remote.peerId, session);
      e.handleIncomingSignalingPacket(session, {
        type: "peer_state_sync",
        state: { ...remote, inVoiceCall: true },
      });
    });
    assert.equal(
      await p.evaluate(() => notices.filter((n) => n.kind === "call").length),
      1,
    );
    await p.evaluate(() => {
      s.getState().updateParticipant(remote.peerId, { inVoiceCall: false });
      activateNotice(notices.find((n) => n.kind === "call").id);
    });
    assert.equal(await p.evaluate(() => s.getState().inVoiceCall), false);
    await p.evaluate(async () => {
      window.joinCount = 0;
      const original = e.joinVoiceCall;
      e.joinVoiceCall = async () => {
        joinCount++;
      };
      e.handleIncomingSignalingPacket(session, {
        type: "peer_state_sync",
        state: { ...remote, inVoiceCall: true },
      });
      const id = notices.filter((n) => n.kind === "call").at(-1).id;
      activateNotice(id);
      activateNotice(id);
      e.joinVoiceCall = original;
    });
    assert.equal(await p.evaluate(() => joinCount), 1);
    await p.evaluate(() => {
      e.handleIncomingSignalingPacket(session, {
        type: "chat_message",
        message: {
          id: "notify-text",
          roomId: s.getState().roomId,
          authorClientId: remote.clientId,
          authorNickname: "Remoto",
          authorAvatarColor: "#ff00ff",
          type: "user",
          content: "Olá",
          createdAt: Date.now(),
          reactions: {},
        },
      });
    });
    await p.waitForFunction(() => notices.some((n) => n.id === "notify-text"));
    await p.evaluate(() => e.leaveRoom());
    console.log(
      "PASS minimum 5s splash, icon-only titlebar diagnostics, visible stage controls, current-room no-op, invalid/oversized sounds preserve live mic/session, call notice and stale accept rejection, new message notice. Synthetic media only.",
    );
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
