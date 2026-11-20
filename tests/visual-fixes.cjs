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
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    await page.route("**/*", (r) =>
      new URL(r.request().url()).hostname === "127.0.0.1"
        ? r.continue()
        : r.abort(),
    );
    await page.goto("http://127.0.0.1:5173");
    await page
      .getByRole("button", { name: "Configurações do perfil", exact: true })
      .click();
    await page
      .getByRole("tablist", { name: "Seções das configurações" })
      .getByRole("tab", { name: "Aparência", exact: true })
      .click();
    await page.getByRole("button", { name: "Clássico", exact: true }).click();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.dataset.workspaceStyle,
      ),
      "classic",
    );
    await page.reload();
    await page.waitForFunction(
      () => document.documentElement.dataset.workspaceStyle === "classic",
    );
    await page
      .getByRole("button", { name: "Configurações do perfil", exact: true })
      .click();
    await page
      .getByRole("tablist", { name: "Seções das configurações" })
      .getByRole("tab", { name: "Aparência", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Moderno Roxo", exact: true })
      .click();
    assert.equal(
      await page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue("--primary")
          .trim(),
      ),
      "#7c3aed",
    );
    await page.keyboard.press("Escape");
    await page.evaluate(async () => {
      window.e = (await import("/src/lib/webrtcEngine.ts")).webrtcEngine;
      window.s = (await import("/src/store/useHubStore.ts")).useHubStore;
    });
    await page.waitForFunction(() => !!e.localPeer);
    await page.evaluate(async () => {
      window.before = s.getState().messages.length;
      await e.triggerSoundboardClip(s.getState().soundboardClips[0]);
    });
    assert.equal(
      await page.evaluate(() => s.getState().messages.length === before),
      true,
    );
    await page.evaluate(async () => {
      const { storageDb } = await import("/src/lib/storageDb.ts");
      const messages = await storageDb.getMessagesByRoom(s.getState().roomId);
      if (messages.some((m) => m.type === "soundboard"))
        throw Error("Sound event persisted");
    });
    const room = await page.evaluate(() => s.getState().roomId);
    await page
      .getByRole("button", { name: `Opções da sala ${room}`, exact: true })
      .click();
    await page
      .getByRole("menuitem", {
        name: "Remover sala deste dispositivo",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Confirmar remoção local", exact: true })
      .click();
    assert.equal(await page.evaluate(() => s.getState().roomId === ""), true);
    await page.reload();
    await page
      .getByRole("button", { name: "Criar sala", exact: true })
      .waitFor();
    await page.evaluate(async () => {
      window.s = (await import("/src/store/useHubStore.ts")).useHubStore;
    });
    assert.equal(await page.evaluate(() => s.getState().roomId), "");
    console.log(
      "PASS theme persistence/purple, Soundboard no chat records and confirmed local room removal after reload",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
