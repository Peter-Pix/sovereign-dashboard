// ===== Roadmap State — ONE SOURCE OF TRUTH pro Roadmapy =====
// Agreguje VŠECHNY zdroje stavu roadmap do jednoho modelu pro UI:
//   1. Roadmap data z markdown (collectRoadmaps)
//   2. Live exekuční stav (getExecutionState / getQueueState z executoru)
// UI čte JEN tento endpoint (/api/roadmaps/state) místo kombinování
// /api/roadmaps + /api/executor/state na klientovi.
//
// Odstraňuje nekonzistenci mezi markdown stavem a in-memory stavem exekuce
// a centralizuje "co se zobrazuje" na serveru.

const { collectRoadmaps } = require("./roadmaps.cjs");
const { mergeProjectRoadmaps, dedupStats } = require("./roadmapMerge.cjs");
const { AGENT_TASKS } = require("./agents.cjs");

// Sestaví kompletní agregovaný stav roadmap.
// @param {object} executorState — výstup getExecutionState()+getQueueState()
// @returns {object} one source of truth pro Roadmap UI
// Sestaví merged roadmap per projekt (dedup více .md souborů do jednoho).
function buildMergedProject(projectName, active, perProject, AGENT_TASKS) {
  const tasks = mergeProjectRoadmaps(projectName);
  if (tasks.length === 0) return null;

  const running = perProject[projectName] || 0;
  const activeHere = active.filter((a) => a.project === projectName);

  // Seskup tasky podle fáze
  const phaseMap = {};
  for (const t of tasks) {
    const ph = t.phase || "Obecné úkoly";
    if (!phaseMap[ph]) phaseMap[ph] = { title: ph, items: [], done: 0, total: 0 };
    phaseMap[ph].items.push({ text: t.text, done: t.done, sources: t.sources });
    phaseMap[ph].total++;
    if (t.done) phaseMap[ph].done++;
  }
  const phases = Object.values(phaseMap);
  const total = tasks.length;
  const done = tasks.filter((t) => t.done).length;
  const stats = dedupStats(projectName); // jednou, ne 2×

  return {
    project: projectName,
    file: tasks[0].canonicalFile, // canonical soubor pro UI
    files: stats.files, // kolik souborů bylo sloučeno
    deduped: stats.deduped, // kolik duplicit odstraněno
    progress: total > 0 ? Math.round((done / total) * 100) : 0,
    done,
    total,
    phases,
    updatedAt: new Date().toISOString(),
    // --- Exekuční stav pro tento projekt ---
    execution: {
      running,
      activeTasks: activeHere.map((a) => ({
        task: a.task,
        agent: a.agent,
        role: AGENT_TASKS[a.agent]?.name || a.agent,
        model: a.model,
        startedAt: a.startedAt,
        elapsedMs: a.elapsedMs || (a.startedAt ? Date.now() - new Date(a.startedAt).getTime() : 0),
      })),
    },
  };
}

function buildRoadmapState(executorState) {
  const roadmaps = collectRoadmaps();
  const slots = executorState.slots || { total: 3, used: 0 };
  const active = executorState.active || [];
  const perProject = executorState.perProject || {};

  // Unikátní projekty (dedup víc souborů → jeden záznam per projekt)
  const projectNames = [...new Set(roadmaps.map((r) => r.project))];
  const projects = projectNames
    .map((name) => buildMergedProject(name, active, perProject, AGENT_TASKS))
    .filter(Boolean);

  // Celková agregace napříč projekty
  const totalTasks = projects.reduce((sum, p) => sum + p.total, 0);
  const doneTasks = projects.reduce((sum, p) => sum + p.done, 0);
  const runningTotal = active.length;

  return {
    slots: {
      total: slots.total,
      used: slots.used,
      allFull: slots.used >= slots.total,
    },
    perProject,
    projects,
    summary: {
      projectCount: projects.length,
      totalTasks,
      doneTasks,
      overallProgress: totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0,
      runningAgents: runningTotal,
    },
    // Live exekuční detaily (všechny běžící napříč projekty)
    activeExecutions: active.map((a) => ({
      project: a.project,
      agent: a.agent,
      role: AGENT_TASKS[a.agent]?.name || a.agent,
      task: a.task,
      model: a.model,
      startedAt: a.startedAt,
      elapsedMs: a.elapsedMs || (a.startedAt ? Date.now() - new Date(a.startedAt).getTime() : 0),
    })),
    // Fronta — aktuální délka pro všechny projekty
    queue: {
      length: executorState.queueLength || 0,
      workerRunning: executorState.workerRunning || false,
      paused: executorState.paused || false,
      pausedProcesses: executorState.pausedProcesses || [],
    },
    updatedAt: new Date().toISOString(),
  };
}

module.exports = { buildRoadmapState };