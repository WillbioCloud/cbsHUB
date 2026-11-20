const fs = require("node:fs"),
  ts = require("typescript"),
  vm = require("node:vm"),
  assert = require("node:assert/strict");
const moduleStub = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync("electron/background.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
  { module: moduleStub, exports: moduleStub.exports },
);
(async () => {
  const { BackgroundNotice } = moduleStub.exports;
  let shown = 0,
    hidden = 0,
    persisted = 0,
    done;
  const n = new BackgroundNotice(false);
  const show = () => {
    shown++;
    return new Promise((r) => (done = r));
  };
  const first = n.request(
    show,
    () => hidden++,
    () => false,
    () => persisted++,
  );
  await n.request(
    show,
    () => hidden++,
    () => false,
    () => persisted++,
  );
  assert.equal(shown, 1);
  assert.equal(hidden, 0);
  done();
  await first;
  assert.equal(hidden, 1);
  assert.equal(persisted, 1);
  await n.request(
    show,
    () => hidden++,
    () => false,
    () => persisted++,
  );
  assert.equal(shown, 1);
  assert.equal(hidden, 2);
  let quit = false,
    complete;
  const second = new BackgroundNotice();
  const pending = second.request(
    () => new Promise((r) => (complete = r)),
    () => hidden++,
    () => quit,
    () => persisted++,
  );
  quit = true;
  complete();
  await pending;
  assert.equal(hidden, 2);
  console.log(
    "PASS first-close notice acknowledgement/persistence, duplicate-close guard and quit while notice pending. Native Windows dialog/menu still requires desktop test.",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
