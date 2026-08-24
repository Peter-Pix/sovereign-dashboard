// ===== Routes: Soubory (workspace + captures, dir listing) =====
const fs = require("fs");
const path = require("path");

module.exports = function registerFiles(app, deps) {
  const { config } = deps;

  app.get("/api/files", (req, res) => {
    const { p } = req.query;
    if (!p || typeof p !== "string") return res.status(400).json({ error: "p (path) required" });
    const abs = path.resolve(p);

    // Bug 1: Robustní path traversal ochrana
    // 1) Ověř, že cesta je uvnitř některého allowed root (path.resolve normalizuje)
    const allowedRoots = [config.SOVEREIGN_DIR, config.PAPARAZZI_DIR]
      .filter(Boolean)
      .map(r => path.resolve(r));

    const inside = allowedRoots.some((root) => {
      // path.resolve normalizuje oba, takže relativní cesty jako ../../etc/passwd
      // vyprodukují absolutní cestu mimo root → startsWith vrátí false
      const rel = path.relative(root, abs);
      // Relativní cesta je bezpečná jen pokud není absolutní a nezačíná ..
      return rel.length > 0 && !rel.startsWith("..") && !path.isAbsolute(rel);
    });

    if (!inside) return res.status(403).json({ error: "Path outside allowed roots" });
    if (!fs.existsSync(abs)) return res.status(404).json({ error: "File not found" });

    let stat;
    try { stat = fs.statSync(abs); } catch { return res.status(500).json({ error: "stat failed" }); }

    if (stat.isDirectory()) {
      let entries;
      try {
        entries = fs.readdirSync(abs, { withFileTypes: true });
      } catch { return res.status(500).json({ error: "readdir failed" }); }
      const mapped = entries
        .filter((e) => !e.name.startsWith("."))
        .map((e) => {
          let size = null;
          if (e.isFile()) {
            try { size = fs.statSync(path.join(abs, e.name)).size; } catch {}
          }
          return { name: e.name, type: e.isDirectory() ? "dir" : "file", size };
        })
        .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));
      return res.json({ path: abs, type: "directory", entries: mapped });
    }
    if (!stat.isFile()) return res.status(404).json({ error: "Not a regular file" });
    res.sendFile(abs, { dotfiles: "allow" });
  });
};
