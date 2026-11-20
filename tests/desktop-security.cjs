const fs = require("node:fs"),
  vm = require("node:vm"),
  assert = require("node:assert/strict"),
  ts = require("typescript");
const moduleData = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync("electron/security.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
  { exports: moduleData.exports, module: moduleData, URL },
);
const { trustedRenderer, externalLink, validCaptureSource } =
  moduleData.exports;
assert(
  trustedRenderer(
    "file:///app/dist/index.html#room",
    "file:///app/dist/index.html",
  ),
);
assert(
  !trustedRenderer("file:///tmp/page.html", "file:///app/dist/index.html"),
);
assert(!trustedRenderer("https://evil.test", "http://localhost:5173"));
assert(trustedRenderer("http://localhost:5173/", "http://localhost:5173"));
assert(!externalLink("javascript:alert(1)"));
assert(!externalLink("https://user:pass@example.com"));
assert(externalLink("https://example.com/path"));
assert(!validCaptureSource({}, true));
assert(!validCaptureSource("screen:0:0", "yes"));
assert(validCaptureSource("window:1234:0", false));
const preload = fs.readFileSync("dist-electron/preload.cjs", "utf8");
let api;
vm.runInNewContext(preload, {
  require: (name) => {
    assert.equal(name, "electron");
    return {
      contextBridge: {
        exposeInMainWorld: (key, value) => {
          assert.equal(key, "cbsHubAPI");
          api = value;
        },
      },
      ipcRenderer: {
        invoke() {
          return Promise.resolve(false);
        },
        send() {},
      },
    };
  },
  console,
});
assert.equal(Object.keys(api).length, 12);
assert(!/^\s*(import|export) /m.test(preload));
console.log(
  "PASS desktop origins, links, capture arguments and executable CJS preload",
);

assert(
  moduleData.exports.permittedCapability(
    "media",
    "file:///app/index.html",
    "file:///app/index.html",
  ),
);
assert(
  !moduleData.exports.permittedCapability(
    "media",
    "https://evil.test",
    "file:///app/index.html",
  ),
);
assert(
  !moduleData.exports.permittedCapability(
    "media",
    "file:///app/index.html",
    "file:///app/index.html",
    false,
  ),
);
assert(
  !moduleData.exports.permittedCapability(
    "geolocation",
    "file:///app/index.html",
    "file:///app/index.html",
  ),
);
assert(moduleData.exports.productionCsp.includes("object-src 'none'"));
console.log("PASS capability allowlist and production CSP");
