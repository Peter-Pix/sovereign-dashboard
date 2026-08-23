// ===== Routes: Paparazzi (captures, data, report) =====
const fs = require("fs");

module.exports = function registerPaparazzi(app, deps) {
  const { config, requireAuth, gatherAllData, buildPaparazziPrompt, callOllama } = deps;

  // --- Capture (trigger) ---
  app.post("/api/paparazzi/capture", requireAuth, (req, res) => {
    const { project, url, tag = "AUTO", title = "snapshot" } = req.body;
    if (!url) return res.status(400).json({ error: "URL is required for capture" });
    console.log(`[Paparazzi] Capture request: Project=${project}, URL=${url}, Tag=${tag}, Title=${title}`);
    res.json({ success: true, message: "Capture request received" });
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
    try {
      const { projects, summary, system } = await gatherAllData();
      const payload = { projects, summary, system, cached: false };
      dataCache = payload;
      dataCacheAt = now;
      res.json(payload);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- Streaming Report ---
  app.get("/api/paparazzi/report", async (req, res) => {
    const force = req.query.refresh === "1";
    const now = Date.now();
    
    // Check for cached report first (if not forced)
    if (!force && fs.existsSync(config.PAPARAZZI_REPORT_FILE)) {
      const stats = fs.statSync(config.PAPARAZZI_REPORT_FILE);
      if (now - stats.mtimeMs < config.PAPARAZZI_CACHE_TTL_MS) {
        const reportData = JSON.parse(fs.readFileSync(config.PAPARAZZI_REPORT_FILE, "utf8"));
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.write(`data: ${JSON.stringify({ type: "report", content: reportData.report, cached: true })}\n\n`);
        return res.end();
      }
    }

    try {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      const { summary, system } = await gatherAllData();
      res.write(`data: ${JSON.stringify({ type: "metadata", summary, system })}\n\n`);

      const prompt = buildPaparazziPrompt(system, summary);
      const fullReport = await callOllama(prompt, (token) => {
        res.write(`data: ${JSON.stringify({ type: "token", content: token })}\n\n`);
      });

      const reportPayload = { report: fullReport, system, summary, generatedAt: new Date().toISOString() };
      fs.mkdirSync(config.PAPARAZZI_REPORT_DIR, { recursive: true });
      fs.writeFileSync(config.PAPARAZZI_REPORT_FILE, JSON.stringify(reportPayload, null, 2));

      res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
      res.end();
    } catch (err) {
      console.error("[Paparazzi] Streaming error:", err.message);
      res.write(`data: ${JSON.stringify({ type: "error", content: err.message })}\n\n`);
      res.end();
    }
  });
};
