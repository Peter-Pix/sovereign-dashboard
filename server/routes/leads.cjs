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
    // Bug 6: dedup přes name + city (kolize pro firmy se stejným názvem v různých městech)
    const seen = new Set();
    res.json(all.filter((l) => {
      const name = (l.name || "").toLowerCase().trim();
      if (!name) return false;
      const city = (l.city || l.lokace || l.location || "").toLowerCase().trim();
      const key = `${name}::${city}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }));
  });
};
