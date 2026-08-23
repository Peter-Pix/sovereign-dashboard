// ===== Sovereign API — bootstrap =====
// Konfigurace → config.cjs
// Datové moduly → lib/*.cjs
// Routes → routes/*.cjs
// Tento soubor je jen "lepidlo" — žádná business logika.

// ===== Načtení .env (bez dotenv dependency) =====
(function loadEnv() {
  const fs = require("fs");
  const path = require("path");
  const candidates = [path.join(__dirname, "..", ".env"), path.join(__dirname, ".env")];
  const envPath = candidates.find((p) => fs.existsSync(p));
  if (!envPath) return;
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
})();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const config = require("./config.cjs");
const { isSafeName, listProjectDirs, getProjectInfo, getProjectsCached } = require("./lib/projects.cjs");
const { collectSystemData } = require("./lib/system.cjs");
const { buildPaparazziPrompt, callOllama, gatherAllData, PAPARAZZI_REPORT_DIR, PAPARAZZI_REPORT_FILE, PAPARAZZI_HISTORY_FILE } = require("./lib/paparazzi.cjs");
const { AGENT_TASKS, runAgentExe } = require("./lib/agents.cjs");
const { SKIP_DIRS, collectProjectData, summarizeProjects } = require("./lib/projects.cjs");

const app = express();

// ===== Middleware: CORS (allowlist) + JSON =====
app.use(cors({
  origin(origin, cb) {
    if (!origin || config.ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
}));
app.use(express.json());

// ===== Auth =====
const AUTH_TOKEN = process.env.SOVEREIGN_AUTH_TOKEN || null;
function requireAuth(req, res, next) {
  if (!AUTH_TOKEN) return res.status(503).json({ error: "Auth token not configured (SOVEREIGN_AUTH_TOKEN)" });
  const provided = req.headers["x-auth-token"] || req.query.token;
  if (provided !== AUTH_TOKEN) return res.status(401).json({ error: "Unauthorized" });
  next();
}

// ===== Sdílené dependency pro routes =====
const deps = { config, requireAuth, isSafeName, listProjectDirs, getProjectInfo, SKIP_DIRS, collectProjectData, summarizeProjects, getProjectsCached, collectSystemData, gatherAllData, buildPaparazziPrompt, callOllama, AGENT_TASKS, runAgentExe };

// ===== Registrace routes =====
require("./routes/projects.cjs")(app, deps);
require("./routes/agents.cjs")(app, deps);
require("./routes/bugs.cjs")(app, deps);
require("./routes/files.cjs")(app, deps);
require("./routes/leads.cjs")(app, deps);
require("./routes/health.cjs")(app, deps);
require("./routes/paparazzi.cjs")(app, deps);

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
    console.error("[Paparazzi] Auto-report selhal:", err.message);
    return null;
  }
}

setInterval(() => { generatePaparazziReport(); }, config.PAPARAZZI_INTERVAL_MS);
setTimeout(() => { generatePaparazziReport(); }, 30000);

// ===== Server start + shutdown =====
const server = app.listen(config.PORT, () => {
  console.log(`[Sovereign API] Běží na http://localhost:${config.PORT}`);
  try { fs.writeFileSync(path.join(__dirname, "../server.pid"), String(process.pid)); } catch {}
});

function shutdown(signal) {
  console.log(`[Sovereign API] Přijat ${signal}, ukončuji...`);
  server.close(() => {
    try { fs.unlinkSync(path.join(__dirname, "../server.pid")); } catch {}
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("uncaughtException", (err) => {
  console.error("[Sovereign API] Uncaught exception:", err);
  shutdown("uncaughtException");
});
process.on("unhandledRejection", (reason) => {
  console.error("[Sovereign API] Unhandled rejection:", reason);
});
