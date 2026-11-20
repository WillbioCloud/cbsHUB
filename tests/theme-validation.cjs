const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const source = fs.readFileSync("src/studio/theme.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const moduleExports = {};
vm.runInNewContext(compiled, {
  exports: moduleExports,
  structuredClone,
  TextEncoder,
});
const {
  DEFAULT_THEME,
  PRESETS,
  serializeTheme,
  parseTheme,
  validateTheme,
  contrast,
  contrastChecks,
} = moduleExports;
let count = 0;
const test = (label, fn) => {
  fn();
  count++;
  console.log("PASS", label);
};
test("nove presets válidos e roundtrip JSON", () => {
  assert.equal(PRESETS.length, 9);
  for (const t of PRESETS)
    assert.equal(
      serializeTheme(parseTheme(serializeTheme(t))),
      serializeTheme(t),
    );
});
test("contraste WCAG conhecido", () => {
  assert.equal(contrast("#ffffff", "#000000"), 21);
  assert.equal(contrast("#ffffff", "#ffffff"), 1);
  assert(contrastChecks(PRESETS.find(t=>t.name==="Light Modern")).every((c) => c.ratio >= 4.5));
});
const file = () => JSON.parse(serializeTheme(DEFAULT_THEME));
test("versão desconhecida", () => {
  const f = file();
  f.version = 2;
  assert.throws(() => parseTheme(JSON.stringify(f)));
});
test("CSS e JavaScript em cores", () => {
  for (const value of [
    "red",
    "url(javascript:alert(1))",
    "#ffffff; color:red",
    "var(--x)",
  ]) {
    const f = file();
    f.theme.colors.background = value;
    assert.throws(() => parseTheme(JSON.stringify(f)));
  }
});
test("campos desconhecidos e poluição de protótipo", () => {
  assert.throws(() =>
    parseTheme(
      serializeTheme(DEFAULT_THEME).replace(
        '"version": 1',
        '"version": 1, "__proto__": {}',
      ),
    ),
  );
  const f = file();
  f.theme.css = "body{}";
  assert.throws(() => parseTheme(JSON.stringify(f)));
});
test("URLs e SVG em imagens proibidos", () => {
  for (const image of [
    "https://example.com/img.png",
    "javascript:alert(1)",
    "data:image/svg+xml;base64,PHN2Zz4=",
  ]) {
    const f = file();
    f.theme.background.image = image;
    assert.throws(() => parseTheme(JSON.stringify(f)));
  }
});
test("limites numéricos e tipos", () => {
  for (const val of [-100, 10000, "12", null]) {
    const t = structuredClone(DEFAULT_THEME);
    t.layout.fontSize = val;
    assert.throws(() => validateTheme(t));
  }
  const t = structuredClone(DEFAULT_THEME);
  t.layout.scale = NaN;
  assert.throws(() => validateTheme(t));
});
test("nome, JSON quebrado e limite de tamanho", () => {
  assert.throws(() => parseTheme("{"));
  assert.throws(() => parseTheme(" ".repeat(1500001)));
  const t = structuredClone(DEFAULT_THEME);
  t.name = "";
  assert.throws(() => validateTheme(t));
});
console.log(`${count} grupos de validação passaram`);
