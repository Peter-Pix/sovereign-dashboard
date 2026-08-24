// ===== Proaktivní alerting engine =====
// Hlídá projekty, agenty, executor queue a generuje alerty.

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const config = require("../config.cjs");
const rateLimiter = require("./rateLimiter.cjs");

const ALERTS_FILE = path.join(config.SOVEREIGN_DIR, "alerts.json");

// Severity levels
const SEVERITY = {
  CRITICAL: "critical",
  WARNING: "warning",
  INFO: "info",
};

// In-memory alerts
let alerts = loadAlerts();
let lastCheck = 0;

function loadAlerts() {
  try {
    if (fs.existsSync(ALERTS_FILE)) {
      return JSON.parse(fs.readFileSync(ALERTS_FILE, "utf8"));
    }
  } catch (e) {
    console.warn("[Alerts] Nelze načíst alerty:", e.message);
  }
  return { active: [], history: [] };
}

function persist() {
  try {
    fs.mkdirSync(path.dirname(ALERTS_FILE), { recursive: true });
    fs.writeFileSync(ALERTS_FILE, JSON.stringify(alerts, null, 2));
  } catch (e) {
    console.warn("[Alerts] Nelze uložit alerty:", e.message);
  }
}

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function addAlert({ category, severity, title, message, source, metadata = {} }) {
  const existing = alerts.active.find(
    (a) => a.category === category && a.source === source && !a.acknowledgedAt
  );

  if (existing) {
    // Update existing alert (dedup)
    existing.count = (existing.count || 1) + 1;
    existing.lastSeenAt = Date.now();
    existing.message = message;
    existing.metadata = { ...existing.metadata, ...metadata };
  } else {
    alerts.active.push({
      id: newId(),
      category,
      severity,
      title,
      message,
      source,
      metadata,
      count: 1,
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
      acknowledgedAt: null,
    });
  }

  persist();
  return existing || alerts.active[alerts.active.length - 1];
}

function acknowledgeAlert(id) {
  const idx = alerts.active.findIndex((a) => a.id === id);
  if (idx === -1) return null;
  const alert = alerts.active.splice(idx, 1)[0];
  alert.acknowledgedAt = Date.now();
  alerts.history.unshift(alert);
  // Keep history bounded
  if (alerts.history.length > 200) alerts.history = alerts.history.slice(0, 200);
  persist();
  return alert;
}

function dismissAlert(id) {
  const idx = alerts.active.findIndex((a) => a.id === id);
  if (idx === -1) return false;
  alerts.active.splice(idx, 1);
  persist();
  return true;
}

function getAlerts() {
  return {
    active: [...alerts.active],
    history: [...alerts.history],
    summary: {
      critical: alerts.active.filter((a) => a.severity === SEVERITY.CRITICAL).length,
      warning: alerts.active.filter((a) => a.severity === SEVERITY.WARNING).length,
      info: alerts.active.filter((a) => a.severity === SEVERITY.INFO).length,
      total: alerts.active.length,
    },
    lastCheck,
  };
}

// ===== Detectory =====

function detectProjectStagnation(projects, staleDays = 7) {
  const now = Date.now();
  for (const p of projects) {
    const daysSinceCommit = p.daysSinceCommit ?? p.health?.daysSinceCommit ?? 999;
    if (daysSinceCommit >= staleDays) {
      addAlert({
        category: "project_stagnation",
        severity: daysSinceCommit >= 14 ? SEVERITY.CRITICAL : SEVERITY.WARNING,
        title: "Projekt stagnuje",
        message: `${p.name}: poslední commit před ${daysSinceCommit} dny`,
        source: p.name,
        metadata: { daysSinceCommit, lastCommitAt: p.lastCommitAt },
      });
    }
  }
}

function detectDirtyWorkingTree(projects) {
  for (const p of projects) {
    if (p.git?.dirty || p.dirty) {
      addAlert({
        category: "dirty_tree",
        severity: SEVERITY.WARNING,
        title: "Dirty working tree",
        message: `${p.name}: working tree je dirty — hrozí nekonzistentní build cache`,
        source: p.name,
        metadata: { dirtyFiles: p.git?.dirtyFiles || p.dirtyFiles },
      });
    }
  }
}

function detectAgentBudgets() {
  const state = rateLimiter.getState();
  for (const [agent, [limit]] of Object.entries(state.agentBudget)) {
    const bucketKey = `agent:${agent}:${Math.floor(Date.now() / (24 * 60 * 60 * 1000))}`;
    const bucket = state.usageSummary[bucketKey];
    if (!bucket) continue;
    const used = bucket.tokens || 0;
    const ratio = used / limit;
    if (ratio >= 0.95) {
      addAlert({
        category: "agent_budget_critical",
        severity: SEVERITY.CRITICAL,
        title: `Agent ${agent} vyčerpal budget`,
        message: `${agent}: ${used}/${limit} tokenů (${Math.round(ratio * 100)}%)`,
        source: agent,
        metadata: { used, limit, ratio },
      });
    } else if (ratio >= 0.75) {
      addAlert({
        category: "agent_budget_warning",
        severity: SEVERITY.WARNING,
        title: `Agent ${agent} blízko limitu`,
        message: `${agent}: ${used}/${limit} tokenů (${Math.round(ratio * 100)}%)`,
        source: agent,
        metadata: { used, limit, ratio },
      });
    }
  }
}

function detectExecutorState(queueState, executionState) {
  if (queueState?.stuckTasks && queueState.stuckTasks.length > 0) {
    addAlert({
      category: "executor_stuck",
      severity: SEVERITY.CRITICAL,
      title: "Executor má stuck tasky",
      message: `${queueState.stuckTasks.length} tasků je zaseklých ve frontě`,
      source: "executor",
      metadata: { stuckTasks: queueState.stuckTasks },
    });
  }

  if (executionState?.paused) {
    addAlert({
      category: "executor_paused",
      severity: SEVERITY.INFO,
      title: "Executor queue je pozastavená",
      message: "Queue je ručně pozastavená — žádné tasky se nevykonávají",
      source: "executor",
      metadata: { pausedAt: queueState?.pausedAt },
    });
  }
}

// ===== Runner =====

async function runChecks(deps = {}) {
  const start = Date.now();

  try {
    const { getProjectsCached } = require("./projects.cjs");
    const { getQueueState, getExecutionState } = require("./executor.cjs");

    const projects = await getProjectsCached();
    detectProjectStagnation(projects, 7);
    detectDirtyWorkingTree(projects);
    detectAgentBudgets();
    detectExecutorState(getQueueState(), getExecutionState());

    lastCheck = Date.now();
    console.log(`[Alerts] Check completed in ${lastCheck - start}ms`);
  } catch (e) {
    console.error("[Alerts] Check failed:", e.message);
    addAlert({
      category: "alert_system_error",
      severity: SEVERITY.WARNING,
      title: "Alerting engine selhal",
      message: e.message,
      source: "alerts",
      metadata: { stack: e.stack },
    });
  }
}

function startAlertScheduler(intervalMs = 5 * 60 * 1000) {
  // První check hned
  runChecks();
  // Pak pravidelně
  const id = setInterval(runChecks, intervalMs);
  console.log(`[Alerts] Scheduler started (interval: ${intervalMs}ms)`);
  return id;
}

function resetAlerts() {
  alerts.active = [];
  alerts.history = [];
  persist();
}

module.exports = {
  SEVERITY,
  addAlert,
  acknowledgeAlert,
  dismissAlert,
  getAlerts,
  runChecks,
  startAlertScheduler,
  resetAlerts,
  detectProjectStagnation,
  detectDirtyWorkingTree,
  detectAgentBudgets,
  detectExecutorState,
};
