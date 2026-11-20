const { chromium } = require("playwright"),
  assert = require("node:assert/strict");
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
    const p = await browser.newPage({ viewport: { width: 1280, height: 900 } }),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.route("**/*", (r) =>
      new URL(r.request().url()).hostname === "127.0.0.1"
        ? r.continue()
        : r.abort(),
    );
    await p.goto("http://127.0.0.1:5173");
    const composer = p.getByRole("textbox", { name: /Mensagem para/ });
    await composer.waitFor();
    await composer.fill("Mensagem de identidade");
    await composer.press("Enter");
    const row = p
      .locator("article[data-message-id]")
      .filter({ hasText: "Mensagem de identidade" });
    await row.waitFor();
    assert.equal(await row.locator(".profile-avatar-trigger").count(), 1);
    await p
      .getByRole("button", { name: "Configurações do perfil", exact: true })
      .click();
    await p
      .getByRole("tablist", { name: "Seções das configurações" })
      .getByRole("tab", { name: "Aparência", exact: true })
      .click();
    await p
      .getByRole("switch", {
        name: "Exibir avatares nas mensagens",
        exact: true,
      })
      .click();
    await p
      .getByRole("switch", {
        name: "Usar cores dos autores nos nomes",
        exact: true,
      })
      .click();
    assert.equal(await p.getByRole("dialog").count(), 1);
    await p.getByRole("button", { name: "Concluído", exact: true }).click();
    assert.equal(await row.locator(".profile-avatar-trigger").count(), 0);
    assert(await row.locator("strong").textContent());
    await p.reload();
    await composer.waitFor();
    await row.waitFor();
    assert.equal(await row.locator(".profile-avatar-trigger").count(), 0);
    await p.evaluate(async () => {
      window.e = (await import("/src/lib/webrtcEngine.ts")).webrtcEngine;
      window.s = (await import("/src/store/useHubStore.ts")).useHubStore;
      window.m = (await import("/src/lib/mediaState.ts")).useMediaState;
      e.cancelRecovery();
      await e.joinVoiceCall();
      window.local = Object.values(s.getState().participants).find(
        (p) => p.isLocal,
      );
      const participants = { [local.peerId]: local };
      for (let i = 1; i < 6; i++)
        participants["test-" + i] = {
          ...local,
          peerId: "test-" + i,
          clientId: "client-" + i,
          isLocal: false,
          inVoiceCall: true,
          nickname: "Remoto " + i,
        };
      s.getState().setParticipants(participants);
      s.getState().setCallStageMode("grid");
      s.setState({ isConnected: true });
      m.setState({
        signaling: "online",
        reconnecting: false,
        quality: {
          "test-1": { state: "connected", flowing: true, rttMs: 22, loss: 0 },
        },
      });
    });
    await p.evaluate(() =>
      s.getState().setMessages(
        s.getState().messages.map((message) => ({
          ...message,
          authorAvatarColor: "#00ff00",
        })),
      ),
    );
    await p.waitForFunction(
      () =>
        document.querySelector("article[data-message-id] strong")?.style
          .color === "rgb(0, 255, 0)",
    );
    await p.evaluate(() =>
      s.getState().setMessages(
        s.getState().messages.map((message) => ({
          ...message,
          authorAvatarColor: "#101116",
        })),
      ),
    );
    await p.waitForFunction(
      () =>
        document.querySelector("article[data-message-id] strong")?.style
          .color === "",
    );
    const localCard = p
      .locator("[data-call-card]")
      .filter({ has: p.locator("[data-local-connection]") });
    await localCard
      .getByLabel("Sua conexão: Conectado à sala", { exact: true })
      .waitFor();
    await p.evaluate(() => {
      s.setState({ isConnected: false });
      m.setState({ signaling: "offline", reconnecting: true });
    });
    await localCard
      .getByLabel("Sua conexão: Reconectando sinalização", { exact: true })
      .waitFor();
    assert.equal(
      await p.locator(".sidebar-voice-panel [data-local-connection]").count(),
      1,
    );
    assert.equal(
      await p.locator('[data-call-card="test-1"]').getByText(/22 ms/).count(),
      1,
    );
    assert.equal(await localCard.getByText(/22 ms/).count(), 0);
    await p.evaluate(() => {
      s.setState({ isConnected: true });
      m.setState({
        signaling: "online",
        reconnecting: true,
        recoveryPhase: "media",
        quality: {
          "test-1": {
            state: "disconnected",
            flowing: false,
            rttMs: null,
            loss: null,
          },
        },
      });
    });
    await localCard
      .getByLabel("Sua conexão: Conectado à sala", { exact: true })
      .waitFor();
    await p
      .locator('[data-call-card="test-1"]')
      .getByLabel("Reconectando", { exact: true })
      .waitFor();
    await p.evaluate(() => {
      m.setState({ reconnecting: false, recoveryPhase: "idle" });
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 360;
      window.testScreen = canvas.captureStream(5);
      s.getState().setRemoteStream("test-1", "screen", testScreen);
      s.getState().updateParticipant("test-1", { isScreenSharing: true });
      s.getState().setFocusedPeerStreamKey("screen-test-1");
      s.getState().setCallStageMode("spotlight");
    });
    const measurements = [];
    for (const [width, height] of [
      [1280, 180],
      [1280, 400],
      [390, 180],
    ]) {
      await p.setViewportSize({ width, height: 900 });
      await p.evaluate(
        (height) => s.getState().setCallStageHeight(height),
        height,
      );
      await p.waitForTimeout(150);
      const result = await p
        .locator(".call-spotlight-grid")
        .evaluate((grid) => {
          const r = grid.getBoundingClientRect(),
            area = grid.parentElement.getBoundingClientRect();
          return {
            width: r.width,
            height: r.height,
            areaWidth: area.width,
            areaHeight: area.height,
            cards: [...grid.querySelectorAll("[data-call-card]")].map((c) => ({
              width: c.getBoundingClientRect().width,
              height: c.getBoundingClientRect().height,
            })),
          };
        });
      assert.equal(result.cards.length, 6);
      assert(result.width <= result.areaWidth + 1);
      assert(result.height <= result.areaHeight + 1);
      assert(
        result.cards.every(
          (c) =>
            c.width > 0 &&
            c.height > 0 &&
            Math.abs(c.width / c.height - 16 / 9) < 0.15,
        ),
        JSON.stringify({ width, height, result }),
      );
      measurements.push(result);
    }
    assert(
      measurements[0].cards[0].height < measurements[1].cards[0].height,
      "spotlight cards must grow with stage height",
    );
    const mutedBefore = await p.evaluate(() => s.getState().isMuted);
    await p
      .getByRole("button", {
        name: mutedBefore ? "Desmutar microfone" : "Mutar microfone",
        exact: true,
      })
      .click();
    assert.equal(await p.evaluate(() => s.getState().isMuted), !mutedBefore);
    await p
      .getByRole("button", {
        name: mutedBefore ? "Mutar microfone" : "Desmutar microfone",
        exact: true,
      })
      .click();
    await p
      .getByRole("button", { name: "Opções de câmera", exact: true })
      .click();
    await p.getByText("Selecionar Câmera", { exact: true }).waitFor();
    await p.keyboard.press("Escape");
    await p.keyboard.press("Escape");
    assert.equal(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await p.evaluate(() => {
      s.setState({ isConnected: false });
      m.setState({
        signaling: "offline",
        reconnecting: true,
        recoveryPhase: "signaling",
        quality: {},
      });
    });
    await p.getByLabel("Reconectando à sala", { exact: true }).waitFor();
    await p.evaluate(() => {
      window.logoHost = document.querySelector(".reconnection-screen");
    });
    for (const time of [1196, 1300, 1500, 1559]) {
      const clips = await p.evaluate((time) => {
        const paths = logoHost.querySelectorAll("path");
        for (const path of paths) {
          const a = path.getAnimations()[0];
          a.pause();
          a.currentTime = time;
        }
        return [...paths].map((path) => getComputedStyle(path).clipPath);
      }, time);
      assert(
        clips.every(
          (c) =>
            c.startsWith("inset(") &&
            [...c.matchAll(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/g)].every(
              (v) => Math.abs(Number(v[0])) < 1e-8,
            ),
        ),
        JSON.stringify({ time, clips }),
      );
    }
    await p.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(
      await p
        .locator(".reconnection-screen .animated-official-logo path")
        .first()
        .evaluate((el) => getComputedStyle(el).animationName),
      "none",
    );
    await p.evaluate(() => {
      testScreen.getTracks().forEach((t) => t.stop());
      e.leaveRoom();
    });
    assert.deepEqual(errors, []);
    console.log(
      "PASS Appearance message identity/live rendering/reload, local vs remote connection isolation/sidebar, spotlight six proportional cards at 180/400px/mobile, shared 364ms logo pause and reduced motion. Synthetic UI/media, not physical transport.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
