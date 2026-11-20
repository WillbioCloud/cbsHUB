const fs = require("node:fs"),
  vm = require("node:vm"),
  ts = require("typescript"),
  assert = require("node:assert/strict");
const e = {};
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync("src/profiles/model.ts", "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
  { exports: e, atob, URL, Date },
);
const {
  defaultProfile,
  validateProfile,
  publicProfile,
  validatePublicProfile,
} = e;
let count = 0;
function test(name, fn) {
  fn();
  count++;
  console.log("PASS", name);
}
const profile = () => defaultProfile("owner-id-123456", "Pessoa");
test("modelo e propriedade local", () => {
  assert.equal(
    validateProfile(profile(), "owner-id-123456").displayName,
    "Pessoa",
  );
  assert.throws(() => validateProfile(profile(), "outro"));
});
test("links e injeções rejeitados", () => {
  for (const url of [
    "javascript:alert(1)",
    "http://example.com",
    "https://user:password@example.com",
  ]) {
    const p = profile();
    p.links = [url];
    assert.throws(() => validateProfile(p, p.ownerId));
  }
  const p = profile();
  p.appearance.color = "red; background:url(x)";
  assert.throws(() => validateProfile(p, p.ownerId));
});
test("uploads SVG e conteúdo falso rejeitados", () => {
  for (const data of [
    "https://example.com/a.png",
    "data:image/svg+xml;base64,PHN2Zz4=",
    "data:image/png;base64,YWJj",
  ]) {
    const p = profile();
    p.avatar = data;
    assert.throws(() => validateProfile(p, p.ownerId));
  }
});
test("limites de texto e nome de usuário", () => {
  for (const name of ["a", "Ab!", "nome com espaço"]) {
    const p = profile();
    p.username = name;
    assert.throws(() => validateProfile(p, p.ownerId));
  }
  const p = profile();
  p.bio = "a".repeat(501);
  assert.throws(() => validateProfile(p, p.ownerId));
});
test("projeção não transmite dados privados", () => {
  const p = profile();
  p.links = ["https://example.com"];
  p.bio = "privado";
  p.privacy.showBio = false;
  const pub = publicProfile(p);
  assert.equal(pub.bio, "");
  assert.equal(pub.links.length, 0);
  assert.equal(pub.createdAt, null);
  assert(!("privacy" in pub));
  assert(!("ownerId" in pub));
  p.privacy.visibility = "private";
  assert.equal(publicProfile(p), null);
});
test("invisível é projetado como offline", () => {
  const p = profile();
  p.presence = "invisible";
  assert.equal(publicProfile(p).presence, "offline");
});
test("perfil remoto reconstruído sem campos privados", () => {
  const pub = publicProfile(profile());
  pub.ownerId = "spoof";
  pub.privateField = "secret";
  const clean = validatePublicProfile(pub);
  assert(!("ownerId" in clean));
  assert(!("privateField" in clean));
  assert.equal(clean.createdAt, null);
});
console.log(`${count} grupos passaram`);
