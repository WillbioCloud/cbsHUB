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
      .getByRole("button", { name: "Entrar na voz", exact: true })
      .waitFor();
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
      await page.locator('[role="dialog"]').waitFor({ state: "detached" });
      assert.equal(
        (await page.locator(".native-titlebar").boundingBox()).height,
        32,
      );
      assert.equal(
        (await page.locator(".room-topbar").boundingBox()).height,
        60,
      );
      assert.equal(
        await page
          .getByText("Um espaço para suas pessoas", { exact: true })
          .count(),
        0,
      );
      await page.screenshot({
        path: `/workspace/cbshub-onboarding/compact-bars-${theme === "Clássico" ? "classic" : "modern"}.png`,
      });
      await page
        .getByRole("button", { name: "Opções da sala", exact: true })
        .click();
      await page
        .getByRole("menuitem", { name: "Configurações", exact: true })
        .waitFor();
      await page.keyboard.press("Escape");
    }
    await page
      .getByRole("button", { name: "Entrar na voz", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Expandir painel", exact: true })
      .waitFor();
    assert(
      (await page.locator(".call-stage-toolbar").boundingBox()).height <= 34,
    );
    await page
      .getByRole("button", { name: "Expandir painel", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Reduzir painel", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Desconectar voz", exact: true })
      .click();
    for (const width of [390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      assert((await page.locator(".room-topbar").boundingBox()).height <= 64);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
    }
    assert.equal(
      await page
        .locator(".native-titlebar")
        .evaluate((el) =>
          getComputedStyle(el).getPropertyValue("-webkit-app-region"),
        ),
      "drag",
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Fechar janela", exact: true })
        .evaluate((el) =>
          getComputedStyle(el).getPropertyValue("-webkit-app-region"),
        ),
      "no-drag",
    );
    console.log(
      "PASS 32px titlebar, 60/56px room header, compact call toolbar, themes/menus/call lifecycle/viewports and drag CSS",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
