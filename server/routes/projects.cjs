// ===== Routes: Projekty =====
const fs = require("fs");
const path = require("path");
const { asyncHandler, HttpError } = require("../lib/logger.cjs");

module.exports = function registerProjects(app, deps) {
  const { config, isSafeName, getProjectsCached, getProjectInfo } = deps;

  app.get("/api/projects", asyncHandler(async (req, res) => {
    try {
      const projects = await getProjectsCached();
      res.json(projects);
    } catch (e) {
      throw new HttpError(500, "Failed to collect projects", { details: e.message, expose: false });
    }
  }));

  app.get("/api/projects/:name", asyncHandler(async (req, res) => {
    const { name } = req.params;
    if (!isSafeName(name)) throw new HttpError(400, "Invalid project name", { details: "Name must match /^[A-Za-z0-9._-]+$/" });

    const p = path.join(config.PROJECTS_DIR, name);
    if (!fs.existsSync(p) || !fs.existsSync(path.join(p, ".git"))) {
      throw new HttpError(404, "Project not found");
    }
    try {
      const info = await getProjectInfo(name, { withLog: true });
      if (!info) throw new HttpError(500, "Failed to read project info", { expose: false });

      const bugsDir = path.join(p, "bugs");
      let bugs = [];
      if (fs.existsSync(bugsDir)) {
        try {
          bugs = fs.readdirSync(bugsDir).filter((f) => f.endsWith(".json")).map((f) => {
            try {
              return { id: f.replace(".json", ""), ...JSON.parse(fs.readFileSync(path.join(bugsDir, f), "utf8")) };
            } catch {
              return null; // skip corrupted bug file
            }
          }).filter(Boolean);
        } catch {}
      }
      res.json({ ...info, bugs });
    } catch (e) {
      if (e instanceof HttpError) throw e;
      throw new HttpError(500, "Project read failed", { details: e.message, expose: false });
    }
  }));
};
