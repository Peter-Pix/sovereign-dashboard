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

// Sestaví kompletní agregovaný stav roadmap.
// @param {object} executorState — výstup getExecutionState()+getQueueState()
// @returns {object} one source of truth pro Roadmap UI
function buildRoadmapState(executorState) {
  const roadmaps = collectRoadmaps();
  const slots = executorState.slots || { total: 3, used: 0 };
  const active = executorState.active || [];
  const perProject = executorState.perProject || {};

  // Agreguj per projekt: roadmapa + exekuční stav
  const projects = roadmaps.map((rm) => {
    const running = perProject[rm.project] || 0;
    const activeHere = active.filter((a) => a.project === rm.project);

    return {
      project: rm.project,
      file: rm.file,
      progress: rm.progress,
      done: rm.doneCheckboxes,
      total: rm.totalCheckboxes,
      phases: rm.phases,
      updatedAt: rm.updatedAt,
      // --- Exekuční stav pro tento projekt ---
      execution: {
        running,
        activeTasks: activeHere.map((a) => ({
          task: a.task,
          agent: a.agent,
          model: a.model,
          startedAt: a.startedAt,
        })),
      },
    };
  });

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
      task: a.task,
      model: a.model,
      startedAt: a.startedAt,
    })),
    // Fronta — aktuální délka pro všechny projekty
    queue: {
      length: executorState.queueLength || 0,
      workerRunning: executorState.workerRunning || false,
      paused: executorState.paused || false,
    },
    updatedAt: new Date().toISOString(),
  };
}

module.exports = { buildRoadmapState };
