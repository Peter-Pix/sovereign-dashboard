// ===== Routes: Soubory (workspace + captures, dir listing) =====
const fs = require("fs");
const path = require("path");
const { asyncHandler, HttpError, logError } = require("../lib/logger.cjs");

module.exports = function registerFiles(app, deps) {
  const { config } = deps;

  app.get("/api/files", asyncHandler(async (req, res) => {
    const { p } = req.query;
    if (!p || typeof p !== "string") throw new HttpError(400, "p (path) required");

    const abs = path.resolve(p);

    const allowedRoots = [config.SOVEREIGN_DIR, config.PAPARAZZI_DIR]
      .filter(Boolean)
      .map(r => path.resolve(r));

    const inside = allowedRoots.some((root) => {
      const rel = path.relative(root, abs);
      return rel.length > 0 && !rel.startsWith("..") && !path.isAbsolute(rel);
    });

    if (!inside) throw new HttpError(403, "Path outside allowed roots");

    let stat;
    try { stat = fs.statSync(abs); } catch (e) {
      if (e.code === "ENOENT") throw new HttpError(404, "File not found");
      throw new HttpError(500, "stat failed", { details: e.message, expose: false });
    }

    if (stat.isDirectory()) {
      let entries;
      try {
        entries = fs.readdirSync(abs, { withFileTypes: true });
      } catch (e) {
        throw new HttpError(500, "readdir failed", { details: e.message, expose: false });
      }
      const mapped = entries
        .filter((e) => !e.name.startsWith("."))
        .map((e) => {
          let size = null;
          if (e.isFile()) {
            try { size = fs.statSync(path.join(abs, e.name)).size; } catch (e) {
              logError({ err: e, extra: { source: "files_stat", path: abs } });
            }
          }
          return { name: e.name, type: e.isDirectory() ? "dir" : "file", size };
        })
        .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));
      return res.json({ path: abs, type: "directory", entries: mapped });
    }
    if (!stat.isFile()) throw new HttpError(404, "Not a regular file");
    res.sendFile(abs, { dotfiles: "allow" });
  }));
};
