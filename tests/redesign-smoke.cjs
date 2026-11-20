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
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.route("**/*", (r) =>
    new URL(r.request().url()).hostname === "127.0.0.1"
      ? r.continue()
      : r.abort(),
  );
  try {
    await p.goto("http://127.0.0.1:5173");
    await p.getByRole("textbox", { name: /Mensagem para/ }).waitFor();
    const sep = p.getByRole("separator", { name: "Redimensionar navegação" });
    await sep.focus();
    await sep.press("End");
    assert.equal(await sep.getAttribute("aria-valuenow"), "360");
    await sep.press("Home");
    assert.equal(await sep.getAttribute("aria-valuenow"), "224");
    await p.reload();
    await p
      .getByRole("separator", { name: "Redimensionar navegação" })
      .waitFor();
    assert.equal(
      await p
        .getByRole("separator", { name: "Redimensionar navegação" })
        .getAttribute("aria-valuenow"),
      "224",
    );
    console.log("PASS resize teclado, limites e persistência");
    await p
      .getByRole("button", { name: "Recolher navegação", exact: true })
      .click();
    assert.equal(await p.locator("#room-navigation").count(), 0);
    await p
      .getByRole("button", { name: "Abrir navegação", exact: true })
      .click();
    console.log("PASS recolher/reabrir");
    await p
      .getByRole("button", { name: "Fechar membros", exact: true })
      .click();
    assert.equal(await p.locator("#room-members").count(), 0);
    await p
      .getByRole("button", { name: "Mostrar membros", exact: true })
      .click();
    console.log("PASS painel de membros");
    await p
      .getByRole("button", { name: "Opções da sala", exact: true })
      .click();
    await p.getByRole("menuitem", { name: "Copiar código da sala" }).waitFor();
    await p.waitForFunction(() => {
      const dialog = document.querySelector('[role="dialog"]');
      return !dialog || dialog.contains(document.activeElement);
    });
    await p.keyboard.press("Escape");
    await p.getByRole("button", { name: "Diagnóstico da transmissão" }).click();
    await p
      .getByText("Medições de CPU e GPU ainda não estão disponíveis.", {
        exact: false,
      })
      .waitFor();
    await p.waitForFunction(() => {
      const dialog = document.querySelector('[role="dialog"]');
      return !dialog || dialog.contains(document.activeElement);
    });
    await p.keyboard.press("Escape");
    console.log("PASS menus e diagnóstico sem números simulados");
    const composer = p.getByRole("textbox", { name: /Mensagem para/ });
    await composer.fill("Regressão visual");
    await composer.press("Shift+Enter");
    await composer.press("Enter");
    await p
      .getByRole("log", { name: "Mensagens da sala" })
      .getByText("Regressão visual", { exact: true })
      .waitFor();
    await p.waitForFunction(
      () => document.getElementById("message-composer").value === "",
    );
    await p.screenshot({
      path: "/workspace/cbshub-onboarding/redesign-desktop.png",
    });
    console.log("PASS mensagem visível offline");
    for (const width of [390, 768, 1024]) {
      await p.setViewportSize({ width, height: 844 });
      await p.getByRole("textbox", { name: /Mensagem para/ }).waitFor();
      assert(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      const box = await p
        .getByRole("textbox", { name: /Mensagem para/ })
        .boundingBox();
      assert(box.width > 80 && box.x + box.width <= width);
      console.log("PASS viewport", width);
    }
    await p.setViewportSize({ width: 390, height: 844 });
    await p
      .getByRole("button", { name: "Abrir navegação", exact: true })
      .click();
    await p.getByRole("dialog").waitFor();
    await p.waitForFunction(() => {
      const dialog = document.querySelector('[role="dialog"]');
      return !dialog || dialog.contains(document.activeElement);
    });
    await p.keyboard.press("Escape");
    await p.getByRole("dialog").waitFor({ state: "hidden" });
    await p
      .getByRole("button", { name: "Mostrar membros", exact: true })
      .click();
    await p.getByRole("dialog").waitFor();
    await p.waitForFunction(() => {
      const dialog = document.querySelector('[role="dialog"]');
      return !dialog || dialog.contains(document.activeElement);
    });
    await p.keyboard.press("Escape");
    await p.getByRole("dialog").waitFor({ state: "hidden" });
    console.log("PASS Sheets móveis e Escape");
    await p.screenshot({
      path: "/workspace/cbshub-onboarding/redesign-mobile.png",
    });
    assert.deepEqual(errors, []);
    console.log("PASS sem erros JS");
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
