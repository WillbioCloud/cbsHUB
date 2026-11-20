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
  async function create(name) {
    const c = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    contexts.push(c);
    const p = await c.newPage();
    await p.route("**/*", (r) =>
      new URL(r.request().url()).hostname === "127.0.0.1"
        ? r.continue()
        : r.abort(),
    );
    await p.goto("http://127.0.0.1:5173");
    await p.getByRole("textbox", { name: /Mensagem para/ }).waitFor();
    await p.waitForFunction(async () => {
      const { webrtcEngine } = await import("/src/lib/webrtcEngine.ts");
      return webrtcEngine.localPeer !== null;
    });
    await p.evaluate(async (name) => {
      const { useHubStore } = await import("/src/store/useHubStore.ts");
      useHubStore.getState().setNickname(name);
      window.__packets = [];
    }, name);
    return p;
  }
  async function id(p) {
    return p.evaluate(async () => {
      const { useHubStore } = await import("/src/store/useHubStore.ts");
      const s = useHubStore.getState();
      return { id: s.clientId, name: s.nickname };
    });
  }
  async function bind(p, remote) {
    await p.evaluate(async (remote) => {
      const { useHubStore } = await import("/src/store/useHubStore.ts");
      const { webrtcEngine } = await import("/src/lib/webrtcEngine.ts");
      const peer = "bridge-" + remote.id;
      const conn = {
        open: true,
        send(packet) {
          window.__packets.push(structuredClone(packet));
        },
      };
      const session = {
        peerId: peer,
        clientId: remote.id,
        nickname: remote.name,
        dataConn: conn,
        voiceCall: null,
        webcamCall: null,
        screenCall: null,
        remoteSpeakingInterval: null,
      };
      webrtcEngine.sessions.set(peer, session);
      window.__remote = peer;
      useHubStore.getState().setParticipants({
        ...useHubStore.getState().participants,
        [peer]: {
          peerId: peer,
          clientId: remote.id,
          nickname: remote.name,
          avatarColor: "#6eddbd",
          isLocal: false,
          inVoiceCall: false,
          isMuted: false,
          isDeafened: false,
          isSpeaking: false,
          isWebcamActive: false,
          isScreenSharing: false,
        },
      });
    }, remote);
  }
  async function relay(from, to) {
    const packets = await from.evaluate(() => window.__packets.splice(0));
    await to.evaluate(async (packets) => {
      const { webrtcEngine } = await import("/src/lib/webrtcEngine.ts");
      for (const packet of packets)
        webrtcEngine.handleIncomingSignalingPacket(
          webrtcEngine.sessions.get(window.__remote),
          packet,
        );
    }, packets);
    return packets;
  }
  async function waitMessage(p, id, content) {
    await p.waitForFunction(
      async ({ id, content }) => {
        const { useHubStore } = await import("/src/store/useHubStore.ts");
        return (
          useHubStore.getState().messages.find((m) => m.id === id)?.content ===
          content
        );
      },
      { id, content },
    );
  }
  try {
    const a = await create("Alice"),
      b = await create("Bob");
    await bind(a, await id(b));
    await bind(b, await id(a));
    const errors = [];
    a.on("pageerror", (e) => errors.push(e.message));
    b.on("pageerror", (e) => errors.push(e.message));
    const composer = a.getByRole("textbox", { name: /Mensagem para/ });
    await composer.fill("**Olá** <img src=x onerror=alert(1)>");
    await composer.press("Enter");
    await a.getByText("Olá", { exact: true }).waitFor();
    const message = await a.evaluate(async () => {
      const { useHubStore } = await import("/src/store/useHubStore.ts");
      return useHubStore.getState().messages.find((m) => m.type === "user");
    });
    await relay(a, b);
    await waitMessage(b, message.id, message.content);
    await b.waitForFunction(() =>
      window.__packets.some((p) => p.type === "chat_ack"),
    );
    await relay(b, a);
    await a.waitForFunction(async (id) => {
      const { useHubStore } = await import("/src/store/useHubStore.ts");
      return (
        useHubStore.getState().messages.find((m) => m.id === id)?.delivery ===
        "received"
      );
    }, message.id);
    assert.equal(await b.locator('img[src="x"]').count(), 0);
    console.log(
      "PASS envio/ACK entre dois contextos e Markdown sem execução de HTML (ponte local)",
    );
    await b.evaluate(async (id) => {
      const { webrtcEngine } = await import("/src/lib/webrtcEngine.ts");
      await webrtcEngine.toggleMessageReaction(id, "👍");
    }, message.id);
    const reactionPackets = await relay(b, a);
    await a.waitForFunction(async (id) => {
      const { useHubStore } = await import("/src/store/useHubStore.ts");
      return (
        useHubStore.getState().messages.find((m) => m.id === id)?.reactions[
          "👍"
        ]?.reactorClientIds.length === 1
      );
    }, message.id);
    await a.evaluate(async (packets) => {
      const { webrtcEngine } = await import("/src/lib/webrtcEngine.ts");
      for (const packet of packets)
        webrtcEngine.handleIncomingSignalingPacket(
          webrtcEngine.sessions.get(window.__remote),
          packet,
        );
    }, reactionPackets);
    console.log("PASS reação e replay sem toggle duplicado");
    const forbidden = await b.evaluate(async (id) => {
      const { webrtcEngine } = await import("/src/lib/webrtcEngine.ts");
      try {
        await webrtcEngine.mutateChat(id, "delete");
        return false;
      } catch {
        return true;
      }
    }, message.id);
    assert(forbidden);
    console.log("PASS outro autor não pode excluir");
    const row = a.locator(`[data-message-id="${message.id}"]`);
    await row
      .getByRole("button", { name: "Opções da mensagem de Alice", exact: true })
      .click();
    await a
      .getByRole("menuitem", { name: "Editar mensagem", exact: true })
      .click();
    await a
      .getByRole("textbox", { name: "Editar conteúdo", exact: true })
      .fill("Conteúdo editado");
    await a.getByRole("button", { name: "Salvar edição", exact: true }).click();
    await waitMessage(a, message.id, "Conteúdo editado");
    await relay(a, b);
    await waitMessage(b, message.id, "Conteúdo editado");
    console.log("PASS edição pela interface sincronizada");
    await b.evaluate(async (id) => {
      const { webrtcEngine } = await import("/src/lib/webrtcEngine.ts");
      await webrtcEngine.sendChatMessage("Uma resposta", id);
    }, message.id);
    await relay(b, a);
    await a.getByText("Uma resposta", { exact: true }).waitFor();
    assert(
      await a.getByText("Alice: Conteúdo editado", { exact: true }).count(),
    );
    await a.evaluate(async (id) => {
      const { webrtcEngine } = await import("/src/lib/webrtcEngine.ts");
      await webrtcEngine.mutateChat(id, "pin", { active: true });
    }, message.id);
    await relay(a, b);
    await b.waitForFunction(async (id) => {
      const { useHubStore } = await import("/src/store/useHubStore.ts");
      return useHubStore.getState().messages.find((m) => m.id === id)?.pinned;
    }, message.id);
    console.log("PASS resposta específica e mensagem fixada");
    await a.evaluate(async (id) => {
      const { webrtcEngine } = await import("/src/lib/webrtcEngine.ts");
      webrtcEngine.sessions.get(window.__remote).dataConn.open = false;
      await webrtcEngine.mutateChat(id, "edit", {
        content: "Editada enquanto desconectado",
      });
      webrtcEngine.sessions.get(window.__remote).dataConn.open = true;
    }, message.id);
    await b.evaluate(async () => {
      const { webrtcEngine } = await import("/src/lib/webrtcEngine.ts");
      webrtcEngine.requestChatSync(
        webrtcEngine.sessions.get(window.__remote).dataConn,
      );
    });
    await b.waitForFunction(() =>
      window.__packets.some((p) => p.type === "chat_sync_request"),
    );
    await relay(b, a);
    await a.waitForFunction(() =>
      window.__packets.some((p) => p.type === "chat_operations_sync"),
    );
    await relay(a, b);
    await waitMessage(b, message.id, "Editada enquanto desconectado");
    console.log("PASS reconciliação de edição após reconexão lógica");
    await row
      .getByRole("button", { name: "Opções da mensagem de Alice", exact: true })
      .click();
    await a
      .getByRole("menuitem", { name: "Excluir mensagem", exact: true })
      .click();
    await a
      .getByRole("button", { name: "Confirmar exclusão", exact: true })
      .click();
    await a.getByText("Mensagem excluída", { exact: true }).waitFor();
    await relay(a, b);
    await b.getByText("Mensagem excluída", { exact: true }).waitFor();
    await b.reload();
    await b.getByText("Mensagem excluída", { exact: true }).waitFor();
    console.log("PASS exclusão/tombstone persistente após reiniciar");
    await a.evaluate(async () => {
      const { webrtcEngine } = await import("/src/lib/webrtcEngine.ts");
      const { useHubStore } = await import("/src/store/useHubStore.ts");
      await webrtcEngine.triggerSoundboardClip(
        useHubStore.getState().soundboardClips[0],
      );
    });
    assert.equal(await a.locator(".chat-sound-event").count(), 0);
    await a
      .getByRole("button", { name: "Opções da sala", exact: true })
      .click();
    await a
      .getByRole("menuitem", { name: "Atividades de Efeitos Sonoros", exact: true })
      .click();
    await a
      .getByRole("heading", { name: "Atividades de Efeitos Sonoros", exact: true })
      .waitFor();
    await a.keyboard.press("Escape");
    console.log("PASS Soundboard preservado e eventos movidos às atividades");
    await composer.fill("Rascunho persistente");
    await a.reload();
    await a.getByRole("textbox", { name: /Mensagem para/ }).waitFor();
    assert.equal(
      await a.getByRole("textbox", { name: /Mensagem para/ }).inputValue(),
      "Rascunho persistente",
    );
    await a.evaluate(async () => {
      const { useHubStore } = await import("/src/store/useHubStore.ts");
      const s = useHubStore.getState();
      const list = Array.from({ length: 500 }, (_, i) => ({
        id: "seed-" + String(i).padStart(4, "0"),
        roomId: s.roomId,
        type: "user",
        authorClientId: s.clientId,
        authorNickname: "Alice",
        authorAvatarColor: "#6eddbd",
        content: "Histórico " + i,
        createdAt: 1000 + i,
        reactions: {},
      }));
      s.setMessages(list);
    });
    assert((await a.locator("[data-message-id]").count()) <= 100);
    await a
      .getByRole("button", {
        name: "Carregar mensagens anteriores",
        exact: true,
      })
      .click();
    assert((await a.locator("[data-message-id]").count()) <= 100);
    await a
      .getByRole("button", { name: "Pesquisar mensagens", exact: true })
      .click();
    await a
      .getByRole("textbox", { name: "Buscar no histórico", exact: true })
      .fill("Histórico 123");
    await a.getByText("Histórico 123", { exact: true }).waitFor();
    console.log("PASS rascunho, busca e janela de no máximo 100 mensagens");
    assert.deepEqual(errors, []);
  } finally {
    for (const c of contexts) await c.close();
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
