// ===== Unit testy pro Alerting engine =====

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const alerts = require("../server/lib/alerts.cjs");
const config = require("../server/config.cjs");

const ALERTS_FILE = path.join(config.SOVEREIGN_DIR, "alerts.json");

function clearAlerts() {
  alerts.resetAlerts();
  try { fs.unlinkSync(ALERTS_FILE); } catch {}
}

// ===== Core =====

test("addAlert: vytvoří nový alert", () => {
  clearAlerts();
  const a = alerts.addAlert({
    category: "test",
    severity: "warning",
    title: "Test Alert",
    message: "Hello",
    source: "test",
  });
  assert.ok(a.id);
  assert.strictEqual(a.category, "test");
  assert.strictEqual(a.count, 1);
});

test("addAlert: deduplikuje stejný alert", () => {
  clearAlerts();
  alerts.addAlert({ category: "test", severity: "warning", title: "Dup", message: "x", source: "s1" });
  alerts.addAlert({ category: "test", severity: "warning", title: "Dup", message: "x", source: "s1" });
  const s = alerts.getAlerts();
  assert.strictEqual(s.active.length, 1);
  assert.strictEqual(s.active[0].count, 2);
});

test("acknowledgeAlert: přesune do historie", () => {
  clearAlerts();
  const a = alerts.addAlert({ category: "test", severity: "warning", title: "Ack", message: "x", source: "s1" });
  const moved = alerts.acknowledgeAlert(a.id);
  assert.ok(moved.acknowledgedAt);
  const s = alerts.getAlerts();
  assert.strictEqual(s.active.length, 0);
  assert.strictEqual(s.history.length, 1);
});

test("acknowledgeAlert: neexistující ID vrací null", () => {
  clearAlerts();
  assert.strictEqual(alerts.acknowledgeAlert("nope"), null);
});

test("dismissAlert: smaže bez historie", () => {
  clearAlerts();
  const a = alerts.addAlert({ category: "test", severity: "warning", title: "Dismiss", message: "x", source: "s1" });
  alerts.dismissAlert(a.id);
  const s = alerts.getAlerts();
  assert.strictEqual(s.active.length, 0);
});

test("getAlerts: summary správně počítá severity", () => {
  clearAlerts();
  alerts.addAlert({ category: "c1", severity: "critical", title: "C", message: "x", source: "s1" });
  alerts.addAlert({ category: "c2", severity: "warning", title: "W", message: "x", source: "s2" });
  alerts.addAlert({ category: "c3", severity: "info", title: "I", message: "x", source: "s3" });
  const s = alerts.getAlerts();
  assert.strictEqual(s.summary.critical, 1);
  assert.strictEqual(s.summary.warning, 1);
  assert.strictEqual(s.summary.info, 1);
  assert.strictEqual(s.summary.total, 3);
});

// ===== Detectory =====

test("detectProjectStagnation: vytvoří alert pro staré projekty", () => {
  clearAlerts();
  const projects = [
    { name: "old-project", daysSinceCommit: 15, lastCommitAt: "2020-01-01" },
    { name: "fresh-project", daysSinceCommit: 2, lastCommitAt: "2026-08-22" },
  ];
  alerts.detectProjectStagnation(projects, 7);
  const s = alerts.getAlerts();
  const found = s.active.find((a) => a.source === "old-project");
  assert.ok(found);
  assert.strictEqual(found.severity, "critical");
});

test("detectDirtyWorkingTree: vytvoří alert pro dirty projekty", () => {
  clearAlerts();
  const projects = [
    { name: "clean", daysSinceCommit: 1 },
    { name: "dirty", git: { dirty: true, dirtyFiles: ["foo.js"] } },
  ];
  alerts.detectDirtyWorkingTree(projects);
  const s = alerts.getAlerts();
  const found = s.active.find((a) => a.source === "dirty");
  assert.ok(found);
  assert.strictEqual(found.category, "dirty_tree");
});

test("detectExecutorState: vytvoří alert pro stuck tasky", () => {
  clearAlerts();
  alerts.detectExecutorState({ stuckTasks: ["task-1", "task-2"] }, { paused: false });
  const s = alerts.getAlerts();
  const found = s.active.find((a) => a.category === "executor_stuck");
  assert.ok(found);
  assert.strictEqual(found.severity, "critical");
});

test("detectExecutorState: vytvoří info alert pro paused queue", () => {
  clearAlerts();
  alerts.detectExecutorState({ stuckTasks: [] }, { paused: true });
  const s = alerts.getAlerts();
  const found = s.active.find((a) => a.category === "executor_paused");
  assert.ok(found);
  assert.strictEqual(found.severity, "info");
});

// ===== Persistence =====

test("persistence: alerty se uloží do souboru", () => {
  clearAlerts();
  alerts.addAlert({ category: "persist", severity: "warning", title: "P", message: "x", source: "s1" });
  assert.ok(fs.existsSync(ALERTS_FILE), "alerts.json should exist");
  const saved = JSON.parse(fs.readFileSync(ALERTS_FILE, "utf8"));
  assert.ok(saved.active.length > 0);
});
