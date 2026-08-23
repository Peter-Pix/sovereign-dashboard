// ===== Routes: Soubory (workspace + captures, dir listing) =====
const fs = require("fs");
const path = require("path");

module.exports = function registerFiles(app, deps) {
  const { config } = deps;

  app.get("/api/files", (req, res) => {
    const { p } = req.query;
    if (!p || typeof p !== "string") return res.status(400).json({ error: "p (path) required" });
    const abs = path.resolve(p);
    const allowed = [config.SOVEREIGN_DIR, config.PAPARAZZI_DIR];
    const inside = allowed.some((root) => {
      const rel = path.relative(root, abs);
      return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
    });
    if (!inside) return res.status(403).json({ error: "Path outside allowed roots" });
    if (!fs.existsSync(abs)) return res.status(404).json({ error: "File not found" });

    const stat = fs.statSync(abs);
    if (stat.isDirectory()) {
      const entries = fs.readdirSync(abs, { withFileTypes: true })
        .filter((e) => !e.name.startsWith("."))
        .map((e) => ({ name: e.name, type: e.isDirectory() ? "dir" : "file", size: e.isFile() ? fs.statSync(path.join(abs, e.name)).size : null }))
        .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));
      return res.json({ path: abs, type: "directory", entries });
    }
    if (!stat.isFile()) return res.status(404).json({ error: "Not a regular file" });
    res.sendFile(abs, { dotfiles: "allow" });
  });
};
