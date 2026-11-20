const { _electron } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "cbshub-tray-"));
  let app;
  try {
    app = await _electron.launch({
      executablePath: require("electron"),
      args: [
        ".",
        "--no-sandbox",
        "--ozone-platform=headless",
        "--disable-gpu",
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        `--user-data-dir=${profile}`,
      ],
      env: { ...process.env, VITE_DEV_SERVER_URL: "" },
    });
    const page = await app.firstWindow();
    await page
      .getByRole("button", { name: "Fechar janela", exact: true })
      .waitFor();
    const state = await page.evaluate(() => window.cbsHubAPI.getDesktopState());
    assert.equal(typeof state.trayAvailable, "boolean");
    await page.evaluate(async () => {
      window.stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      window.before = Date.now();
    });
    const id = await app.evaluate(
      ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.id,
    );
    await page
      .getByRole("button", { name: "Fechar janela", exact: true })
      .evaluate((el) => el.click());
    assert.equal(
      await app.evaluate(
        ({ BrowserWindow }) => BrowserWindow.getAllWindows().length,
      ),
      1,
    );
    assert.equal(
      await page.evaluate(() => stream.active),
      true,
      "hiding must not stop capture",
    );
    if (state.trayAvailable)
      assert.equal(
        await page.evaluate(() =>
          window.cbsHubAPI.getDesktopState().then((s) => s.hidden),
        ),
        true,
      );
    await app.evaluate(({ app }) => app.emit("activate"));
    assert.equal(
      await app.evaluate(
        ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.id,
      ),
      id,
    );
    assert.equal(await page.evaluate(() => stream.active && before > 0), true);
    await new Promise((resolve, reject) =>
      require("node:child_process").execFile(
        require("electron"),
        [
          ".",
          "--no-sandbox",
          "--ozone-platform=headless",
          "--disable-gpu",
          `--user-data-dir=${profile}`,
        ],
        {
          cwd: process.cwd(),
          timeout: 10000,
          env: { ...process.env, VITE_DEV_SERVER_URL: "" },
        },
        (error) => (error ? reject(error) : resolve()),
      ),
    );
    assert.equal(
      await app.evaluate(
        ({ BrowserWindow }) => BrowserWindow.getAllWindows().length,
      ),
      1,
    );
    await page.evaluate(() => stream.getTracks().forEach((t) => t.stop()));
    await app.close();
    app = null;
    console.log(
      "PASS Electron close preserves renderer/capture, activate restores same window, explicit app quit exits; native tray available=" +
        state.trayAvailable +
        ". Second process exits without creating another window; physical Windows menu/icon pending.",
    );
  } finally {
    await app?.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
