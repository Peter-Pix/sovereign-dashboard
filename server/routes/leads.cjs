// ===== Routes: Leady =====
const fs = require("fs");
const path = require("path");
const { asyncHandler, HttpError } = require("../lib/logger.cjs");

module.exports = function registerLeads(app, deps) {
  const { config } = deps;

  app.get("/api/leads", asyncHandler(async (req, res) => {
    const scoutDir = path.join(config.SOVEREIGN_DIR, "workspaces/scout");
    const all = [];
    if (!fs.existsSync(scoutDir)) return res.json(all);

    const files = fs.readdirSync(scoutDir).filter((f) => f.startsWith("leads") && f.endsWith(".json"));
    for (const f of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(scoutDir, f), "utf8"));
        const leads = Array.isArray(data) ? data : (data.leads || []);
        for (const l of leads) {
          if (l && typeof l === "object") all.push({ ...l, sourceFile: f });
        }
      } catch (e) {
        // skip corrupted file
        console.warn(`[Leads] Skip corrupted file ${f}: ${e.message}`);
      }
    }

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
  }));
};
