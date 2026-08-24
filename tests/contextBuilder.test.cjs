// ===== Unit testy pro ContextBuilder =====

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const {
  walkProject,
  scoreFile,
  readFileChunk,
  isImportant,
  isSkippable,
  buildContext,
} = require("../server/lib/contextBuilder.cjs");
const config = require("../server/config.cjs");

// Vytvoříme dočasný testovací projekt
const TEST_PROJECT = "__context_test__";
const TEST_PATH = path.join(config.PROJECTS_DIR, TEST_PROJECT);

function setupProject() {
  fs.rmSync(TEST_PATH, { recursive: true, force: true });
  fs.mkdirSync(TEST_PATH, { recursive: true });
  fs.mkdirSync(path.join(TEST_PATH, "src"), { recursive: true });
  fs.mkdirSync(path.join(TEST_PATH, "node_modules"), { recursive: true });
  fs.writeFileSync(path.join(TEST_PATH, "README.md"), "# Test project\n\nToto je testovací projekt.");
  fs.writeFileSync(path.join(TEST_PATH, "package.json"), '{"name": "test"}');
  fs.writeFileSync(path.join(TEST_PATH, "src", "executor.cjs"), "function runTask() { return 1; }");
  fs.writeFileSync(path.join(TEST_PATH, "src", "utils.cjs"), "function helper() { return 2; }");
  fs.writeFileSync(path.join(TEST_PATH, "node_modules", "bad.js"), "// should be skipped");
  fs.writeFileSync(path.join(TEST_PATH, "logo.png"), "binary");
}

function teardownProject() {
  fs.rmSync(TEST_PATH, { recursive: true, force: true });
}

test("isImportant: pozná důležité soubory", () => {
  assert.strictEqual(isImportant("/foo/README.md"), true);
  assert.strictEqual(isImportant("/foo/package.json"), true);
  assert.strictEqual(isImportant("/foo/random.js"), false);
});

test("isSkippable: přeskakuje binárky a node_modules", () => {
  assert.strictEqual(isSkippable("/foo/logo.png"), true);
  assert.strictEqual(isSkippable("/foo/node_modules/bar.js"), true);
  assert.strictEqual(isSkippable("/foo/src/app.js"), false);
});

test("walkProject: najde relevantní soubory, vynechá node_modules", { timeout: 5000 }, () => {
  setupProject();
  try {
    const files = walkProject(TEST_PATH, 50);
    const names = files.map((f) => path.basename(f));
    assert.ok(names.includes("README.md"), "should include README");
    assert.ok(names.includes("package.json"), "should include package.json");
    assert.ok(names.includes("executor.cjs"), "should include executor.cjs");
    assert.ok(!names.includes("bad.js"), "should skip node_modules");
    assert.ok(!names.includes("logo.png"), "should skip png");
  } finally {
    teardownProject();
  }
});

test("scoreFile: vyšší skóre pro executor task", { timeout: 5000 }, () => {
  setupProject();
  try {
    const files = walkProject(TEST_PATH, 50);
    const scores = files.map((f) => ({
      name: path.basename(f),
      score: scoreFile(f, "opravit bug v executor", fs.readFileSync(f, "utf8")),
    }));
    const execScore = scores.find((s) => s.name === "executor.cjs")?.score || 0;
    const utilsScore = scores.find((s) => s.name === "utils.cjs")?.score || 0;
    assert.ok(execScore > utilsScore, `executor should score higher than utils (${execScore} vs ${utilsScore})`);
  } finally {
    teardownProject();
  }
});

test("readFileChunk: vrátí obsah nebo truncated", { timeout: 5000 }, () => {
  setupProject();
  try {
    const readme = readFileChunk(path.join(TEST_PATH, "README.md"), 1000);
    assert.ok(readme.includes("Test project"));
    const long = readFileChunk(path.join(TEST_PATH, "src", "executor.cjs"), 5);
    assert.ok(long.endsWith("[... truncated]"));
  } finally {
    teardownProject();
  }
});

test("buildContext: sestaví kontext pro projekt", { timeout: 5000 }, () => {
  setupProject();
  try {
    const result = buildContext(TEST_PROJECT, "opravit bug v executor", { maxFiles: 5, maxCharsPerFile: 500 });
    assert.ok(result.context.includes("Kontext projektu"));
    assert.ok(result.files.length > 0, "should include at least one file");
    assert.ok(result.usedTokens > 0);
  } finally {
    teardownProject();
  }
});

test("buildContext: odmítne neplatný název projektu", () => {
  assert.throws(() => buildContext("../etc/passwd", "task"), /Invalid project name/);
});

test("buildContext: odmítne neexistující projekt", () => {
  assert.throws(() => buildContext("neexistujici-projekt-12345", "task"), /Project not found/);
});
