// ===== Unit testy pro ModelStore (lib/modelStore.cjs) =====

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const modelStore = require("../server/lib/modelStore.cjs");

// ===== isValidModelName =====

test("isValidModelName: povoluje legitimní modely", () => {
  assert.strictEqual(modelStore.isValidModelName("ollama/minimax-m3:cloud"), true);
  assert.strictEqual(modelStore.isValidModelName("ollama/kimi-k2.7-code:cloud"), true);
  assert.strictEqual(modelStore.isValidModelName("minimax-m3:cloud"), true);
  assert.strictEqual(modelStore.isValidModelName("deepseek-v4-flash:cloud"), true);
});

test("isValidModelName: blokuje path traversal", () => {
  assert.strictEqual(modelStore.isValidModelName("../../etc/passwd"), false);
  assert.strictEqual(modelStore.isValidModelName("/etc/passwd"), false);
  assert.strictEqual(modelStore.isValidModelName("foo/../bar"), false);
  assert.strictEqual(modelStore.isValidModelName("a//b"), false);
});

test("isValidModelName: blokuje nebezpečné vstupy", () => {
  assert.strictEqual(modelStore.isValidModelName(""), false);
  assert.strictEqual(modelStore.isValidModelName("foo bar"), false);
  assert.strictEqual(modelStore.isValidModelName("foo;rm -rf /"), false);
  assert.strictEqual(modelStore.isValidModelName(null), false);
  assert.strictEqual(modelStore.isValidModelName(undefined), false);
  assert.strictEqual(modelStore.isValidModelName(123), false);
  assert.strictEqual(modelStore.isValidModelName("x".repeat(201)), false);
});

// ===== getModels / setModels =====

test("getModels: vrací aktuální modely", () => {
  const models = modelStore.getModels();
  assert.ok(models.execModel, "execModel required");
  assert.ok(models.ollamaModel, "ollamaModel required");
});

test("setModels: aktualizuje execModel", () => {
  const result = modelStore.setModels({ execModel: "ollama/kimi-k2.7-code:cloud" });
  assert.strictEqual(result.execModel, "ollama/kimi-k2.7-code:cloud");
  assert.strictEqual(result.changed.execModel, "ollama/kimi-k2.7-code:cloud");
});

test("setModels: aktualizuje ollamaModel", () => {
  const result = modelStore.setModels({ ollamaModel: "kimi-k2.7-code:cloud" });
  assert.strictEqual(result.ollamaModel, "kimi-k2.7-code:cloud");
});

test("setModels: aktualizuje oba najednou", () => {
  const result = modelStore.setModels({
    execModel: "ollama/deepseek-v4-flash:cloud",
    ollamaModel: "deepseek-v4-flash:cloud",
  });
  assert.strictEqual(result.execModel, "ollama/deepseek-v4-flash:cloud");
  assert.strictEqual(result.ollamaModel, "deepseek-v4-flash:cloud");
});

test("setModels: vyhodí chybu pro invalid model", () => {
  assert.throws(() => modelStore.setModels({ execModel: "../../etc/passwd" }), /Neplatný/);
  assert.throws(() => modelStore.setModels({ ollamaModel: "" }), /Neplatný/);
});

test("setModels: bez argumentů nic nezmění", () => {
  const before = modelStore.getModels();
  const result = modelStore.setModels({});
  assert.deepStrictEqual(result.changed, {});
  assert.strictEqual(result.execModel, before.execModel);
});

// ===== resetModels =====

test("resetModels: vrátí na výchozí", () => {
  // Nejdřív změň
  modelStore.setModels({ execModel: "ollama/kimi-k2.7-code:cloud" });
  // Reset
  const result = modelStore.resetModels();
  assert.strictEqual(result.execModel, modelStore.DEFAULTS.execModel);
  assert.strictEqual(result.ollamaModel, modelStore.DEFAULTS.ollamaModel);
});

// ===== Persistence =====

test("persistence: stav se uloží do souboru", () => {
  const stateFile = path.join(
    require("../server/config.cjs").SOVEREIGN_DIR,
    "model-state.json"
  );
  assert.ok(fs.existsSync(stateFile), "model-state.json should exist after setModels");
  const saved = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  assert.ok(saved.execModel, "saved execModel");
  assert.ok(saved.ollamaModel, "saved ollamaModel");
});
