// ===== Sovereign API — bootstrap =====
// Konfigurace → server/config.js
// Datové moduly → server/lib/*.js
// Routes → zde (refaktor: vyčlenit do server/routes/*.js v další fázi)

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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = val;
  }
})();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const config = require("./config.cjs");
const {
  isSafeName,
  listProjectDirs,
  getProjectInfo,
  collectProjectData,
  summarizeProjects,
  SKIP_DIRS,
} = require("./lib/projects.cjs");
const { collectSystemData } = require("./lib/system.cjs");
const { buildPaparazziPrompt, callOllama, PAPARAZZI_REPORT_DIR, PAPARAZZI_REPORT_FILE, PAPARAZZI_HISTORY_FILE } = require("./lib/paparazzi.cjs");
const { AGENT_TASKS, runAgentExe } = require("./lib/agents.cjs");

const app = express();

// ===== CORS (allowlist, ne wildcard) =====
app.use(cors({
  origin(origin, cb) {
    if (!origin || config.ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
}));
app.use(express.json());

// ===== Auth token pro mutační endpointy =====
const AUTH_TOKEN = process.env.SOVEREIGN_AUTH_TOKEN || null;
function requireAuth(req, res, next) {
  if (!AUTH_TOKEN) return res.status(503).json({ error: "Auth token not configured (SOVEREIGN_AUTH_TOKEN)" });
  const provided = req.headers["x-auth-token"] || req.query.token;
  if (provided !== AUTH_TOKEN) return res.status(401).json({ error: "Unauthorized" });
  next();
}

// ===== Sdílený sběr dat (projekty + systém) pro report =====
async function gatherAllData() {
  const dirs = fs.readdirSync(config.PROJECTS_DIR).filter((d) => {
    if (SKIP_DIRS.test(d)) return false;
    try { return fs.statSync(path.join(config.PROJECTS_DIR, d)).isDirectory() && fs.existsSync(path.join(config.PROJECTS_DIR, d, ".git")); }
    catch { return false; }
  });
  const results = await Promise.allSettled(dirs.map((d) => collectProjectData(d)));
  const projects = results.filter((r) => r.status === "fulfilled" && r.value).map((r) => r.value);
  const summary = summarizeProjects(projects);
  const system = await collectSystemData();
  return { projects, summary, system };
}

// ========== ROUTES ==========

// --- Projekty ---
app.get("/api/projects", async (req, res) => {
  const dirs = listProjectDirs();
  const results = await Promise.allSettled(dirs.map((name) => getProjectInfo(name)));
  res.json(results.filter((r) => r.status === "fulfilled" && r.value).map((r) => r.value));
});

app.get("/api/projects/:name", async (req, res) => {
  const { name } = req.params;
  if (!isSafeName(name)) return res.status(400).json({ error: "Invalid project name" });
  const p = path.join(config.PROJECTS_DIR, name);
  if (!fs.existsSync(p) || !fs.existsSync(path.join(p, ".git"))) {
    return res.status(404).json({ error: "Project not found" });
  }
  try {
    const info = await getProjectInfo(name, { withLog: true });
    const bugsDir = path.join(p, "bugs");
    let bugs = [];
    if (fs.existsSync(bugsDir)) {
      bugs = fs.readdirSync(bugsDir).filter((f) => f.endsWith(".json")).map((f) => {
        const content = JSON.parse(fs.readFileSync(path.join(bugsDir, f), "utf8"));
        return { id: f.replace(".json", ""), ...content };
      });
    }
    res.json({ ...info, bugs });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Agenti (logy) ---
app.get("/api/agents", (req, res) => {
  const agentsDir = path.join(config.SOVEREIGN_DIR, "workspaces");
  const agents = [];
  if (fs.existsSync(agentsDir)) {
    fs.readdirSync(agentsDir).forEach((name) => {
      const ws = path.join(agentsDir, name);
      if (!fs.statSync(ws).isDirectory()) return;
      const manifestPath = path.join(ws, "manifest.json");
      const logPath = path.join(ws, "agent.log");
      let manifest = null;
      let log = [];
      if (fs.existsSync(manifestPath)) {
        try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); } catch {}
      }
      if (fs.existsSync(logPath)) {
        log = fs.readFileSync(logPath, "utf8").trim().split("\n").filter(Boolean).slice(-20);
      }
      agents.push({ name, manifest, log, workspacePath: ws });
    });
  }
  res.json(agents);
});

// --- Paparazzi capture (trigger) ---
app.post("/api/paparazzi/capture", requireAuth, (req, res) => {
  const { project, url, tag = "AUTO", title = "snapshot" } = req.body;
  if (!url) return res.status(400).json({ error: "URL is required for capture" });
  console.log(`[Paparazzi] Capture request: Project=${project}, URL=${url}, Tag=${tag}, Title=${title}`);
  res.json({ success: true, message: "Capture request received", instruction: "Trigger the OpenClaw browser tool to save the screenshot to the Paparazzi iCloud directory." });
});

// --- Paparazzi captures ---
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

// --- Files (workspace + captures; dir listing supported) ---
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

// --- Paparazzi data (cached) ---
let paparazziCache = null;
let paparazziCacheAt = 0;
app.get("/api/paparazzi/data", async (req, res) => {
  const force = req.query.refresh === "1";
  const now = Date.now();
  if (!force && paparazziCache && now - paparazziCacheAt < config.PAPARAZZI_DATA_TTL_MS) {
    return res.json({ ...paparazziCache, cached: true, cachedAt: paparazziCacheAt });
  }
  const { projects, summary, system } = await gatherAllData();
  const payload = { projects, summary, system, cached: false };
  paparazziCache = payload;
  paparazziCacheAt = now;
  res.json(payload);
});

// --- Bug tickets ---
app.post("/api/bugs", requireAuth, (req, res) => {
  const { project, title, description, severity } = req.body;
  if (!project || !title) return res.status(400).json({ error: "project and title required" });
  const bugsDir = path.join(config.PROJECTS_DIR, project, "bugs");
  if (!fs.existsSync(bugsDir)) fs.mkdirSync(bugsDir, { recursive: true });
  const id = `bug-${Date.now()}`;
  const bug = { id, title, description: description || "", severity: severity || "medium", status: "open", created: new Date().toISOString(), resolved: null };
  fs.writeFileSync(path.join(bugsDir, `${id}.json`), JSON.stringify(bug, null, 2));
  res.json(bug);
});

app.patch("/api/bugs/:project/:id", requireAuth, (req, res) => {
  const { project, id } = req.params;
  const bugPath = path.join(config.PROJECTS_DIR, project, "bugs", `${id}.json`);
  if (!fs.existsSync(bugPath)) return res.status(404).json({ error: "Bug not found" });
  const bug = JSON.parse(fs.readFileSync(bugPath, "utf8"));
  const { status, resolved } = req.body;
  if (status) bug.status = status;
  if (resolved) bug.resolved = resolved;
  if (status === "resolved" && !bug.resolved) bug.resolved = new Date().toISOString();
  fs.writeFileSync(bugPath, JSON.stringify(bug, null, 2));
  res.json(bug);
});

// --- Leads ---
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

// --- Agent exekuce (rate limited) ---
const runningJobs = new Set();
const MAX_PARALLEL_JOBS = 2;
app.post("/api/agents/:name/run", requireAuth, (req, res) => {
  const { name } = req.params;
  if (!AGENT_TASKS[name]) return res.status(404).json({ error: `Neznámý agent: ${name}` });
  if (runningJobs.size >= MAX_PARALLEL_JOBS) return res.status(429).json({ error: `Max ${MAX_PARALLEL_JOBS} paralelní joby. Zkuste to později.` });
  runningJobs.add(name);
  runAgentExe(name, (err, result) => {
    runningJobs.delete(name);
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, ...result });
  });
});

// --- Health ---
app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// --- Paparazzi report (cached 60s) ---
let paparazziReportCache = null;
let paparazziReportCacheAt = 0;
app.get("/api/paparazzi/report", async (req, res) => {
  const force = req.query.refresh === "1";
  const now = Date.now();
  if (!force && paparazziReportCache && now - paparazziReportCacheAt < config.PAPARAZZI_CACHE_TTL_MS) {
    return res.json({ ...paparazziReportCache, cached: true, cachedAt: paparazziReportCacheAt });
  }
  try {
    const { summary, system } = await gatherAllData();
    const prompt = buildPaparazziPrompt(system, summary);
    const report = await callOllama(prompt);
    const payload = { report: typeof report === "string" ? report : JSON.stringify(report), system, summary, generatedAt: new Date().toISOString(), cached: false };
    paparazziReportCache = payload;
    paparazziReportCacheAt = now;
    res.json(payload);
  } catch (err) {
    console.error("[Paparazzi] Report selhal:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ========== PAPARAZZI — AUTOMATICKÝ BĚH V POZADÍ ==========
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

// ========== SERVER START + SHUTDOWN ==========
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
