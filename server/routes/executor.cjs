// ===== Routes: Roadmap Executor (autonomní dokončování tasků) =====
// S ochranou proti loopu a plýtvání tokeny.
module.exports = function registerExecutor(app, deps) {
  const { requireAuth, isSafeName, findNextTask, executeOneTask, executeAllTasks, getExecutionState, resetExecutionState } = deps;

  // Rate limiting — max 1 paralelní exekuce
  let running = false;

  // Zjistí, jaký je další nehotový task v projektu
  app.get("/api/executor/next/:project", (req, res) => {
    const { project } = req.params;
    if (!isSafeName(project)) return res.status(400).json({ error: "Invalid project name" });
    const next = findNextTask(project);
    if (!next) return res.json({ done: true, message: "Všechny tasky hotové (nebo stuck/vyčerpané)" });
    res.json({ done: false, ...next });
  });

  // Stav exekuce (monitoring)
  app.get("/api/executor/state", (req, res) => {
    res.json(getExecutionState());
  });

  // Reset exekučního stavu (pro novou session)
  app.post("/api/executor/reset", requireAuth, (req, res) => {
    resetExecutionState();
    res.json({ success: true, message: "Exekuční stav resetován" });
  });

  // Spustí autonomní dokončení jednoho tasku
  app.post("/api/executor/run/:project", requireAuth, (req, res) => {
    const { project } = req.params;
    if (!isSafeName(project)) return res.status(400).json({ error: "Invalid project name" });
    if (running) return res.status(429).json({ error: "Exekuce už běží. Počkejte na dokončení." });

    running = true;
    executeOneTask(project, (err, result) => {
      running = false;
      if (err) return res.status(400).json({ error: err.message });
      res.json(result);
    });
  });

  // Spustí dokončení VŠECH tasků (sekvenčně, s budget limitem)
  app.post("/api/executor/run-all/:project", requireAuth, (req, res) => {
    const { project } = req.params;
    if (!isSafeName(project)) return res.status(400).json({ error: "Invalid project name" });
    if (running) return res.status(429).json({ error: "Exekuce už běží." });

    running = true;
    executeAllTasks(project, (err, result) => {
      running = false;
      if (err) return res.status(400).json({ error: err.message });
      res.json(result);
    });
  });
};
