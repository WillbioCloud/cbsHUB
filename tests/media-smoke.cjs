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
    const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
      }),
      page = await context.newPage();
    await page.route("**/*", (route) =>
      new URL(route.request().url()).hostname === "127.0.0.1"
        ? route.continue()
        : route.abort(),
    );
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://127.0.0.1:5173");
    await page.waitForFunction(async () => {
      const { webrtcEngine: e } = await import("/src/lib/webrtcEngine.ts");
      return !!e.localPeer && e.roomGeneration >= 3;
    });
    await page.evaluate(async () => {
      window.e = (await import("/src/lib/webrtcEngine.ts")).webrtcEngine;
      window.s = (await import("/src/store/useHubStore.ts")).useHubStore;
      window.m = (await import("/src/lib/mediaState.ts")).useMediaState;
      window.sb = (
        await import("/src/lib/soundboardEngine.ts")
      ).soundboardEngine;
    });
    assert.equal(
      await page.evaluate(() => !!e.rawMicStream),
      false,
      "app must not acquire microphone on mount",
    );
    await page.evaluate(async () => {
      window.originalGetMedia = navigator.mediaDevices.getUserMedia.bind(
        navigator.mediaDevices,
      );
      navigator.mediaDevices.getUserMedia = async () => {
        throw new DOMException("Permissão negada", "NotAllowedError");
      };
      await e.joinVoiceCall();
    });
    assert.equal(await page.evaluate(() => s.getState().inVoiceCall), false);
    await page
      .getByRole("alert")
      .filter({ hasText: "Microfone indisponível" })
      .waitFor();
    await page.evaluate(async () => {
      navigator.mediaDevices.getUserMedia = originalGetMedia;
      await e.joinVoiceCall();
    });
    assert.equal(
      await page.evaluate(
        () => s.getState().inVoiceCall && e.rawMicStream.active,
      ),
      true,
    );
    await page
      .getByRole("button", { name: "Expandir painel", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Reduzir painel", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Ligar câmera", exact: true })
      .click();
    await page.waitForFunction(() => s.getState().isWebcamActive);
    assert.equal(
      await page.evaluate(
        () => e.localWebcamStream.getVideoTracks()[0].readyState,
      ),
      "live",
    );
    await page
      .getByRole("button", { name: "Mutar microfone", exact: true })
      .click();
    assert.equal(await page.evaluate(() => e.audioPipeline.isMicMuted), true);
    // Failed device replacement preserves the active capture.
    await page.evaluate(async () => {
      window.oldMic = e.rawMicStream;
      await e.selectMicrophone("missing-device");
    });
    assert.equal(
      await page.evaluate(
        () =>
          e.rawMicStream === oldMic &&
          oldMic.active &&
          s.getState().audioConfig.inputDeviceId === "default",
      ),
      true,
    );
    await page.evaluate(async () => {
      window.oldCamera = e.localWebcamStream;
      await e.selectCamera("missing-camera");
    });
    assert.equal(
      await page.evaluate(
        () =>
          e.localWebcamStream === oldCamera &&
          oldCamera.active &&
          s.getState().audioConfig.videoDeviceId === "default",
      ),
      true,
    );
    await page.evaluate(async () => {
      await e.selectCamera("default");
    });
    assert.equal(
      await page.evaluate(
        () =>
          e.localWebcamStream !== oldCamera &&
          oldCamera.getTracks().every((t) => t.readyState === "ended") &&
          s.getState().isWebcamActive,
      ),
      true,
    );
    await page.evaluate(() => m.setState({ error: null }));
    await page
      .getByRole("button", { name: "Efeitos Sonoros da chamada", exact: true })
      .click();
    const favorite = page.getByRole("button", {
      name: "Favoritar Buzina de Estádio",
      exact: true,
    });
    await favorite.waitFor();
    const prior = await favorite.getAttribute("aria-pressed");
    await favorite.click();
    await page.waitForFunction(
      (prior) =>
        s.getState().soundboardClips.find((c) => c.id === "builtin-airhorn")
          .isFavorite !==
        (prior === "true"),
      prior,
    );
    const count = await page.evaluate(() => s.getState().messages.length);
    await page
      .getByRole("button", { name: "Prévia de Buzina de Estádio", exact: true })
      .click();
    assert.equal(
      await page.evaluate(() => s.getState().messages.length),
      count,
      "preview must not broadcast chat event",
    );
    await page
      .getByRole("button", { name: "Editar Buzina de Estádio", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Nome do som", exact: true })
      .fill("Buzina personalizada");
    await page
      .getByRole("textbox", { name: "Categoria do som", exact: true })
      .fill("Celebrações");
    await page.getByRole("button", { name: "Salvar som", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page.keyboard.press("Escape");
    await page.evaluate(async () => {
      window.mic = e.rawMicStream.getTracks();
      window.cam = e.localWebcamStream.getTracks();
      window.processed = e.audioPipeline.getProcessedStream().getTracks();
      await e.sendChatMessage("Preservar conversa ao desligar");
      e.leaveVoiceCall();
    });
    assert.equal(
      await page.evaluate(
        () =>
          [...mic, ...cam, ...processed].every(
            (t) => t.readyState === "ended",
          ) &&
          !s.getState().inVoiceCall &&
          s
            .getState()
            .messages.some(
              (m) => m.content === "Preservar conversa ao desligar",
            ),
      ),
      true,
    );
    // Cancel acquisition that resolves after leaving call.
    await page.evaluate(async () => {
      window.resolveCapture = null;
      navigator.mediaDevices.getUserMedia = () =>
        new Promise((resolve) => (window.resolveCapture = resolve));
      window.pendingJoin = e.joinVoiceCall();
      e.leaveVoiceCall();
      window.delayed = await originalGetMedia({ audio: true });
      resolveCapture(delayed);
      await pendingJoin;
      navigator.mediaDevices.getUserMedia = originalGetMedia;
    });
    assert.equal(
      await page.evaluate(
        () =>
          !s.getState().inVoiceCall &&
          delayed.getTracks().every((t) => t.readyState === "ended"),
      ),
      true,
    );
    await page.reload();
    await page.waitForFunction(async () => {
      window.s = (await import("/src/store/useHubStore.ts")).useHubStore;
      const { webrtcEngine: e } = await import("/src/lib/webrtcEngine.ts");
      return (
        !!e.localPeer &&
        e.roomGeneration >= 3 &&
        s
          .getState()
          .soundboardClips.some((c) => c.name === "Buzina personalizada")
      );
    });
    await page.waitForFunction(() =>
      s.getState().soundboardClips.some((c) => c.id === "builtin-airhorn"),
    );
    assert.equal(
      await page.evaluate(
        () =>
          s.getState().soundboardClips.find((c) => c.id === "builtin-airhorn")
            .category,
      ),
      "Celebrações",
    );
    assert.equal(
      await page.evaluate(
        () =>
          s.getState().soundboardClips.find((c) => c.id === "builtin-airhorn")
            .isFavorite,
      ),
      prior !== "true",
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS media UI/lifecycle: permission failure, no startup capture, join/camera/mute, device rollback, preview/favorite/edit/reload, release tracks/chat preserved, pending capture cancellation",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
