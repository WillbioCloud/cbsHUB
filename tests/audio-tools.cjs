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
    const page = await browser.newPage();
    await page.route("**/*", (r) =>
      new URL(r.request().url()).hostname === "127.0.0.1"
        ? r.continue()
        : r.abort(),
    );
    await page.addInitScript(() => {
      const original = navigator.mediaDevices.getUserMedia.bind(
        navigator.mediaDevices,
      );
      window.captured = [];
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        const stream = await original(constraints);
        captured.push(stream);
        return stream;
      };
    });
    await page.goto("http://127.0.0.1:5173");
    await page
      .getByRole("button", { name: "Configurações do perfil", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Testar microfone", exact: true })
      .click();
    await page
      .getByRole("meter", { name: "Nível do teste de microfone" })
      .waitFor();
    assert.equal(await page.evaluate(() => captured.length), 1);
    await page
      .getByRole("button", { name: "Parar teste de microfone" })
      .click();
    assert.equal(
      await page.evaluate(() =>
        captured.every((s) =>
          s.getTracks().every((t) => t.readyState === "ended"),
        ),
      ),
      true,
    );
    await page
      .getByRole("button", { name: "Testar microfone", exact: true })
      .click();
    await page
      .getByRole("meter", { name: "Nível do teste de microfone" })
      .waitFor();
    await page.keyboard.press("Escape");
    await page.locator('[role="dialog"]').waitFor({ state: "detached" });
    assert.equal(
      await page.evaluate(() =>
        captured.every((s) =>
          s.getTracks().every((t) => t.readyState === "ended"),
        ),
      ),
      true,
      "closing settings must stop test capture",
    );
    await page.evaluate(async () => {
      window.e = (await import("/src/lib/webrtcEngine.ts")).webrtcEngine;
      window.s = (await import("/src/store/useHubStore.ts")).useHubStore;
      window.prefs = await import("/src/lib/voicePreferences.ts");
      window.sb = (
        await import("/src/lib/soundboardEngine.ts")
      ).soundboardEngine;
    });
    await page.waitForFunction(() => !!e.localPeer);
    await page.evaluate(async () => {
      const peer = e.localPeer;
      e.localPeer = null;
      peer.destroy();
      e.cancelRecovery();
      await e.joinVoiceCall();
      e.toggleMute(false);
      window.ctx = e.audioPipeline.getAudioContext();
      window.an = ctx.createAnalyser();
      an.fftSize = 2048;
      ctx
        .createMediaStreamSource(e.audioPipeline.getProcessedStream())
        .connect(an);
      window.rms = () => {
        const data = new Float32Array(an.fftSize);
        an.getFloatTimeDomainData(data);
        return Math.sqrt(data.reduce((sum, x) => sum + x * x, 0) / data.length);
      };
      prefs.saveVoicePreferences({ pushToTalk: true, talkKey: "F8" });
    });
    await page.waitForFunction(() => rms() < 0.001);
    await page
      .locator(".native-titlebar")
      .click({ position: { x: 500, y: 10 } });
    await page.keyboard.down("F8");
    await page.waitForFunction(() => rms() > 0.005);
    await page.keyboard.up("F8");
    await page.waitForFunction(() => rms() < 0.001);
    await page.getByRole("textbox", { name: /Mensagem para/ }).focus();
    await page.keyboard.down("F8");
    assert.equal(
      await page.evaluate(() => e.pushToTalkHeld),
      false,
      "typing must not activate PTT",
    );
    await page.keyboard.up("F8");
    await page
      .locator(".native-titlebar")
      .click({ position: { x: 500, y: 10 } });
    await page.keyboard.down("F8");
    await page.waitForFunction(() => e.pushToTalkHeld);
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    assert.equal(
      await page.evaluate(() => e.pushToTalkHeld),
      false,
      "blur must release PTT",
    );
    await page.keyboard.up("F8");
    await page.evaluate(() => e.toggleMute(true));
    await page.keyboard.down("F8");
    await page.waitForFunction(() => rms() < 0.001);
    await page.keyboard.up("F8");
    await page.evaluate(() =>
      sb.playClip(
        s
          .getState()
          .soundboardClips.find((c) => c.id === "builtin-sad_trombone"),
      ),
    );
    await page.waitForFunction(() => rms() > 0.005);
    await page.evaluate(() => sb.stopAll());
    await page.waitForFunction(() => rms() < 0.001);
    await page.evaluate(() => {
      e.leaveVoiceCall();
      e.leaveRoom();
    });
    assert.equal(
      await page.evaluate(() =>
        captured.every((s) =>
          s.getTracks().every((t) => t.readyState === "ended"),
        ),
      ),
      true,
    );
    await page.reload();
    await page.evaluate(async () => {
      window.prefs = await import("/src/lib/voicePreferences.ts");
    });
    assert.equal(
      await page.evaluate(
        () => prefs.useVoicePreferences.getState().pushToTalk,
      ),
      true,
    );
    console.log(
      "PASS local mic meter start/stop/dialog cleanup; real synthetic WebAudio PTT press/release/editable/blur/manual mute/Soundboard isolation; preferences reload. No hardware/global shortcut test.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
