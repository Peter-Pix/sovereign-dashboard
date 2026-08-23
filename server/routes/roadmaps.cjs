// ===== Routes: Roadmapy =====
const fs = require("fs");
const path = require("path");

module.exports = function registerRoadmaps(app, deps) {
  const { config, collectRoadmaps, isSafeName } = deps;

  // Seznam všech roadmap napříč projekty
  app.get("/api/roadmaps", (req, res) => {
    try {
      const roadmaps = collectRoadmaps();
      res.json(roadmaps);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Detail roadmapy konkrétního projektu (raw markdown + parsed)
  app.get("/api/roadmaps/:project", (req, res) => {
    const { project } = req.params;
    if (!isSafeName(project)) return res.status(400).json({ error: "Invalid project name" });

    const projectDir = path.join(config.PROJECTS_DIR, project);
    if (!fs.existsSync(projectDir)) return res.status(404).json({ error: "Project not found" });

    const { findRoadmapFiles, parseRoadmap } = require("../lib/roadmaps.cjs");
    const files = findRoadmapFiles(projectDir);
    if (files.length === 0) return res.status(404).json({ error: "No roadmap found" });

    const results = files.map((file) => {
      const content = fs.readFileSync(path.join(projectDir, file), "utf8");
      return {
        file,
        content,
        parsed: parseRoadmap(content),
      };
    });

    res.json({ project, roadmaps: results });
  });
};
