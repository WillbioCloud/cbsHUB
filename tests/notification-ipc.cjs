const { _electron } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "cbshub-notify-"));
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
    const p = await app.firstWindow();
    await p.waitForFunction(() => !!window.cbsHubAPI);
    await app.evaluate(({ Notification }) => {
      Notification.isSupported = () => true;
      Notification.prototype.show = function () {
        globalThis.testNotice = this;
      };
      Notification.prototype.close = function () {};
    });
    await p.evaluate(() => {
      window.activated = [];
      window.unsubscribe = window.cbsHubAPI.onNotificationActivated((id) =>
        activated.push(id),
      );
    });
    assert.equal(
      await p.evaluate(() =>
        window.cbsHubAPI.notifyNative({
          id: "call",
          kind: "call",
          title: "Sala",
          body: "Atender",
        }),
      ),
      true,
    );
    assert.equal(
      await p.evaluate(() =>
        window.cbsHubAPI.notifyNative({
          id: "call",
          kind: "call",
          title: "Sala",
          body: "Atender",
        }),
      ),
      false,
    );
    assert.equal(
      await p.evaluate(() =>
        window.cbsHubAPI.notifyNative({
          id: "bad",
          kind: "call",
          title: "Sala",
          body: "Atender",
          url: "https://evil",
        }),
      ),
      false,
    );
    await app.evaluate(() => {
      globalThis.testNotice.emit("click");
      globalThis.testNotice.emit("click");
    });
    await p.waitForFunction(() => activated.length === 1);
    assert.deepEqual(await p.evaluate(() => activated), ["call"]);
    await p.evaluate(() => unsubscribe());
    console.log(
      "PASS actual Electron IPC validation/dedup and activation delivery once; native OS Notification presentation mocked, Windows toast not validated.",
    );
  } finally {
    await app?.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
