// ===== Routes: Context-Aware Prompting preview =====
const { asyncHandler, HttpError } = require("../lib/logger.cjs");
const { buildContext } = require("../lib/contextBuilder.cjs");

module.exports = function registerContext(app, deps) {
  const { requireAuth, isSafeName } = deps;

  // POST /api/context/preview — ukáže, jaký kontext by se dostal do promptu
  app.post("/api/context/preview", requireAuth, asyncHandler(async (req, res) => {
    const { project, task, maxFiles = 8, maxCharsPerFile = 3000 } = req.body || {};
    if (!isSafeName(project)) throw new HttpError(400, "Invalid project name");
    if (!task || typeof task !== "string") throw new HttpError(400, "Task text required");

    try {
      const result = buildContext(project, task, { maxFiles, maxCharsPerFile });
      res.json(result);
    } catch (e) {
      throw new HttpError(500, e.message);
    }
  }));
};
