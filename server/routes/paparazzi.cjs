// ===== Routes: Paparazzi (captures, data, report) =====
const fs = require("fs");

module.exports = function registerPaparazzi(app, deps) {
  const { config, requireAuth, SKIP_DIRS, collectProjectData, summarizeProjects, collectSystemData, gatherAllData, buildPaparazziPrompt, callOllama } = deps;

  // --- Capture (trigger) ---
  app.post("/api/paparazzi/capture", requireAuth, (req, res) => {
    const { project, url, tag = "AUTO", title = "snapshot" } = req.body;
    if (!url) return res.status(400).json({ error: "URL is required for capture" });
    console.log(`[Paparazzi] Capture request: Project=${project}, URL=${url}, Tag=${tag}, Title=${title}`);
    res.json({ success: true, message: "Capture request received", instruction: "Trigger the OpenClaw browser tool to save the screenshot to the Paparazzi iCloud directory." });
  });

  // --- Captures list ---
  app.get("/api/paparazzi", (req, res) => {
    const captures = [];
    if (fs.existsSync(config.PAPARAZZI_DIR)) {
      fs.readdirSync(config.PAPARAZZI_DIR).filter((f) => f.endsWith(".jpg")).forEach((f) => {
        const parts = f.replace(".jpg", "").split("_");
        captures.push({ filename: f, timestamp: parts[0] + "_" + parts[1], tag: parts[2] || "IDLE", title: parts.slice(3).join(" ") || "unknown" });
      });
    }
    res.json(captures);
  });

  // --- Data collection (cached 5 min) ---
  let dataCache = null;
  let dataCacheAt = 0;
  app.get("/api/paparazzi/data", async (req, res) => {
    const force = req.query.refresh === "1";
    const now = Date.now();
    if (!force && dataCache && now - dataCacheAt < config.PAPARAZZI_DATA_TTL_MS) {
      return res.json({ ...dataCache, cached: true, cachedAt: dataCacheAt });
    }
    const { projects, summary, system } = await gatherAllData();
    const payload = { projects, summary, system, cached: false };
    dataCache = payload;
    dataCacheAt = now;
    res.json(payload);
  });

  // --- Manažer Report (cached 60s) ---
  let reportCache = null;
  let reportCacheAt = 0;
  app.get("/api/paparazzi/report", async (req, res) => {
    const force = req.query.refresh === "1";
    const now = Date.now();
    if (!force && reportCache && now - reportCacheAt < config.PAPARAZZI_CACHE_TTL_MS) {
      return res.json({ ...reportCache, cached: true, cachedAt: reportCacheAt });
    }
    try {
      const { summary, system } = await gatherAllData();
      const prompt = buildPaparazziPrompt(system, summary);
      const report = await callOllama(prompt);
      const payload = { report: typeof report === "string" ? report : JSON.stringify(report), system, summary, generatedAt: new Date().toISOString(), cached: false };
      reportCache = payload;
      reportCacheAt = now;
      res.json(payload);
    } catch (err) {
      console.error("[Paparazzi] Report selhal:", err.message);
      res.status(500).json({ error: err.message });
    }
  });
};
