const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
(async () => {
  const b = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: [
      "--no-sandbox",
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  });
  const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.route("**/*", (r) =>
    ["127.0.0.1", "localhost"].includes(new URL(r.request().url()).hostname) ||
    r.request().url().startsWith("data:")
      ? r.continue()
      : r.abort(),
  );
  const open = async () => {
    if (
      await p
        .getByRole("dialog", { name: "Configurações do cbsHUB", exact: true })
        .isVisible()
    )
      await p
        .getByRole("tablist", { name: "Seções das configurações" })
        .getByRole("tab", { name: "Aparência", exact: true })
        .click();
    else
      await p
        .getByRole("button", { name: "Abrir cbsHUB Studio", exact: true })
        .click();
  };
  const bg = () =>
    p.evaluate(() =>
      document.documentElement.style.getPropertyValue("--background"),
    );
  try {
    await p.goto("http://127.0.0.1:5173");
    await p.getByRole("textbox", { name: /Mensagem para/ }).waitFor();
    await open();
    await p
      .getByRole("button", { name: "Prévia Light Modern", exact: true })
      .click();
    assert.equal(await bg(), "#f6f8fa");
    await p.getByRole("button", { name: "Cancelar", exact: true }).click();
    assert.equal(await bg(), "#101116");
    console.log("PASS prévia clara e rollback ao cancelar");
    await open();
    await p
      .getByRole("button", { name: "Prévia Light Modern", exact: true })
      .click();
    await p
      .getByRole("textbox", { name: "Nome do tema", exact: true })
      .fill("Meu Studio");
    await p.getByRole("button", { name: "Salvar tema", exact: true }).click();
    await p.reload();
    await p.getByRole("textbox", { name: /Mensagem para/ }).waitFor();
    assert.equal(await bg(), "#f6f8fa");
    console.log("PASS salvar e reiniciar com preferências");
    await open();
    await p
      .getByRole("textbox", { name: "Renomear Meu Studio", exact: true })
      .fill("Tema renomeado");
    await p.getByRole("textbox", { name: "Nome do tema", exact: true }).click();
    await p
      .getByRole("button", { name: "Duplicar Tema renomeado", exact: true })
      .click();
    await p
      .getByRole("button", {
        name: "Excluir Tema renomeado (cópia)",
        exact: true,
      })
      .click();
    const downloaded = p.waitForEvent("download");
    await p
      .getByRole("button", { name: "Exportar Tema renomeado", exact: true })
      .click();
    const result = JSON.parse(
      await fs.readFile(await (await downloaded).path(), "utf8"),
    );
    assert.equal(result.version, 1);
    assert.equal(result.theme.name, "Tema renomeado");
    console.log("PASS renomear, duplicar, excluir e exportar JSON");
    const invalid = structuredClone(result);
    invalid.theme.colors.background = "url(javascript:alert(1))";
    await p
      .getByLabel("Importar arquivo de tema", { exact: true })
      .setInputFiles({
        name: "bad.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(invalid)),
      });
    await p.getByRole("alert").waitFor();
    assert.equal(await bg(), "#f6f8fa");
    console.log("PASS importação maliciosa rejeitada sem alterar tema");
    result.theme.name = "Importado";
    await p
      .getByLabel("Importar arquivo de tema", { exact: true })
      .setInputFiles({
        name: "ok.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(result)),
      });
    await p
      .getByRole("textbox", { name: "Nome do tema", exact: true })
      .filter({ visible: true })
      .waitFor();
    assert.equal(
      await p
        .getByRole("textbox", { name: "Nome do tema", exact: true })
        .inputValue(),
      "Importado",
    );
    await p.getByRole("tab", { name: "Cores", exact: true }).click();
    await p
      .getByRole("textbox", { name: "HEX Fundo principal", exact: true })
      .fill("#222233");
    assert.equal(await bg(), "#222233");
    console.log("PASS importação válida e edição HEX");
    await p.getByRole("tab", { name: "Fundo", exact: true }).click();
    await p.getByRole("button", { name: "Gradiente", exact: true }).click();
    assert(
      (
        await p.evaluate(() =>
          document.documentElement.style.getPropertyValue("--studio-wallpaper"),
        )
      ).includes("linear-gradient"),
    );
    const image = await p.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = 8;
      c.height = 8;
      c.getContext("2d").fillRect(0, 0, 8, 8);
      return c.toDataURL("image/png").split(",")[1];
    });
    await p.getByLabel("Imagem de fundo", { exact: true }).setInputFiles({
      name: "wallpaper.png",
      mimeType: "image/png",
      buffer: Buffer.from(image, "base64"),
    });
    await p
      .getByRole("button", { name: "Remover imagem", exact: true })
      .waitFor();
    assert(
      (
        await p.evaluate(() =>
          document.documentElement.style.getPropertyValue("--studio-wallpaper"),
        )
      ).includes("data:image/"),
    );
    console.log("PASS gradiente e imagem raster normalizada");
    await p.getByRole("tab", { name: "Layout", exact: true }).click();
    const width = p.getByRole("slider", {
      name: "Largura da barra lateral",
      exact: true,
    });
    await width.focus();
    await width.press("End");
    assert.equal(
      await p
        .locator(".workspace-sidebar")
        .evaluate((e) => e.getBoundingClientRect().width),
      360,
    );
    await p
      .getByRole("switch", { name: "Reduzir movimento", exact: true })
      .click();
    assert.equal(
      await p.evaluate(() => document.documentElement.dataset.studioMotion),
      "reduced",
    );
    console.log("PASS layout ao vivo e movimento reduzido");
    await p
      .getByRole("button", { name: "Restaurar padrões", exact: true })
      .click();
    assert.equal(await bg(), "#101116");
    await p.screenshot({
      path: "/workspace/cbshub-onboarding/studio-desktop.png",
    });
    await p.getByRole("button", { name: "Cancelar", exact: true }).click();
    assert.equal(await bg(), "#f6f8fa");
    console.log("PASS restauração e cancelamento preservam tema salvo");
    await p.setViewportSize({ width: 390, height: 844 });
    await open();
    assert(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await p.getByRole("button", { name: "Salvar tema", exact: true }).waitFor();
    await p.screenshot({
      path: "/workspace/cbshub-onboarding/studio-mobile.png",
    });
    await p.keyboard.press("Escape");
    if (
      await p
        .getByRole("button", {
          name: "Descartar alterações e fechar",
          exact: true,
        })
        .isVisible()
    )
      await p
        .getByRole("button", {
          name: "Descartar alterações e fechar",
          exact: true,
        })
        .click();
    await p.getByRole("dialog").waitFor({ state: "hidden" });
    assert.deepEqual(errors, []);
    console.log("PASS mobile, Escape e ausência de erros JS");
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
