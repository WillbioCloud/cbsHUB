const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  ts = require("typescript"),
  vm = require("node:vm");
const code = ts.transpileModule(
  fs.readFileSync("src/chat/viewState.ts", "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;
function boot(saved, fail = false) {
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    require,
    localStorage: {
      getItem: (key) => (key === "cbshub-message-identity-v1" ? saved : null),
      setItem: (_, value) => {
        if (fail) throw Error("quota");
        saved = value;
      },
    },
  });
  return { api: exports, saved: () => saved };
}
const a = boot(null);
assert.equal(a.api.useMessageIdentity.getState().showAvatars, true);
a.api.saveMessageIdentity({ showAvatars: false, colorNames: true });
const b = boot(a.saved());
assert.equal(b.api.useMessageIdentity.getState().showAvatars, false);
assert.equal(b.api.useMessageIdentity.getState().colorNames, true);
for (const invalid of [
  "{",
  "null",
  JSON.stringify({ version: 2, showAvatars: false, colorNames: true }),
  JSON.stringify({ version: 1, showAvatars: "false", colorNames: true }),
])
  assert.equal(
    boot(invalid).api.useMessageIdentity.getState().showAvatars,
    true,
  );
const c = boot(null, true);
assert.throws(() => c.api.saveMessageIdentity({ showAvatars: false }));
assert.equal(c.api.useMessageIdentity.getState().showAvatars, true);
assert.throws(() =>
  a.api.saveMessageIdentity({ colorNames: "url(javascript:alert(1))" }),
);
console.log(
  "PASS message identity persistence/restart, invalid version/types/JSON fallback and storage failure keeps previous state.",
);
