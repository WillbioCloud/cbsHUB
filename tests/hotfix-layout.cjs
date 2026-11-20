const { chromium } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  ts = require("typescript"),
  vm = require("node:vm");
const mod = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync("src/lib/callGrid.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
  { module: mod, exports: mod.exports },
);
for (const count of [1, 2, 6, 12])
  for (const width of [280, 640, 1200])
    for (const height of [12, 50, 120, 400])
      for (const gap of [12, 24]) {
        const g = mod.exports.callGrid(width, height, count, gap);
        assert(g.width * g.columns + g.gap * (g.columns - 1) <= width + 0.01);
        assert(g.height * g.rows + g.gap * (g.rows - 1) <= height + 0.01);
        assert(g.width > 0 && g.height > 0);
        assert(Math.abs(g.width / g.height - 16 / 9) < 0.001);
      }
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
    const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
    await p.route("**/*", (r) =>
      new URL(r.request().url()).hostname === "127.0.0.1"
        ? r.continue()
        : r.abort(),
    );
    await p.goto("http://127.0.0.1:5173");
    await p
      .getByRole("button", { name: "Configurações do perfil", exact: true })
      .click();
    assert.equal(
      await p.getByRole("button", { name: "Clássico", exact: true }).count(),
      0,
      "themes must not sit outside Appearance",
    );
    const tabs = p.getByRole("tablist", { name: "Seções das configurações" });
    await tabs
      .getByRole("tab", { name: "Perfil & Identidade", exact: true })
      .click();
    const original = await p
      .getByRole("textbox", { name: "Nome de exibição", exact: true })
      .inputValue();
    await p
      .getByRole("textbox", { name: "Nome de exibição", exact: true })
      .fill("Rascunho preservado");
    await tabs.getByRole("tab", { name: "Aparência", exact: true }).click();
    await p
      .getByRole("button", { name: "Prévia Sakura Dream", exact: true })
      .click();
    await tabs
      .getByRole("tab", { name: "Perfil & Identidade", exact: true })
      .click();
    assert.equal(
      await p
        .getByRole("textbox", { name: "Nome de exibição", exact: true })
        .inputValue(),
      "Rascunho preservado",
    );
    await p.keyboard.press("Escape");
    await p
      .getByRole("alert", { name: "Alterações não salvas", exact: true })
      .waitFor();
    assert.equal(await p.getByRole("dialog").count(), 1);
    await p
      .getByRole("button", { name: "Continuar editando", exact: true })
      .click();
    assert.equal(
      await p
        .getByRole("textbox", { name: "Nome de exibição", exact: true })
        .inputValue(),
      "Rascunho preservado",
    );
    await p.getByRole("button", { name: "Concluído", exact: true }).click();
    await p
      .getByRole("button", {
        name: "Descartar alterações e fechar",
        exact: true,
      })
      .click();
    await p.reload();
    await p
      .getByRole("button", { name: "Configurações do perfil", exact: true })
      .click();
    await p
      .getByRole("tablist", { name: "Seções das configurações" })
      .getByRole("tab", { name: "Perfil & Identidade", exact: true })
      .click();
    assert.equal(
      await p
        .getByRole("textbox", { name: "Nome de exibição", exact: true })
        .inputValue(),
      original,
    );
    await p.keyboard.press("Escape");
    await p.evaluate(async () => {
      window.e = (await import("/src/lib/webrtcEngine.ts")).webrtcEngine;
      window.s = (await import("/src/store/useHubStore.ts")).useHubStore;
    });
    await p.waitForFunction(() => !!e.localPeer);
    await p.evaluate(async () => {
      e.cancelRecovery();
      await e.joinVoiceCall();
      const local = Object.values(s.getState().participants).find(
        (p) => p.isLocal,
      );
      const participants = { [local.peerId]: local };
      for (let i = 1; i < 6; i++)
        participants["test-" + i] = {
          ...local,
          peerId: "test-" + i,
          clientId: "client-" + i,
          nickname: "Participante de nome longo " + i,
          isLocal: false,
          inVoiceCall: true,
        };
      s.getState().setParticipants(participants);
      s.getState().setCallStageHeight(180);
      s.getState().setCallStageMode("grid");
    });
    for (const width of [1280, 800, 390]) {
      await p.setViewportSize({ width, height: 900 });
      await p.waitForTimeout(100);
      const result = await p
        .locator(".call-responsive-grid")
        .evaluate((grid) => {
          const area = grid.parentElement,
            style = getComputedStyle(area),
            r = grid.getBoundingClientRect();
          return {
            gridWidth: r.width,
            gridHeight: r.height,
            width:
              area.clientWidth -
              parseFloat(style.paddingLeft) -
              parseFloat(style.paddingRight),
            height:
              area.clientHeight -
              parseFloat(style.paddingTop) -
              parseFloat(style.paddingBottom),
            cards: [...grid.querySelectorAll("[data-call-card]")].map((c) => ({
              width: c.getBoundingClientRect().width,
              height: c.getBoundingClientRect().height,
            })),
          };
        });
      assert(result.gridWidth <= result.width + 1, JSON.stringify(result));
      assert(result.gridHeight <= result.height + 1, JSON.stringify(result));
      assert.equal(result.cards.length, 6);
      assert(result.cards.every((c) => c.width > 0 && c.height > 0));
    }
    await p.setViewportSize({ width: 1280, height: 900 });
    await p.evaluate(() => (document.documentElement.style.fontSize = "24px"));
    await p.waitForTimeout(100);
    assert.equal(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await p.evaluate(async () => {
      window.m = (await import("/src/lib/mediaState.ts")).useMediaState;
      s.setState({ isConnected: true });
      m.setState({
        reconnecting: true,
        recoveryPhase: "media",
        signaling: "online",
        quality: { "test-1": { state: "failed", flowing: false } },
      });
    });
    await p.waitForTimeout(2800);
    assert.equal(
      await p.getByRole("status", { name: "Reconectando à sala" }).count(),
      0,
      "isolated remote failure must not block the application",
    );
    await p.evaluate(() =>
      m.setState({ reconnecting: false, recoveryPhase: "idle" }),
    );
    await p.evaluate(() => {
      e.leaveVoiceCall();
      e.leaveRoom();
    });
    console.log(
      "PASS adaptive grid bounds/aspect/gaps, six visible cards at 180px/three viewports, settings tab drafts retained, guarded discard, inline themes and no nested dialog.",
    );
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
