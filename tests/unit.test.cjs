// ===== Unit testy pro čisté funkce (lib moduly) =====
// Používá Node built-in test runner (node:test) — žádná nová dependency.
const { test } = require("node:test");
const assert = require("node:assert");

const { isSafeName, summarizeProjects } = require("../server/lib/projects.cjs");
const { fmtBytes } = require("../server/lib/system.cjs");
const { buildPaparazziPrompt } = require("../server/lib/paparazzi.cjs");

test("isSafeName: povoluje bezpečné názvy", () => {
  assert.strictEqual(isSafeName("sovereign-dashboard"), true);
  assert.strictEqual(isSafeName("my_project"), true);
  assert.strictEqual(isSafeName("test123"), true);
  assert.strictEqual(isSafeName("foo.bar"), true);
});

test("isSafeName: odmítá nebezpečné názvy", () => {
  assert.strictEqual(isSafeName("foo;rm -rf /"), false);
  assert.strictEqual(isSafeName("../etc/passwd"), false);
  assert.strictEqual(isSafeName("foo bar"), false);
  assert.strictEqual(isSafeName(""), false);
  assert.strictEqual(isSafeName(null), false);
  assert.strictEqual(isSafeName(undefined), false);
  assert.strictEqual(isSafeName(123), false);
});

test("summarizeProjects: počítá správně", () => {
  const projects = [
    { name: "a", activity: "hot", dirty: true, hasReadme: true },
    { name: "b", activity: "active", dirty: false, hasReadme: false },
    { name: "c", activity: "idle", dirty: false, hasReadme: true },
  ];
  const result = summarizeProjects(projects);
  assert.strictEqual(result.counts.total, 3);
  assert.strictEqual(result.counts.hot, 1);
  assert.strictEqual(result.counts.dirty, 1);
  assert.strictEqual(result.counts.undocumented, 1);
  assert.ok(result.generatedAt);
});

test("summarizeProjects: prázdný seznam", () => {
  const result = summarizeProjects([]);
  assert.strictEqual(result.counts.total, 0);
  assert.strictEqual(result.counts.hot, 0);
  assert.strictEqual(result.counts.dirty, 0);
  assert.strictEqual(result.counts.undocumented, 0);
  assert.ok(result.summary.length >= 1);
});

test("fmtBytes: převádí správně", () => {
  assert.strictEqual(fmtBytes(0), "?");
  assert.strictEqual(fmtBytes(null), "?");
  assert.strictEqual(fmtBytes(undefined), "?");
  // 1 GB = 1073741824 bytes
  assert.strictEqual(fmtBytes(1073741824), "1.0 GB");
  // 512 MB = 536870912 bytes
  assert.strictEqual(fmtBytes(536870912), "512 MB");
});

test("buildPaparazziPrompt: obsahuje klíčové části", () => {
  const system = { hostname: "test", cpu: { pct: 50 } };
  const summary = { counts: { total: 5 } };
  const prompt = buildPaparazziPrompt(system, summary);
  assert.ok(prompt.includes("Paparazzi"));
  assert.ok(prompt.includes("SYSTEM STATE"));
  assert.ok(prompt.includes("ECOSYSTEM SUMMARY"));
  assert.ok(prompt.includes("Yo Peter"));
  assert.ok(prompt.includes("test")); // hostname je v JSON
});
