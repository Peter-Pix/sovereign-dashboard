// ===== Routes: Leady =====
const fs = require("fs");
const path = require("path");

module.exports = function registerLeads(app, deps) {
  const { config } = deps;

  app.get("/api/leads", (req, res) => {
    const scoutDir = path.join(config.SOVEREIGN_DIR, "workspaces/scout");
    const all = [];
    if (fs.existsSync(scoutDir)) {
      fs.readdirSync(scoutDir).filter((f) => f.startsWith("leads") && f.endsWith(".json")).forEach((f) => {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(scoutDir, f), "utf8"));
          const leads = Array.isArray(data) ? data : (data.leads || []);
          leads.forEach((l) => all.push({ ...l, sourceFile: f }));
        } catch {}
      });
    }
    const seen = new Set();
    res.json(all.filter((l) => {
      const k = (l.name || "").toLowerCase();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    }));
  });
};
