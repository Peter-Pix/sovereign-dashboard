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

// ===== Roadmapy =====
const { parseRoadmap, isRoadmapFile } = require("../server/lib/roadmaps.cjs");

test("parseRoadmap: parsuje fáze a checklisty", () => {
  const md = `# Roadmap

## Fáze 1 — Základ
- [x] Hotový úkol
- [ ] Nehotový úkol

## Fáze 2 — Pokročilé
- [ ] Další úkol
`;
  const result = parseRoadmap(md);
  assert.strictEqual(result.totalCheckboxes, 3);
  assert.strictEqual(result.doneCheckboxes, 1);
  assert.strictEqual(result.progress, 33);
  assert.strictEqual(result.phases.length, 2);
  assert.strictEqual(result.phases[0].title, "Fáze 1 — Základ");
  assert.strictEqual(result.phases[0].done, 1);
  assert.strictEqual(result.phases[0].total, 2);
});

test("parseRoadmap: bez checklistů → 0", () => {
  const md = `# Jen nadpis\n\nNějaký text bez checklistů.`;
  const result = parseRoadmap(md);
  assert.strictEqual(result.totalCheckboxes, 0);
  assert.strictEqual(result.progress, 0);
});

test("isRoadmapFile: rozpozná roadmap soubory", () => {
  assert.strictEqual(isRoadmapFile("ROADMAP.md"), true);
  assert.strictEqual(isRoadmapFile("roadmap-v2.md"), true);
  assert.strictEqual(isRoadmapFile("MASTER-PLAN.md"), true);
  assert.strictEqual(isRoadmapFile("BUILD-PLAN.md"), true);
  assert.strictEqual(isRoadmapFile("README.md"), false);
  assert.strictEqual(isRoadmapFile("index.js"), false);
});

// ===== Executor (loop protection) =====
const { routeTaskToAgent, LIMITS, getExecutionState, resetExecutionState } = require("../server/lib/executor.cjs");

test("routeTaskToAgent: routuje podle klíčových slov", () => {
  assert.strictEqual(routeTaskToAgent("Audit projektu"), "archivist");
  assert.strictEqual(routeTaskToAgent("Najdi nové leady"), "scout");
  assert.strictEqual(routeTaskToAgent("Vytvoř pitch"), "strategist");
  assert.strictEqual(routeTaskToAgent("Zkontroluj status"), "spine");
  assert.strictEqual(routeTaskToAgent("Neznámý úkol"), "archivist"); // default
});

test("LIMITS: má ochranné limity", () => {
  assert.ok(LIMITS.MAX_TASKS_PER_RUN > 0);
  assert.ok(LIMITS.MAX_TOTAL_EXECUTIONS > 0);
  assert.ok(LIMITS.MAX_RETRIES_PER_TASK >= 0);
  assert.ok(LIMITS.COOLDOWN_MS > 0);
  assert.ok(LIMITS.AGENT_TIMEOUT_MS > 0);
});

test("getExecutionState: vrací stav s budgetem", () => {
  resetExecutionState();
  const state = getExecutionState();
  assert.strictEqual(state.totalExecutions, 0);
  assert.strictEqual(state.maxTotal, LIMITS.MAX_TOTAL_EXECUTIONS);
  assert.strictEqual(state.stuckTasks, 0);
});

// ===== Spinner (formatElapsed) =====
// Import z ESM modulu — použijeme dynamic import
test("formatElapsed: formátuje elapsed time", async () => {
  const { formatElapsed } = await import("../src/lib/format.js");
  assert.strictEqual(formatElapsed(0), "0s");
  assert.strictEqual(formatElapsed(5000), "5s");
  assert.strictEqual(formatElapsed(65000), "1m 5s");
  assert.strictEqual(formatElapsed(125000), "2m 5s");
  assert.strictEqual(formatElapsed(60000), "1m 0s");
});
