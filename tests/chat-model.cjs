const fs = require("node:fs"),
  vm = require("node:vm"),
  ts = require("typescript"),
  assert = require("node:assert/strict");
const e = {};
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync("src/chat/model.ts", "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
  { exports: e, structuredClone, URL, Date },
);
const {
  projectMessage,
  validateOperation,
  validateMessage,
  compareMessages,
  safeLink,
} = e;
const m = {
  id: "m1",
  roomId: "room",
  type: "user",
  authorClientId: "alice",
  authorNickname: "Alice",
  authorAvatarColor: "#6eddbd",
  content: "Olá",
  createdAt: 1,
  reactions: {},
};
const op = (kind, extra = {}) => ({
  id: "op-" + kind,
  roomId: "room",
  messageId: "m1",
  actorClientId: "alice",
  nickname: "Alice",
  at: 2,
  kind,
  ...extra,
});
let n = 0;
function test(name, fn) {
  fn();
  n++;
  console.log("PASS", name);
}
test("edição e exclusão exigem autoria", () => {
  assert.equal(
    projectMessage(m, [op("edit", { actorClientId: "bob", content: "fraude" })])
      .content,
    "Olá",
  );
  assert(!projectMessage(m, [op("delete", { actorClientId: "bob" })]).deleted);
});
test("ordenação e replays idempotentes", () => {
  const ops = [
    op("edit", { id: "z", at: 3, content: "última" }),
    op("edit", { id: "a", at: 2, content: "primeira" }),
  ];
  assert.equal(projectMessage(m, ops).content, "última");
  assert.equal(projectMessage(projectMessage(m, ops), ops).content, "última");
  assert(compareMessages({ ...m, id: "a" }, { ...m, id: "b" }) < 0);
});
test("tombstone impede ressurreição", () => {
  const deleted = projectMessage(m, [op("delete")]);
  assert.equal(
    projectMessage(deleted, [op("edit", { at: 4, content: "voltar" })]).content,
    "",
  );
  assert(deleted.deleted);
});
test("reação set/unset e pin convergem", () => {
  const yes = op("reaction", {
    actorClientId: "bob",
    emoji: "👍",
    active: true,
  });
  const result = projectMessage(m, [yes, yes]);
  assert.equal(result.reactions["👍"].reactorClientIds.length, 1);
  const no = op("reaction", {
    id: "remove",
    at: 3,
    actorClientId: "bob",
    emoji: "👍",
    active: false,
  });
  assert(!projectMessage(result, [yes, no]).reactions["👍"]);
  assert(projectMessage(m, [op("pin", { active: true })]).pinned);
});
test("sala, ator e payload inválidos rejeitados", () => {
  assert.throws(() => validateOperation(op("delete"), "outra", "alice"));
  assert.throws(() => validateOperation(op("delete"), "room", "bob"));
  assert.throws(() =>
    validateOperation(
      op("edit", { content: "a".repeat(8001) }),
      "room",
      "alice",
    ),
  );
  assert.throws(() => validateMessage({ ...m, roomId: "outra" }, "room"));
});
test("links não executáveis e conteúdo tratado como texto", () => {
  assert.equal(safeLink("javascript:alert(1)"), null);
  assert.equal(safeLink("data:text/html,<script>"), null);
  assert.equal(safeLink("https://user:pass@example.com"), null);
  assert(safeLink("https://example.com"));
  assert.equal(
    validateMessage({ ...m, content: "<script>alert(1)</script>" }, "room")
      .content,
    "<script>alert(1)</script>",
  );
});
test("chaves de protótipo em reações rejeitadas", () => {
  assert.throws(() =>
    validateOperation(
      op("reaction", { emoji: "__proto__", active: true }),
      "room",
      "alice",
    ),
  );
});
console.log(n + " grupos passaram");
