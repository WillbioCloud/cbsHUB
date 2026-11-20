const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const b = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: [
      "--no-sandbox",
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.route("**/*", (r) =>
    new URL(r.request().url()).hostname === "127.0.0.1"
      ? r.continue()
      : r.abort(),
  );
  try {
    await p.goto("http://127.0.0.1:5173");
    await p.waitForFunction(async () => {
      const { webrtcEngine } = await import("/src/lib/webrtcEngine.ts");
      return webrtcEngine.localPeer !== null;
    });
    await p
      .getByRole("textbox", { name: /Mensagem para/ })
      .fill("Rascunho da primeira sala");
    await p.evaluate(async () => {
      const { webrtcEngine } = await import("/src/lib/webrtcEngine.ts");
      await webrtcEngine.joinRoom("draft-second");
    });
    await p
      .getByRole("textbox", { name: "Mensagem para draft-second", exact: true })
      .waitFor();
    assert.equal(
      await p
        .getByRole("textbox", {
          name: "Mensagem para draft-second",
          exact: true,
        })
        .inputValue(),
      "",
    );
    await p
      .getByRole("textbox", { name: "Mensagem para draft-second", exact: true })
      .fill("Rascunho da segunda sala");
    await p.evaluate(async () => {
      const { webrtcEngine } = await import("/src/lib/webrtcEngine.ts");
      await webrtcEngine.joinRoom("cbs-irmandade");
    });
    await p
      .getByRole("textbox", {
        name: "Mensagem para cbs-irmandade",
        exact: true,
      })
      .waitFor();
    assert.equal(
      await p
        .getByRole("textbox", {
          name: "Mensagem para cbs-irmandade",
          exact: true,
        })
        .inputValue(),
      "Rascunho da primeira sala",
    );
    console.log("PASS rascunhos isolados por sala");
    await p.evaluate(async () => {
      const { storageDb } = await import("/src/lib/storageDb.ts");
      window.__save = storageDb.saveMessage;
      storageDb.saveMessage = async () => {
        throw new Error("Falha de disco simulada");
      };
    });
    await p
      .getByRole("button", { name: "Enviar mensagem", exact: true })
      .click();
    await p.getByRole("alert").waitFor();
    assert.equal(
      await p.getByRole("textbox", { name: /Mensagem para/ }).inputValue(),
      "Rascunho da primeira sala",
    );
    await p.evaluate(async () => {
      const { storageDb } = await import("/src/lib/storageDb.ts");
      storageDb.saveMessage = window.__save;
    });
    await p
      .getByRole("button", { name: "Enviar mensagem", exact: true })
      .click();
    await p.getByLabel("Mensagens da sala").getByText("Rascunho da primeira sala", { exact: true }).waitFor();
    console.log(
      "PASS falha de persistência mantém rascunho e permite nova tentativa",
    );
    await p.evaluate(async () => {
      const { useHubStore } = await import("/src/store/useHubStore.ts");
      const { storageDb } = await import("/src/lib/storageDb.ts");
      const s = useHubStore.getState();
      const msgs = Array.from({ length: 600 }, (_, i) => ({
        id: "retention-" + String(i).padStart(4, "0"),
        roomId: s.roomId,
        type: "user",
        authorClientId: s.clientId,
        authorNickname: "Pessoa",
        authorAvatarColor: "#6eddbd",
        content: "Histórico " + i,
        createdAt: 1000 + i,
        reactions: {},
      }));
      const saved = await storageDb.saveMessageBatch(s.roomId, msgs);
      s.setMessages(saved);
    });
    const count = await p.evaluate(async () => {
      const { storageDb } = await import("/src/lib/storageDb.ts");
      return (await storageDb.getMessagesByRoom("cbs-irmandade")).length;
    });
    assert.equal(count, 500);
    assert((await p.locator("[data-message-id]").count()) <= 100);
    await p.locator(".chat-feed").evaluate((el) => {
      el.scrollTop = 0;
      el.dispatchEvent(new Event("scroll"));
    });
    await p.evaluate(async () => {
      const { useHubStore } = await import("/src/store/useHubStore.ts");
      useHubStore.getState().setUnreadCount(3);
    });
    await p
      .getByRole("button", { name: "3 novas mensagens", exact: true })
      .waitFor();
    await p
      .getByRole("button", { name: "3 novas mensagens", exact: true })
      .click();
    assert.equal(
      await p.evaluate(async () => {
        const { useHubStore } = await import("/src/store/useHubStore.ts");
        return useHubStore.getState().unreadCount;
      }),
      0,
    );
    console.log("PASS retenção de 500, janela de 100 e leitura de não lidas");
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
