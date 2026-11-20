const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm"),
  ts = require("typescript");
const out = {};
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync("electron/notifications.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
  { exports: out },
);
assert(
  out.validateNotice({ id: "a", kind: "call", title: "Sala", body: "Atender" }),
);
for (const v of [
  null,
  { id: "a", kind: "other", title: "t", body: "b" },
  { id: "a", kind: "call", title: "t", body: "x".repeat(241) },
  { id: "a", kind: "call", title: "t", body: "b", url: "https://evil" },
])
  assert.equal(out.validateNotice(v), null);
const xml = out.callToastXml('<script>&"', "x' <action/>");
assert(!xml.includes("<script>"));
assert(xml.includes("&lt;action/&gt;"));
assert(xml.includes('content="Atender"'));
assert(xml.includes('activationType="foreground"'));
console.log(
  "PASS notification schema/limits, rejection of extra actions/URLs and escaped Windows toast action XML. OS delivery requires Windows.",
);
