// ===== Routes: Bug tickets =====
const fs = require("fs");
const path = require("path");

module.exports = function registerBugs(app, deps) {
  const { config, requireAuth } = deps;

  app.post("/api/bugs", requireAuth, (req, res) => {
    const { project, title, description, severity } = req.body;
    if (!project || !title) return res.status(400).json({ error: "project and title required" });
    const bugsDir = path.join(config.PROJECTS_DIR, project, "bugs");
    if (!fs.existsSync(bugsDir)) fs.mkdirSync(bugsDir, { recursive: true });
    const id = `bug-${Date.now()}`;
    const bug = { id, title, description: description || "", severity: severity || "medium", status: "open", created: new Date().toISOString(), resolved: null };
    fs.writeFileSync(path.join(bugsDir, `${id}.json`), JSON.stringify(bug, null, 2));
    res.json(bug);
  });

  app.patch("/api/bugs/:project/:id", requireAuth, (req, res) => {
    const { project, id } = req.params;
    const bugPath = path.join(config.PROJECTS_DIR, project, "bugs", `${id}.json`);
    if (!fs.existsSync(bugPath)) return res.status(404).json({ error: "Bug not found" });
    const bug = JSON.parse(fs.readFileSync(bugPath, "utf8"));
    const { status, resolved } = req.body;
    if (status) bug.status = status;
    if (resolved) bug.resolved = resolved;
    if (status === "resolved" && !bug.resolved) bug.resolved = new Date().toISOString();
    fs.writeFileSync(bugPath, JSON.stringify(bug, null, 2));
    res.json(bug);
  });
};
