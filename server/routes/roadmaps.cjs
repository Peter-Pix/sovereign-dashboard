// ===== Routes: Roadmapy =====
const fs = require("fs");
const path = require("path");
const { asyncHandler, HttpError } = require("../lib/logger.cjs");

module.exports = function registerRoadmaps(app, deps) {
  const { config, collectRoadmaps, isSafeName, buildRoadmapState, getExecutionState, getQueueState } = deps;

  // ONE SOURCE OF TRUTH — agregovaný stav roadmap (markdown + live exekuce).
  // UI čte jen tento endpoint místo kombinování /api/roadmaps + /api/executor/state.
  app.get("/api/roadmaps/state", asyncHandler(async (req, res) => {
    const executorState = { ...getExecutionState(), ...getQueueState() };
    res.json(buildRoadmapState(executorState));
  }));

  app.get("/api/roadmaps", asyncHandler(async (req, res) => {
    try {
      const roadmaps = collectRoadmaps();
      res.json(roadmaps);
    } catch (e) {
      throw new HttpError(500, "Failed to collect roadmaps", { details: e.message, expose: false });
    }
  }));

  app.get("/api/roadmaps/:project", asyncHandler(async (req, res) => {
    const { project } = req.params;
    if (!isSafeName(project)) throw new HttpError(400, "Invalid project name");

    const projectDir = path.join(config.PROJECTS_DIR, project);
    if (!fs.existsSync(projectDir)) throw new HttpError(404, "Project not found");

    const { findRoadmapFiles, parseRoadmap } = require("../lib/roadmaps.cjs");
    const files = findRoadmapFiles(projectDir);
    if (files.length === 0) throw new HttpError(404, "No roadmap found");

    const results = [];
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(projectDir, file), "utf8");
        results.push({ file, content, parsed: parseRoadmap(content) });
      } catch (e) {
        // skip unreadable file
      }
    }

    res.json({ project, roadmaps: results });
  }));
};
