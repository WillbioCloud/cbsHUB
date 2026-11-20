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
  const contexts = [];
  async function page() {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    contexts.push(context);
    const p = await context.newPage();
    await p.route("**/*", (r) =>
      new URL(r.request().url()).hostname === "127.0.0.1"
        ? r.continue()
        : r.abort(),
    );
    await p.goto("http://127.0.0.1:5173");
    await p.getByRole("button", { name: "Meu perfil", exact: true }).waitFor();
    await p.evaluate(async () => {
      window.__profileTestEngine = (
        await import("/src/lib/webrtcEngine.ts")
      ).webrtcEngine;
    });
    await p.waitForFunction(
      () =>
        !!window.__profileTestEngine.localPeer &&
        window.__profileTestEngine.roomGeneration >= 3,
    );
    return p;
  }
  try {
    const a = await page();
    const errors = [];
    a.on("pageerror", (e) => errors.push(e.message));
    await a.getByRole("button", { name: "Meu perfil", exact: true }).click();
    await a.getByRole("button", { name: "Editar perfil", exact: true }).click();
    await a
      .getByRole("textbox", { name: "Nome de exibição", exact: true })
      .fill("Aurora");
    await a
      .getByRole("textbox", { name: "Nome de usuário", exact: true })
      .fill("aurora_local");
    await a
      .getByRole("textbox", { name: "Biografia", exact: true })
      .fill("Bio compartilhada");
    await a
      .getByRole("textbox", { name: "Links do perfil", exact: true })
      .fill("https://example.com/privado");
    const image = await a.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = 8;
      c.height = 8;
      c.getContext("2d").fillRect(0, 0, 8, 8);
      return c.toDataURL("image/png").split(",")[1];
    });
    for (const kind of ["avatar", "banner"]) {
      await a.getByLabel(`Upload de ${kind}`, { exact: true }).setInputFiles({
        name: "image.png",
        mimeType: "image/png",
        buffer: Buffer.from(image, "base64"),
      });
      if (kind === "avatar")
        await a
          .getByRole("button", { name: "Aplicar recorte", exact: true })
          .click();
    }
    await a.getByRole("button", { name: "Salvar perfil", exact: true }).click();
    await a.getByRole("button", { name: "Concluído", exact: true }).click();
    await a.getByRole("dialog").waitFor({ state: "hidden" });
    await a.reload();
    await a.getByRole("button", { name: "Meu perfil", exact: true }).waitFor();
    assert.equal(
      await a.evaluate(
        () => JSON.parse(localStorage.getItem("cbshub-profile-v1")).displayName,
      ),
      "Aurora",
    );
    console.log("PASS edição, avatar/banner raster e persistência após reload");
    await a.getByRole("button", { name: "Meu perfil", exact: true }).click();
    await a.getByRole("button", { name: "Editar perfil", exact: true }).click();
    await a
      .getByRole("textbox", { name: "Nome de exibição", exact: true })
      .fill("Descartar");
    await a.getByRole("button", { name: "Cancelar", exact: true }).click();
    assert.equal(
      await a.evaluate(
        () => JSON.parse(localStorage.getItem("cbshub-profile-v1")).displayName,
      ),
      "Aurora",
    );
    console.log("PASS cancelar sem persistir rascunho");
    await a.getByRole("button", { name: "Concluído", exact: true }).click();
    const packet = await a.evaluate(async () => {
      const m = await import("/src/profiles/model.ts");
      const p = JSON.parse(localStorage.getItem(m.PROFILE_KEY));
      return { owner: p.ownerId, profile: m.publicProfile(p) };
    });
    assert.equal(packet.profile.links.length, 0);
    assert.equal(packet.profile.createdAt, null);
    assert(!("privacy" in packet.profile));
    const b = await page();
    await b.evaluate(async ({ owner, profile }) => {
      const { useHubStore } = await import("/src/store/useHubStore.ts");
      const { webrtcEngine } = await import("/src/lib/webrtcEngine.ts");
      const peerId = "test-aurora";
      const p = {
        peerId,
        clientId: owner,
        nickname: "Aurora",
        avatarColor: "#6eddbd",
        isLocal: false,
        inVoiceCall: false,
        isMuted: false,
        isDeafened: false,
        isSpeaking: false,
        isWebcamActive: false,
        isScreenSharing: false,
      };
      const session = {
        peerId,
        clientId: owner,
        dataConn: { open: true, send() {} },
        voiceCall: null,
        webcamCall: null,
        screenCall: null,
        remoteSpeakingInterval: null,
      };
      useHubStore.getState().setParticipants({
        ...useHubStore.getState().participants,
        [peerId]: p,
      });
      webrtcEngine.sessions.set(peerId, session);
      webrtcEngine.handleIncomingSignalingPacket(session, {
        type: "profile_update",
        profile,
      });
    }, packet);
    await b
      .getByRole("button", { name: "Ver perfil de Aurora", exact: true })
      .click();
    await b.getByText("Bio compartilhada", { exact: true }).waitFor();
    assert.equal(await b.getByRole("link", { name: "example.com" }).count(), 0);
    await b
      .getByRole("button", { name: "Ver perfil completo", exact: true })
      .click();
    await b
      .getByRole("heading", { name: "Perfil completo", exact: true })
      .waitFor();
    console.log(
      "PASS visualização em outra instância por handler real e campos privados omitidos (ponte local)",
    );
    await b
      .getByRole("button", { name: "Bloquear usuário", exact: true })
      .click();
    await b
      .getByRole("heading", { name: "Perfil bloqueado", exact: true })
      .waitFor();
    const denied = await b.evaluate(async (owner) => {
      const { webrtcEngine } = await import("/src/lib/webrtcEngine.ts");
      const { useHubStore } = await import("/src/store/useHubStore.ts");
      const s = webrtcEngine.sessions.get("test-aurora");
      let closed = false;
      webrtcEngine.handleIncomingMediaCall({
        peer: "test-aurora",
        metadata: { channel: "voice" },
        close() {
          closed = true;
        },
      });
      webrtcEngine.handleIncomingSignalingPacket(s, {
        type: "chat_message",
        message: {
          id: "blocked-message",
          roomId: useHubStore.getState().roomId,
          authorClientId: owner,
          content: "não exibir",
        },
      });
      return {
        closed,
        received: useHubStore
          .getState()
          .messages.some((m) => m.id === "blocked-message"),
      };
    }, packet.owner);
    assert(denied.closed && !denied.received);
    await b.reload();
    assert(
      (
        await b.evaluate(() =>
          JSON.parse(localStorage.getItem("cbshub-blocked-v1")),
        )
      ).includes(packet.owner),
    );
    console.log("PASS bloqueio de mídia/mensagem e persistência");
    await a.evaluate(async () => {
      const { saveProfile } = await import("/src/profiles/repository.ts");
      const { useHubStore } = await import("/src/store/useHubStore.ts");
      const p = JSON.parse(localStorage.getItem("cbshub-profile-v1"));
      p.privacy.allowCalls = false;
      p.privacy.allowReactions = false;
      saveProfile(p, p.ownerId);
    });
    const permissions = await a.evaluate(async () => {
      const { webrtcEngine } = await import("/src/lib/webrtcEngine.ts");
      const { useHubStore } = await import("/src/store/useHubStore.ts");
      const session = {
        peerId: "trusted",
        clientId: "trusted-id",
        dataConn: { open: true, send() {} },
        voiceCall: null,
        webcamCall: null,
        screenCall: null,
        remoteSpeakingInterval: null,
      };
      webrtcEngine.sessions.set("trusted", session);
      let closed = false;
      webrtcEngine.handleIncomingMediaCall({
        peer: "trusted",
        metadata: { channel: "voice" },
        close() {
          closed = true;
        },
      });
      const msg = await webrtcEngine.sendChatMessage(
        "Teste de permissão de reação",
      );
      webrtcEngine.handleIncomingSignalingPacket(session, {
        type: "chat_reaction_toggle",
        messageId: msg.id,
        emoji: "👍",
        clientId: "trusted-id",
        nickname: "Visitante",
      });
      return {
        closed,
        reacted: !!useHubStore.getState().messages.find((m) => m.id === msg.id)
          .reactions["👍"],
      };
    });
    assert(permissions.closed && !permissions.reacted);
    assert.deepEqual(errors, []);
    console.log("PASS permissões e rejeição de chamada sem sessão autorizada");
    await a.setViewportSize({ width: 390, height: 844 });
    await a.getByRole("button", { name: "Meu perfil", exact: true }).click();
    assert(
      await a.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    console.log("PASS visualização móvel");
  } finally {
    for (const c of contexts) await c.close();
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
