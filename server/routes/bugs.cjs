// ===== Routes: Bug tickets =====
const fs = require("fs");
const path = require("path");
const { asyncHandler, HttpError } = require("../lib/logger.cjs");

module.exports = function registerBugs(app, deps) {
  const { config, requireAuth, isSafeName } = deps;

  app.post("/api/bugs", requireAuth, asyncHandler(async (req, res) => {
    const { project, title, description, severity } = req.body || {};
    if (!project || !title) throw new HttpError(400, "project and title required");
    if (!isSafeName(project)) throw new HttpError(400, "Invalid project name", { details: "Name must match /^[A-Za-z0-9._-]+$/" });

    const bugsDir = path.join(config.PROJECTS_DIR, project, "bugs");
    try {
      if (!fs.existsSync(bugsDir)) fs.mkdirSync(bugsDir, { recursive: true });
    } catch (e) {
      throw new HttpError(500, "Failed to create bugs dir", { details: e.message, expose: false });
    }

    const id = `bug-${Date.now()}`;
    const bug = { id, title, description: description || "", severity: severity || "medium", status: "open", created: new Date().toISOString(), resolved: null };
    try {
      fs.writeFileSync(path.join(bugsDir, `${id}.json`), JSON.stringify(bug, null, 2));
    } catch (e) {
      throw new HttpError(500, "Failed to write bug file", { details: e.message, expose: false });
    }
    res.json(bug);
  }));

  app.patch("/api/bugs/:project/:id", requireAuth, asyncHandler(async (req, res) => {
    const { project, id } = req.params;
    if (!isSafeName(project)) throw new HttpError(400, "Invalid project name");
    if (!/^bug-\d+$/.test(id)) throw new HttpError(400, "Invalid bug id format");

    const bugPath = path.join(config.PROJECTS_DIR, project, "bugs", `${id}.json`);
    const resolved = path.resolve(bugPath);
    if (!resolved.startsWith(path.resolve(config.PROJECTS_DIR))) {
      throw new HttpError(403, "Path outside allowed root");
    }
    if (!fs.existsSync(bugPath)) throw new HttpError(404, "Bug not found");

    let bug;
    try {
      bug = JSON.parse(fs.readFileSync(bugPath, "utf8"));
    } catch (e) {
      throw new HttpError(500, "Failed to read bug", { details: e.message, expose: false });
    }
    const { status, resolved: resolvedAt } = req.body || {};
    if (status) bug.status = status;
    if (resolvedAt) bug.resolved = resolvedAt;
    if (status === "resolved" && !bug.resolved) bug.resolved = new Date().toISOString();

    try {
      fs.writeFileSync(bugPath, JSON.stringify(bug, null, 2));
    } catch (e) {
      throw new HttpError(500, "Failed to write bug", { details: e.message, expose: false });
    }
    res.json(bug);
  }));
};
