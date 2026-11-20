const { _electron } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "cbshub-window-"));
  let app;
  try {
    app = await _electron.launch({
      executablePath: require("electron"),
      args: [
        ".",
        "--no-sandbox",
        "--ozone-platform=headless",
        "--disable-gpu",
        `--user-data-dir=${profile}`,
      ],
      env: { ...process.env, VITE_DEV_SERVER_URL: "" },
    });
    const page = await app.firstWindow();
    await page
      .getByRole("button", { name: "Maximizar janela", exact: true })
      .waitFor();
    const state = await page.evaluate(() => window.cbsHubAPI.getWindowState());
    assert.equal(typeof state.isMaximized, "boolean");
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      global.__windowRequests = [];
      for (const method of ["minimize", "maximize", "unmaximize"]) {
        const original = win[method].bind(win);
        win[method] = () => {
          global.__windowRequests.push(method);
          original();
        };
      }
    });
    await page
      .getByRole("button", { name: "Maximizar janela", exact: true })
      .click();
    await app.evaluate(() => {
      if (!global.__windowRequests.includes("maximize"))
        throw Error("maximize not called");
    });
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].webContents.send(
        "cbs:window-state-changed",
        { isMaximized: true },
      ),
    );
    await page
      .getByRole("button", { name: "Restaurar janela", exact: true })
      .waitFor();
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].webContents.send(
        "cbs:window-state-changed",
        { isMaximized: false },
      ),
    );
    await page
      .getByRole("button", { name: "Maximizar janela", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Minimizar janela", exact: true })
      .evaluate((el) => el.click());
    await app.evaluate(() => {
      if (!global.__windowRequests.includes("minimize"))
        throw Error("minimize not called");
    });
    await page
      .getByRole("button", { name: "Fechar janela", exact: true })
      .evaluate((el) => el.click());
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win || win.isDestroyed())
        throw Error("close destroyed call renderer");
    });
    await app.evaluate(({ app }) => app.emit("activate"));
    await page.waitForFunction(() => !!window.cbsHubAPI);
    console.log(
      "PASS native IPC maximize/minimize/close-to-background/restore, initial state and OS-state subscription; physical maximize/drag require graphical desktop",
    );
  } finally {
    await app?.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
