// ===== Routes: Projekty =====
const fs = require("fs");
const path = require("path");

module.exports = function registerProjects(app, deps) {
  const { config, isSafeName, listProjectDirs, getProjectInfo } = deps;

  app.get("/api/projects", async (req, res) => {
    const dirs = listProjectDirs();
    const results = await Promise.allSettled(dirs.map((name) => getProjectInfo(name)));
    res.json(results.filter((r) => r.status === "fulfilled" && r.value).map((r) => r.value));
  });

  app.get("/api/projects/:name", async (req, res) => {
    const { name } = req.params;
    if (!isSafeName(name)) return res.status(400).json({ error: "Invalid project name" });
    const p = path.join(config.PROJECTS_DIR, name);
    if (!fs.existsSync(p) || !fs.existsSync(path.join(p, ".git"))) {
      return res.status(404).json({ error: "Project not found" });
    }
    try {
      const info = await getProjectInfo(name, { withLog: true });
      const bugsDir = path.join(p, "bugs");
      let bugs = [];
      if (fs.existsSync(bugsDir)) {
        bugs = fs.readdirSync(bugsDir).filter((f) => f.endsWith(".json")).map((f) => {
          const content = JSON.parse(fs.readFileSync(path.join(bugsDir, f), "utf8"));
          return { id: f.replace(".json", ""), ...content };
        });
      }
      res.json({ ...info, bugs });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
};
