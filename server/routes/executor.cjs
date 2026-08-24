// ===== Routes: Roadmap Executor (autonomní dokončování tasků) =====
const { asyncHandler, HttpError } = require("../lib/logger.cjs");

module.exports = function registerExecutor(app, deps) {
  const {
    requireAuth, isSafeName,
    findNextTask, executeOneTask,
    enqueueProjectTasks, startQueueWorker,
    getQueueState, pauseQueue, resumeQueue,
    getExecutionState, resetExecutionState,
  } = deps;

  // Promise-based mutex
  let executionLock = Promise.resolve();
  function withLock(fn) {
    const next = executionLock.then(fn, fn);
    executionLock = next.catch(() => {});
    return next;
  }

  app.get("/api/executor/next/:project", asyncHandler(async (req, res) => {
    const { project } = req.params;
    if (!isSafeName(project)) throw new HttpError(400, "Invalid project name");
    const next = findNextTask(project);
    if (!next) return res.json({ done: true, message: "Všechny tasky hotové (nebo stuck/vyčerpané)" });
    res.json({ done: false, ...next });
  }));

  app.get("/api/executor/state", (req, res) => {
    res.json({ ...getExecutionState(), ...getQueueState() });
  });

  app.post("/api/executor/reset", requireAuth, asyncHandler(async (req, res) => {
    resetExecutionState();
    res.json({ success: true, message: "Exekuční stav resetován" });
  }));

  app.post("/api/executor/run/:project", requireAuth, asyncHandler(async (req, res) => {
    const { project } = req.params;
    if (!isSafeName(project)) throw new HttpError(400, "Invalid project name");

    try {
      const result = await withLock(() => new Promise((resolve, reject) => {
        executeOneTask(project, (err, result) => {
          if (err) return reject(err);
          resolve(result);
        });
      }));
      res.json(result);
    } catch (e) {
      throw new HttpError(400, e.message);
    }
  }));

  app.post("/api/executor/run-all/:project", requireAuth, asyncHandler(async (req, res) => {
    const { project } = req.params;
    if (!isSafeName(project)) throw new HttpError(400, "Invalid project name");

    const added = enqueueProjectTasks(project);
    if (added === 0) {
      return res.json({ success: true, queued: 0, message: "Žádné nové tasky (vše hotové nebo ve frontě)" });
    }

    startQueueWorker();
    res.json({ success: true, queued: added, message: `${added} tasků zařazeno do fronty (poll /api/executor/queue pro stav)` });
  }));

  app.post("/api/executor/queue/pause", requireAuth, asyncHandler(async (req, res) => {
    res.json(pauseQueue());
  }));

  app.post("/api/executor/queue/resume", requireAuth, asyncHandler(async (req, res) => {
    res.json(resumeQueue());
  }));

  app.post("/api/executor/queue/:project", requireAuth, asyncHandler(async (req, res) => {
    const { project } = req.params;
    if (!isSafeName(project)) throw new HttpError(400, "Invalid project name");

    const added = enqueueProjectTasks(project);
    if (added === 0) {
      return res.json({ success: true, queued: 0, message: "Žádné nové tasky k zařazení" });
    }
    startQueueWorker();
    res.json({ success: true, queued: added, message: `${added} tasků zařazeno do fronty` });
  }));

  app.get("/api/executor/queue", (req, res) => {
    res.json(getQueueState());
  });
};
