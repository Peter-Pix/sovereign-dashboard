// ===== Sovereign API — bootstrap =====
// Konfigurace → config.cjs
// Datové moduly → lib/*.cjs
// Routes → routes/*.cjs
// Tento soubor je jen "lepidlo" — žádná business logika.

const fs = require("fs");
const path = require("path");

// ===== Načtení .env (bez dotenv dependency) =====
(function loadEnv() {
  const candidates = [path.join(__dirname, "..", ".env"), path.join(__dirname, ".env")];
  const envPath = candidates.find((p) => p.existsSync?.(p) || (() => { try { fs.accessSync(p); return true; } catch { return false; } })());
  if (!envPath) return;
  try {
    const lines = fs.readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      if (key && process.env[key] === undefined) process.env[key] = val;
    }
  } catch (e) {
    console.error("[loadEnv] Failed to read .env:", e.message);
  }
})();

const express = require("express");
const cors = require("cors");

const config = require("./config.cjs");
const logger = require("./lib/logger.cjs");
const { isSafeName, listProjectDirs, getProjectInfo, getProjectsCached, SKIP_DIRS, collectProjectData, summarizeProjects } = require("./lib/projects.cjs");
const { collectSystemData } = require("./lib/system.cjs");
const { buildPaparazziPrompt, callOllama, gatherAllData, PAPARAZZI_REPORT_DIR, PAPARAZZI_REPORT_FILE, PAPARAZZI_HISTORY_FILE } = require("./lib/paparazzi.cjs");
const { AGENT_TASKS, runAgentExe } = require("./lib/agents.cjs");
const { collectRoadmaps } = require("./lib/roadmaps.cjs");
const { findNextTask, markTaskDone, runTaskAgent, routeTaskToAgent, executeOneTask, executeAllTasks, enqueueProjectTasks, startQueueWorker, getQueueState, pauseQueue, resumeQueue, getExecutionState, resetExecutionState } = require("./lib/executor.cjs");

const app = express();

// ===== Middleware: CORS (allowlist) + JSON =====
app.use(cors({
  origin(origin, cb) {
    if (!origin || config.ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
}));
app.use(express.json({ limit: "1mb" })); // Omezení velikosti requestu

// ===== Correlation ID middleware (Bug 11) =====
app.use((req, res, next) => {
  req.correlationId = req.headers["x-correlation-id"] || logger.newCorrelationId();
  res.setHeader("x-correlation-id", req.correlationId);
  next();
});

// ===== Request log middleware =====
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const elapsed = Date.now() - start;
    const status = res.statusCode;
    // Log pouze errorů a pomalých requestů (jinak je to spam)
    if (status >= 400 || elapsed > 2000) {
      console.log(`[${req.correlationId}] ${req.method} ${req.url} → ${status} (${elapsed}ms)`);
    }
  });
  next();
});

// ===== Auth =====
const AUTH_TOKEN = process.env.SOVEREIGN_AUTH_TOKEN || null;
function requireAuth(req, res, next) {
  if (!AUTH_TOKEN) {
    logger.logError({ err: new Error("Auth token not configured"), req, status: 503 });
    return res.status(503).json({ error: "Auth token not configured (SOVEREIGN_AUTH_TOKEN)", correlationId: req.correlationId });
  }
  const provided = req.headers["x-auth-token"] || req.query.token;
  if (provided !== AUTH_TOKEN) {
    logger.logError({ err: new Error("Unauthorized"), req, status: 401 });
    return res.status(401).json({ error: "Unauthorized", correlationId: req.correlationId });
  }
  next();
}

// ===== Sdílené dependency pro routes =====
const deps = { config, requireAuth, logger, isSafeName, listProjectDirs, getProjectInfo, SKIP_DIRS, collectProjectData, summarizeProjects, getProjectsCached, collectSystemData, gatherAllData, buildPaparazziPrompt, callOllama, AGENT_TASKS, runAgentExe, collectRoadmaps, findNextTask, markTaskDone, runTaskAgent, routeTaskToAgent, executeOneTask, executeAllTasks, enqueueProjectTasks, startQueueWorker, getQueueState, pauseQueue, resumeQueue, getExecutionState, resetExecutionState };

// ===== Registrace routes =====
require("./routes/projects.cjs")(app, deps);
require("./routes/agents.cjs")(app, deps);
require("./routes/bugs.cjs")(app, deps);
require("./routes/files.cjs")(app, deps);
require("./routes/leads.cjs")(app, deps);
require("./routes/health.cjs")(app, deps);
require("./routes/paparazzi.cjs")(app, deps);
require("./routes/roadmaps.cjs")(app, deps);
require("./routes/executor.cjs")(app, deps);

// ===== 404 handler =====
app.use((req, res) => {
  res.status(404).json({
    error: "Not Found",
    path: req.url,
    correlationId: req.correlationId,
  });
});

// ===== Error middleware (musí být POSLEDNÍ!) =====
app.use(logger.errorMiddleware);

// ===== Paparazzi — automatický běh v pozadí =====
async function generatePaparazziReport() {
  try {
    const { summary, system } = await gatherAllData();
    const prompt = buildPaparazziPrompt(system, summary);
    const report = await callOllama(prompt);
    const payload = { report: typeof report === "string" ? report : JSON.stringify(report), system, summary, generatedAt: new Date().toISOString() };

    fs.mkdirSync(PAPARAZZI_REPORT_DIR, { recursive: true });
    fs.writeFileSync(PAPARAZZI_REPORT_FILE, JSON.stringify(payload, null, 2));

    let history = [];
    try { history = JSON.parse(fs.readFileSync(PAPARAZZI_HISTORY_FILE, "utf8")); } catch {}
    history.push({ generatedAt: payload.generatedAt, report: payload.report, summary: payload.summary?.counts });
    if (history.length > 50) history = history.slice(-50);
    fs.writeFileSync(PAPARAZZI_HISTORY_FILE, JSON.stringify(history, null, 2));

    console.log(`[Paparazzi] Auto-report uložen (${new Date().toISOString()})`);
    return payload;
  } catch (err) {
    // Bug 12: graceful degradation — pokud se Ollama nepodařila, ulož alespoň data
    if (err.message?.includes("Ollama") || err.message?.includes("fetch")) {
      try {
        const { summary, system } = await gatherAllData();
        const partial = { report: "(Ollama nedostupná — uloženy pouze data)", summary, system, generatedAt: new Date().toISOString(), partial: true };
        fs.mkdirSync(PAPARAZZI_REPORT_DIR, { recursive: true });
        fs.writeFileSync(PAPARAZZI_REPORT_FILE, JSON.stringify(partial, null, 2));
        console.warn("[Paparazzi] Ollama nedostupná, uložen partial report");
      } catch (fallbackErr) {
        logger.logError({ err, extra: { fallbackErr: fallbackErr.message } });
      }
    } else {
      logger.logError({ err, extra: { source: "paparazzi_auto" } });
    }
    return null;
  }
}

setInterval(() => { generatePaparazziReport(); }, config.PAPARAZZI_INTERVAL_MS);
setTimeout(() => { generatePaparazziReport(); }, 30000);

// ===== Server start + shutdown =====
const server = app.listen(config.PORT, () => {
  console.log(`[Sovereign API] Běží na http://localhost:${config.PORT}`);
  try { fs.writeFileSync(path.join(__dirname, "../server.pid"), String(process.pid)); } catch (e) {
    console.warn("[Server] Nelze zapsat PID:", e.message);
  }
});

// Tracking in-flight requests (pro graceful shutdown)
const inflightRequests = new Set();
server.on("connection", (socket) => {
  inflightRequests.add(socket);
  socket.on("close", () => inflightRequests.delete(socket));
});

// Bug 2: Graceful shutdown s grace period
let shuttingDown = false;
function shutdown(signal, reason = "normal") {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[Sovereign API] Přijat ${signal}, ukončuji (reason=${reason})…`);

  // Přestaň přijímat nová spojení
  server.close((err) => {
    try { fs.unlinkSync(path.join(__dirname, "../server.pid")); } catch {}

    if (err) {
      console.error("[Server] Close error:", err);
      process.exit(1);
    }
    console.log("[Server] Clean shutdown");
    process.exit(0);
  });

  // Zapiš crash reason (pro debugging)
  try {
    const crashLog = path.join(config.SOVEREIGN_DIR, "logs", `crash-${Date.now()}.log`);
    fs.mkdirSync(path.dirname(crashLog), { recursive: true });
    fs.writeFileSync(crashLog, JSON.stringify({ signal, reason, timestamp: new Date().toISOString(), pid: process.pid }, null, 2));
  } catch {}

  // Hard exit po 10s
  const hardExitTimer = setTimeout(() => {
    console.error("[Server] Grace period expired, forcing exit");
    process.exit(1);
  }, 10000);
  hardExitTimer.unref();
}

// Bug 8: uncaughtException — graceful shutdown + log
process.on("uncaughtException", (err) => {
  console.error("[Server] Uncaught exception:", err);
  logger.logError({ err, extra: { fatal: true } });
  shutdown("uncaughtException", err.message);
});

// Bug 8: unhandledRejection — v produkci exit, v dev warn
process.on("unhandledRejection", (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  console.error("[Server] Unhandled rejection:", err);
  logger.logError({ err, extra: { unhandled: true } });
  if (process.env.NODE_ENV === "production") {
    shutdown("unhandledRejection", err.message);
  }
});

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
