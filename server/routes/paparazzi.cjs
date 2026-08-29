// ===== Routes: Paparazzi (captures, data, report) =====
const fs = require("fs");
const { asyncHandler, HttpError, logError } = require("../lib/logger.cjs");

module.exports = function registerPaparazzi(app, deps) {
  const { config, requireAuth, gatherAllData, buildPaparazziPrompt, callOllama } = deps;

  // Capture (trigger)
  app.post("/api/paparazzi/capture", requireAuth, asyncHandler(async (req, res) => {
    const { project, url, tag = "AUTO", title = "snapshot" } = req.body;
    if (!url) throw new HttpError(400, "URL is required for capture");
    console.log(`[Paparazzi] Capture request: Project=${project}, URL=${url}, Tag=${tag}, Title=${title}`);
    res.json({ success: true, message: "Capture request received" });
  }));

  // Captures list
  app.get("/api/paparazzi", asyncHandler(async (req, res) => {
    const captures = [];
    if (!fs.existsSync(config.PAPARAZZI_DIR)) return res.json(captures);

    try {
      const files = fs.readdirSync(config.PAPARAZZI_DIR).filter((f) => f.endsWith(".jpg"));
      for (const f of files) {
        try {
          const parts = f.replace(".jpg", "").split("_");
          captures.push({
            filename: f,
            timestamp: parts[0] + "_" + parts[1],
            tag: parts[2] || "IDLE",
            title: parts.slice(3).join(" ") || "unknown",
          });
        } catch {
          // skip invalid filename
        }
      }
    } catch (e) {
      logError({ err: e, req, extra: { source: "paparazzi_list" } });
    }
    res.json(captures);
  }));

  // Data collection (cached 5 min)
  let dataCache = null;
  let dataCacheAt = 0;
  app.get("/api/paparazzi/data", asyncHandler(async (req, res) => {
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
      throw new HttpError(502, "Data collection failed", { details: e.message, expose: false });
    }
  }));

  // History
  app.get("/api/paparazzi/history", asyncHandler(async (req, res) => {
    const historyFile = config.PAPARAZZI_HISTORY_FILE;
    if (!fs.existsSync(historyFile)) return res.json([]);
    try {
      const history = JSON.parse(fs.readFileSync(historyFile, "utf8"));
      res.json(history);
    } catch (e) {
      throw new HttpError(500, "Failed to read history", { details: e.message, expose: false });
    }
  }));

  // SSE Streaming Report — kompletní error handling
  app.get("/api/paparazzi/report", asyncHandler(async (req, res) => {
    const force = req.query.refresh === "1";
    const now = Date.now();

    // SSE helper — pošle error event a ukončí spojení
    const sendError = (status, msg, details = null) => {
      if (res.headersSent) {
        try {
          res.write(`data: ${JSON.stringify({ type: "error", status, content: msg, details })}\n\n`);
          res.end();
        } catch {}
      } else {
        res.status(status).json({ error: msg, details });
      }
    };

    // Cached report — krátká SSE odpověď
    if (!force && fs.existsSync(config.PAPARAZZI_REPORT_FILE)) {
      try {
        const stats = fs.statSync(config.PAPARAZZI_REPORT_FILE);
        if (now - stats.mtimeMs < config.PAPARAZZI_CACHE_TTL_MS) {
          const reportData = JSON.parse(fs.readFileSync(config.PAPARAZZI_REPORT_FILE, "utf8"));
          res.setHeader("Content-Type", "text/event-stream");
          res.setHeader("Cache-Control", "no-cache");
          res.write(`data: ${JSON.stringify({ type: "report", content: reportData.report, cached: true })}\n\n`);
          return res.end();
        }
      } catch (e) {
        logError({ err: e, req, extra: { source: "paparazzi_cached_read" } });
        // Fall through k fresh generování
      }
    }

    // Fresh generation
    try {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      let summary, system;
      try {
        ({ summary, system } = await gatherAllData());
      } catch (e) {
        logError({ err: e, req, extra: { source: "paparazzi_gather" } });
        sendError(502, "Data collection failed", e.message);
        return;
      }
      res.write(`data: ${JSON.stringify({ type: "metadata", summary, system })}\n\n`);

      const prompt = buildPaparazziPrompt(system, summary);
      let fullReport;
      try {
        fullReport = await callOllama(prompt, (token) => {
          try {
            res.write(`data: ${JSON.stringify({ type: "token", content: token })}\n\n`);
          } catch {
            // Klient odpojen — abort
            throw new HttpError(499, "Client disconnected");
          }
        });
      } catch (e) {
        logError({ err: e, req, extra: { source: "paparazzi_ollama" } });
        sendError(502, "Ollama API error", e.message);
        return;
      }

      // Uložení na disk (best-effort)
      try {
        const reportPayload = { report: fullReport, system, summary, generatedAt: new Date().toISOString() };
        fs.mkdirSync(config.PAPARAZZI_REPORT_DIR, { recursive: true });
        fs.writeFileSync(config.PAPARAZZI_REPORT_FILE, JSON.stringify(reportPayload, null, 2));
      } catch (e) {
        logError({ err: e, req, extra: { source: "paparazzi_save" } });
        // Pokračuj — i bez uložení pošleme výstup klientovi
      }

      try {
        res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
        res.end();
      } catch {
        // Klient odpojen, nic s tím
      }
    } catch (e) {
      logError({ err: e, req, extra: { source: "paparazzi_streaming" } });
      try { sendError(500, "Streaming failed", e.message); } catch {}
    }
  }));
};
