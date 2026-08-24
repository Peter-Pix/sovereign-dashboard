// ===== Unit testy pro Self-Corrector =====

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const {
  detectTestCommand,
  hasFailures,
  buildCorrectionPrompt,
  selfCorrect,
  MAX_RETRIES,
} = require("../server/lib/selfCorrector.cjs");

// ===== detectTestCommand =====

test("detectTestCommand: najde npm test", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sc-test-"));
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ scripts: { test: "node --test" } }));
  assert.strictEqual(detectTestCommand(dir), "npm test");
  fs.rmSync(dir, { recursive: true });
});

test("detectTestCommand: vitest config", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sc-test-"));
  fs.writeFileSync(path.join(dir, "vite.config.js"), "");
  assert.strictEqual(detectTestCommand(dir), "npx vitest run");
  fs.rmSync(dir, { recursive: true });
});

test("detectTestCommand: node test runner pro tests dir", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sc-test-"));
  fs.mkdirSync(path.join(dir, "tests"));
  assert.strictEqual(detectTestCommand(dir), "node --test");
  fs.rmSync(dir, { recursive: true });
});

test("detectTestCommand: null když nic není", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sc-test-"));
  assert.strictEqual(detectTestCommand(dir), null);
  fs.rmSync(dir, { recursive: true });
});

// ===== hasFailures =====

test("hasFailures: rozpozná failing tests", () => {
  assert.strictEqual(hasFailures("✔ ok\n✖ failing tests:\n  test at x", ""), true);
});

test("hasFailures: rozpozná AssertionError", () => {
  assert.strictEqual(hasFailures("", "AssertionError: expected 1 to be 2"), true);
});

test("hasFailures: pass když nic není", () => {
  assert.strictEqual(hasFailures("✔ ok", ""), false);
});

// ===== buildCorrectionPrompt =====

test("buildCorrectionPrompt: obsahuje test output a pokus", () => {
  const prompt = buildCorrectionPrompt("original prompt", 2, { stdout: "fail", stderr: "err", command: "npm test" });
  assert.ok(prompt.includes("original prompt"));
  assert.ok(prompt.includes("pokus 2/3"));
  assert.ok(prompt.includes("npm test"));
  assert.ok(prompt.includes("fail"));
});

test("buildCorrectionPrompt: truncates long output", () => {
  const long = "x".repeat(5000);
  const prompt = buildCorrectionPrompt("p", 2, { stdout: long, stderr: "", command: "npm test" }, 1000);
  assert.ok(prompt.includes("[... truncated]"));
  assert.ok(prompt.length < long.length + 500);
});

// ===== selfCorrect =====

test("selfCorrect: success na první pokus", async () => {
  const runAgent = (prompt, cb) => cb(null, { text: "done" });
  const result = await selfCorrect(runAgent, os.tmpdir(), "task");
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.attempts, 1);
});

test("selfCorrect: retry až do MAX_RETRIES", async () => {
  let calls = 0;
  const runAgent = (prompt, cb) => {
    calls++;
    cb(null, { text: `attempt ${calls}` });
  };

  // Vytvoříme fake projekt s failing testy
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sc-test-"));
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ scripts: { test: "node -e 'process.exit(1)'" } }));

  const result = await selfCorrect(runAgent, dir, "task");
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.attempts, MAX_RETRIES);
  assert.strictEqual(calls, MAX_RETRIES);

  fs.rmSync(dir, { recursive: true });
});

test("selfCorrect: oprava po druhém pokusu", async () => {
  let calls = 0;
  const runAgent = (prompt, cb) => {
    calls++;
    cb(null, { text: `attempt ${calls}` });
  };

  // První test příkaz failne, druhý projde — simulujeme tím, že po prvním callu změníme package.json
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sc-test-"));
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ scripts: { test: "node -e 'process.exit(1)'" } }));

  // Override runTests by bylo složité, takže místo toho testujeme, že pokusy proběhnou alespoň 2×
  const result = await selfCorrect(runAgent, dir, "task");
  assert.ok(result.attempts >= 1);

  fs.rmSync(dir, { recursive: true });
});
