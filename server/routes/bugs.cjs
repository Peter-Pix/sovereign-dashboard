// ===== Routes: Bug tickets =====
const fs = require("fs");
const path = require("path");

module.exports = function registerBugs(app, deps) {
  const { config, requireAuth, isSafeName } = deps;

  app.post("/api/bugs", requireAuth, (req, res) => {
    const { project, title, description, severity } = req.body;
    if (!project || !title) return res.status(400).json({ error: "project and title required" });
    // Bug 7: Path traversal ochrana
    if (!isSafeName(project)) return res.status(400).json({ error: "Invalid project name" });

    const bugsDir = path.join(config.PROJECTS_DIR, project, "bugs");
    if (!fs.existsSync(bugsDir)) fs.mkdirSync(bugsDir, { recursive: true });
    const id = `bug-${Date.now()}`;
    const bug = { id, title, description: description || "", severity: severity || "medium", status: "open", created: new Date().toISOString(), resolved: null };
    fs.writeFileSync(path.join(bugsDir, `${id}.json`), JSON.stringify(bug, null, 2));
    res.json(bug);
  });

  app.patch("/api/bugs/:project/:id", requireAuth, (req, res) => {
    const { project, id } = req.params;
    // Bug 7: Path traversal ochrana
    if (!isSafeName(project)) return res.status(400).json({ error: "Invalid project name" });
    // ID by měl být jen alfanumerický s pomlčkami (např. bug-1234567890)
    if (!/^bug-\d+$/.test(id)) return res.status(400).json({ error: "Invalid bug id format" });

    const bugPath = path.join(config.PROJECTS_DIR, project, "bugs", `${id}.json`);
    // Po validaci ověříme, že výsledná cesta je stále uvnitř PROJECTS_DIR
    const resolved = path.resolve(bugPath);
    if (!resolved.startsWith(path.resolve(config.PROJECTS_DIR))) {
      return res.status(403).json({ error: "Path outside allowed root" });
    }
    if (!fs.existsSync(bugPath)) return res.status(404).json({ error: "Bug not found" });

    const bug = JSON.parse(fs.readFileSync(bugPath, "utf8"));
    const { status, resolved: resolvedAt } = req.body;
    if (status) bug.status = status;
    if (resolvedAt) bug.resolved = resolvedAt;
    if (status === "resolved" && !bug.resolved) bug.resolved = new Date().toISOString();
    fs.writeFileSync(bugPath, JSON.stringify(bug, null, 2));
    res.json(bug);
  });
};
