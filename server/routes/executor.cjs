// ===== Routes: Roadmap Executor (autonomní dokončování tasků) =====
const { asyncHandler, HttpError } = require("../lib/logger.cjs");
const rateLimiter = require("../lib/rateLimiter.cjs");

module.exports = function registerExecutor(app, deps) {
  const {
    requireAuth, isSafeName, rateLimitMiddleware,
    findNextTask, executeOneTask,
    enqueueProjectTasks, startQueueWorker,
    getQueueState, pauseQueue, resumeQueue,
    getExecutionState, resetExecutionState,
    pauseProcess, resumeProcess, pauseProject,
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

  app.post("/api/executor/run/:project",
    requireAuth,
    rateLimitMiddleware.rateLimitByRoute("/api/executor/run/:project"),
    asyncHandler(async (req, res) => {
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

  app.post("/api/executor/queue/pause", requireAuth, asyncHandler(async (req, res) => {
    res.json(pauseQueue());
  }));

  app.post("/api/executor/queue/resume", requireAuth, asyncHandler(async (req, res) => {
    res.json(resumeQueue());
  }));

  // Per-process pause/resume — pozastaví JEDEN task/agenta
  app.post("/api/executor/process/pause",
    requireAuth,
    rateLimitMiddleware.rateLimitByRoute("/api/executor/process/pause"),
    asyncHandler(async (req, res) => {
    const { key } = req.body || {};
    if (!key) throw new HttpError(400, "Chybí key procesu");
    res.json(pauseProcess(String(key)));
  }));

  app.post("/api/executor/process/resume",
    requireAuth,
    rateLimitMiddleware.rateLimitByRoute("/api/executor/process/resume"),
    asyncHandler(async (req, res) => {
    const { key } = req.body || {};
    if (!key) throw new HttpError(400, "Chybí key procesu");
    res.json(resumeProcess(String(key)));
  }));

  // Pozastav všechny procesy projektu
  app.post("/api/executor/project/pause",
    requireAuth,
    rateLimitMiddleware.rateLimitByRoute("/api/executor/project/pause"),
    asyncHandler(async (req, res) => {
    const { project } = req.body || {};
    if (!isSafeName(project)) throw new HttpError(400, "Invalid project name");
    res.json(pauseProject(project));
  }));

  app.post("/api/executor/queue/:project",
    requireAuth,
    rateLimitMiddleware.rateLimitByRoute("/api/executor/queue/:project"),
    asyncHandler(async (req, res) => {
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
