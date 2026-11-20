const { chromium } = require("playwright"),
  assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: [
      "--no-sandbox",
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });
    await page.route("**/*", (r) =>
      new URL(r.request().url()).hostname === "127.0.0.1"
        ? r.continue()
        : r.abort(),
    );
    await page.goto("http://127.0.0.1:5173");
    await page.getByRole("textbox", { name: /Mensagem para/ }).waitFor();
    await page.evaluate(async () => {
      window.s = (await import("/src/store/useHubStore.ts")).useHubStore;
      window.e = (await import("/src/lib/webrtcEngine.ts")).webrtcEngine;
    });
    await page.waitForFunction(() => !!e.localPeer);
    await page.evaluate(() => {
      s.getState().addRecentRoom("sala-favorita");
      s.getState().addRecentRoom(
        "nome-muito-longo-de-sala-que-precisa-continuar-preservado",
      );
    });
    await page
      .getByRole("button", {
        name: "Opções da sala sala-favorita",
        exact: true,
      })
      .click();
    await page
      .getByRole("menuitem", { name: "Adicionar aos favoritos" })
      .click();
    await page
      .getByRole("heading", { name: "Favoritas", exact: true })
      .waitFor();
    const fav = page.getByRole("region", { name: "Favoritas", exact: true });
    await fav
      .getByRole("button", { name: /sala-favorita/ })
      .first()
      .waitFor();
    await page
      .getByRole("textbox", { name: "Filtrar salas recentes" })
      .fill("nenhuma");
    await page.getByText("Nenhuma sala encontrada.", { exact: true }).waitFor();
    await page
      .getByRole("textbox", { name: "Filtrar salas recentes" })
      .fill("");
    await page.reload();
    await page
      .getByRole("heading", { name: "Favoritas", exact: true })
      .waitFor();
    await page.evaluate(async () => {
      window.s = (await import("/src/store/useHubStore.ts")).useHubStore;
      window.e = (await import("/src/lib/webrtcEngine.ts")).webrtcEngine;
      window.m = (await import("/src/lib/mediaState.ts")).useMediaState;
    });
    await page.waitForFunction(() => !!e.localPeer);
    await page.evaluate(async () => {
      e.cancelRecovery();
      s.getState().setUnreadCount(7);
      await e.joinVoiceCall();
    });
    await page.getByLabel("7 mensagens não lidas", { exact: true }).waitFor();
    await page
      .getByRole("region", { name: "Painel de voz", exact: true })
      .waitFor();
    assert.equal(
      await page
        .locator(".local-user-panel")
        .evaluate((el) => el.getBoundingClientRect().height < 65),
      true,
      "profile footer must remain one compact row",
    );
    await page
      .getByRole("button", { name: "Silenciar microfone", exact: true })
      .click();
    assert.equal(await page.evaluate(() => s.getState().isMuted), true);
    await page
      .getByRole("button", { name: "Silenciar áudio", exact: true })
      .click();
    assert.equal(await page.evaluate(() => s.getState().isDeafened), true);
    await page
      .getByRole("button", { name: "Configurações de voz", exact: true })
      .click();
    await page.getByRole("tab", { name: "Áudio, Vídeo & Estúdio" }).waitFor();
    await page.keyboard.press("Escape");
    await page.evaluate(() =>
      m.setState({ reconnecting: true, signaling: "offline" }),
    );
    await page
      .getByRole("region", { name: "Painel de voz" })
      .getByLabel("Sua conexão: Reconectando sinalização", { exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Desconectar voz", exact: true })
      .click();
    assert.equal(
      await page.getByRole("region", { name: "Painel de voz" }).count(),
      0,
    );
    for (const theme of ["Clássico", "Moderno Roxo"]) {
      await page
        .getByRole("button", { name: "Configurações do perfil", exact: true })
        .click();
      await page
        .getByRole("tablist", { name: "Seções das configurações" })
        .getByRole("tab", { name: "Aparência", exact: true })
        .click();
      await page.getByRole("button", { name: theme, exact: true }).click();
      await page.keyboard.press("Escape");
      for (const width of [1100, 800]) {
        await page.setViewportSize({ width, height: 800 });
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
        );
      }
      await page.setViewportSize({ width: 1440, height: 900 });
    }
    await page
      .getByRole("button", { name: "Recolher navegação", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Abrir navegação", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Filtrar salas recentes" })
      .waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole("button", { name: "Abrir navegação", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Filtrar salas recentes" })
      .fill("favorita");
    await page
      .getByRole("button", { name: /sala-favorita Sala recente/ })
      .press("Enter");
    await page.locator(".workspace-sheet").waitFor({ state: "hidden" });
    assert.equal(
      await page.evaluate(() => s.getState().roomId),
      "sala-favorita",
    );
    console.log(
      "PASS sidebar search/favorites persistence/unread, compact real-state voice/footer controls, themes/viewports/collapse and keyboard mobile navigation",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
