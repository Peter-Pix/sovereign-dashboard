// ===== Unit testy pro one source of truth (lib/roadmapState.cjs) =====
const { test } = require("node:test");
const assert = require("node:assert");
const { buildRoadmapState } = require("../server/lib/roadmapState.cjs");

// Mock executorState
const mockExecutor = {
  slots: { total: 3, used: 2 },
  active: [
    { project: "projA", agent: "archivist", task: "Fix bug", model: "ollama/deepseek-v4-flash:cloud", startedAt: "2026-08-26T10:00:00Z", file: "ROADMAP.md", phase: "F1" },
    { project: "projB", agent: "scout", task: "Find leads", model: "ollama/deepseek-v4-flash:cloud", startedAt: "2026-08-26T10:00:01Z" },
  ],
  perProject: { projA: 1, projB: 1 },
  queueLength: 5,
  workerRunning: true,
  paused: false,
};

test("buildRoadmapState: slots.allFull reflektuje obsazenost", () => {
  const s = buildRoadmapState({ ...mockExecutor, slots: { total: 3, used: 3 } });
  assert.strictEqual(s.slots.allFull, true);
  const s2 = buildRoadmapState(mockExecutor);
  assert.strictEqual(s2.slots.allFull, false);
});

test("buildRoadmapState: summary agreguje projekty", () => {
  const s = buildRoadmapState(mockExecutor);
  assert.ok(s.summary.projectCount >= 1);
  assert.strictEqual(typeof s.summary.overallProgress, "number");
  assert.strictEqual(typeof s.summary.runningAgents, "number");
  assert.strictEqual(s.summary.runningAgents, 2); // z active
});

test("buildRoadmapState: activeExecutions kopíruje běžící tasky", () => {
  const s = buildRoadmapState(mockExecutor);
  assert.strictEqual(s.activeExecutions.length, 2);
  assert.strictEqual(s.activeExecutions[0].project, "projA");
  assert.ok(s.activeExecutions[0].model.includes("deepseek"), "model by měl být deepseek");
});

test("buildRoadmapState: každý projekt má execution blok", () => {
  const s = buildRoadmapState(mockExecutor);
  for (const p of s.projects) {
    assert.ok(p.execution, "execution chybí");
    assert.ok(Array.isArray(p.execution.activeTasks), "activeTasks musí být pole");
    assert.strictEqual(typeof p.execution.running, "number");
  }
});

test("buildRoadmapState: queue + perProject jsou propagovány", () => {
  const s = buildRoadmapState(mockExecutor);
  assert.strictEqual(s.queue.length, 5);
  assert.strictEqual(s.queue.workerRunning, true);
  assert.deepStrictEqual(s.perProject, { projA: 1, projB: 1 });
  assert.ok(s.updatedAt, "updatedAt chybí");
});
