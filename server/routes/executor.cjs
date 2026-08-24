// ===== Routes: Roadmap Executor (autonomní dokončování tasků) =====
module.exports = function registerExecutor(app, deps) {
  const {
    requireAuth, isSafeName,
    findNextTask, executeOneTask, executeAllTasks,
    enqueueProjectTasks, startQueueWorker,
    getQueueState, pauseQueue, resumeQueue,
    getExecutionState, resetExecutionState,
  } = deps;

  // Bug 3: Promise-based mutex místo boolean flag
  // (zabraňuje race condition mezi run/run-all paralelními requesty)
  let executionLock = Promise.resolve();
  function withLock(fn) {
    const next = executionLock.then(fn, fn);
    executionLock = next.catch(() => {}); // zabrání, aby rejection propagoval dál
    return next;
  }

  // Další nehotový task v projektu
  app.get("/api/executor/next/:project", (req, res) => {
    const { project } = req.params;
    if (!isSafeName(project)) return res.status(400).json({ error: "Invalid project name" });
    const next = findNextTask(project);
    if (!next) return res.json({ done: true, message: "Všechny tasky hotové (nebo stuck/vyčerpané)" });
    res.json({ done: false, ...next });
  });

  app.get("/api/executor/state", (req, res) => {
    res.json({ ...getExecutionState(), ...getQueueState() });
  });

  app.post("/api/executor/reset", requireAuth, (req, res) => {
    resetExecutionState();
    res.json({ success: true, message: "Exekuční stav resetován" });
  });

  // Spustí JEDEN task (synchronní odpověď)
  app.post("/api/executor/run/:project", requireAuth, (req, res) => {
    const { project } = req.params;
    if (!isSafeName(project)) return res.status(400).json({ error: "Invalid project name" });

    withLock(() => new Promise((resolve, reject) => {
      executeOneTask(project, (err, result) => {
        if (err) return reject(err);
        resolve(result);
      });
    }))
      .then((result) => res.json(result))
      .catch((err) => res.status(400).json({ error: err.message }));
  });

  // Bug 10: /run-all je teď NON-BLOKUJÍCÍ — zařadí do fronty a vrátí se
  app.post("/api/executor/run-all/:project", requireAuth, (req, res) => {
    const { project } = req.params;
    if (!isSafeName(project)) return res.status(400).json({ error: "Invalid project name" });

    const added = enqueueProjectTasks(project);
    if (added === 0) {
      return res.json({ success: true, queued: 0, message: "Žádné nové tasky (vše hotové nebo ve frontě)" });
    }

    startQueueWorker();
    res.json({ success: true, queued: added, message: `${added} tasků zařazeno do fronty (poll /api/executor/queue pro stav)` });
  });

  // ===== QUEUE =====

  app.post("/api/executor/queue/pause", requireAuth, (req, res) => {
    res.json(pauseQueue());
  });

  app.post("/api/executor/queue/resume", requireAuth, (req, res) => {
    res.json(resumeQueue());
  });

  // Naplní frontu všemi nehotovými tasky projektu
  app.post("/api/executor/queue/:project", requireAuth, (req, res) => {
    const { project } = req.params;
    if (!isSafeName(project)) return res.status(400).json({ error: "Invalid project name" });

    const added = enqueueProjectTasks(project);
    if (added === 0) {
      return res.json({ success: true, queued: 0, message: "Žádné nové tasky k zařazení" });
    }
    startQueueWorker();
    res.json({ success: true, queued: added, message: `${added} tasků zařazeno do fronty` });
  });

  app.get("/api/executor/queue", (req, res) => {
    res.json(getQueueState());
  });
};
