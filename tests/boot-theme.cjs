const fs = require("node:fs"),
  vm = require("node:vm"),
  assert = require("node:assert/strict");
const script = fs.readFileSync("public/boot-theme.js", "utf8");
function run(saved) {
  const style = {
    setProperty(k, v) {
      this[k] = v;
    },
  };
  vm.runInNewContext(script, {
    localStorage: { getItem: () => saved },
    document: { documentElement: { style } },
  });
  return style;
}
const light = run(
  JSON.stringify({
    version: 1,
    active: {
      mode: "light",
      colors: { background: "#fafafa", text: "#101010" },
    },
  }),
);
assert.equal(light.backgroundColor, "#fafafa");
assert.equal(light.colorScheme, "light");
for (const bad of [
  "{",
  null,
  JSON.stringify({
    version: 1,
    active: {
      mode: "dark",
      colors: { background: "url(javascript:alert(1))", text: "#ffffff" },
    },
  }),
])
  assert.equal(run(bad).backgroundColor, "#101116");
assert.equal(run(JSON.stringify({ version: 2 })).backgroundColor, "#101116");
console.log(
  "PASS synchronous saved boot colors, fallback for malformed storage, version and CSS injection validation. Physical first frame still needs desktop review.",
);
