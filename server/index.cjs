// ===== Načtení .env (bez dotenv dependency) =====
// Node 26 má --env-file, ale pro robustnost (ať už se spouští jakkoliv) načteme .env ručně.
// .env je gitignored — obsahuje tajemství (API klíče, auth token).
(function loadEnv() {
  const fs = require("fs");
  const path = require("path");
  // .env je v kořeni projektu (server/ je o úroveň níž), fallback na server/.env
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
    if (key && process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
})();

const express = require("express");
const cors = require("cors");
const { execFile } = require("child_process");
const { promisify } = require("util");
const execFileP = promisify(execFile);
const fs = require("fs");
const path = require("path");

const app = express();

// CORS: povolit jen lokální dev origin (ne otevřený wildcard)
const ALLOWED_ORIGINS = [
  "http://localhost:3205",
  "http://127.0.0.1:3205",
  "http://localhost:8891",
  "http://127.0.0.1:8891",
];
app.use(cors({
  origin(origin, cb) {
    // non-browser requests (curl, server-to-server) nemají Origin → povolit
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    // Nevyhazovat chybu (ta by spadla jako uncaughtException) — jen nepovolit CORS.
    return cb(null, false);
  },
}));
app.use(express.json());

const PORT = 8891;

// Auth token pro mutační endpointy (spouštění agentů, bug tickety).
// Nastav SOVEREIGN_AUTH_TOKEN v .env; bez něj se použije náhodný (mutace nepůjdou).
const AUTH_TOKEN = process.env.SOVEREIGN_AUTH_TOKEN || null;

function requireAuth(req, res, next) {
  if (!AUTH_TOKEN) {
    return res.status(503).json({ error: "Auth token not configured (SOVEREIGN_AUTH_TOKEN)" });
  }
  const provided = req.headers["x-auth-token"] || req.query.token;
  if (provided !== AUTH_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}
const PROJECTS_DIR = path.resolve(__dirname, "../../");
const SOVEREIGN_DIR = path.resolve(__dirname, "../../../.openclaw/workspace/sovereign-os");
const PAPARAZZI_DIR = path.join(process.env.HOME, "Library/Mobile Documents/com~apple~CloudDocs/Paparazzi");

// Async bounded shell — spustí příkaz v shellu, hard timeout, nikdy nevyhodí (neblokuje event loop)
async function run(cmd, timeoutMs = 4000) {
  try {
    const { stdout } = await execFileP("/bin/zsh", ["-c", cmd], { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 });
    return String(stdout).trim();
  } catch {
    return "";
  }
}

// Seznam git projektů pod PROJECTS_DIR
// Validace názvu projektu — brání command injection přes shell (cd "${p}" && ...)
const SAFE_NAME_RE = /^[A-Za-z0-9._-]+$/;
function isSafeName(name) {
  return typeof name === "string" && name.length > 0 && name.length <= 128 && SAFE_NAME_RE.test(name);
}

function listProjectDirs() {
  return fs.readdirSync(PROJECTS_DIR).filter(d => {
    if (!isSafeName(d)) return false;
    try { return fs.statSync(path.join(PROJECTS_DIR, d)).isDirectory() && fs.existsSync(path.join(PROJECTS_DIR, d, ".git")); }
    catch { return false; }
  });
}

// Sjednocený sběr git dat o jednom projektu (async, paralelní) — používá list i detail
async function getProjectInfo(name, { withLog = false } = {}) {
  const p = path.join(PROJECTS_DIR, name);
  const git = (cmd) => run(`cd "${p}" && ${cmd} 2>/dev/null`, 4000);

  const [lastCommit, branch, status, lastHash, lastMsg, log] = await Promise.allSettled([
    git("git log -1 --format=%cd --date=relative"),
    git("git branch --show-current"),
    git("git status --short"),
    git("git log -1 --format=%h"),
    git("git log -1 --format=%s"),
    withLog ? git("git log --oneline -10") : Promise.resolve(""),
  ]);
  const val = (r) => (r.status === "fulfilled" ? r.value : "");

  const dirty = val(status).length > 0;

  const info = {
    name,
    lastCommit: val(lastCommit) || "unknown",
    branch: val(branch) || "unknown",
    dirty,
    lastHash: val(lastHash) || "unknown",
    lastMsg: val(lastMsg) || "unknown",
    status: dirty ? "warn" : "ok",
  };
  if (withLog) info.log = val(log).split("\n").filter(Boolean);
  return info;
}

// ========== API ==========

// Seznam projektů s reálnýma datama
app.get("/api/projects", async (req, res) => {
  const dirs = listProjectDirs();
  const results = await Promise.allSettled(dirs.map((name) => getProjectInfo(name)));
  const projects = results.filter(r => r.status === "fulfilled" && r.value).map(r => r.value);
  res.json(projects);
});

// Detail projektu
app.get("/api/projects/:name", async (req, res) => {
  const { name } = req.params;
  if (!isSafeName(name)) {
    return res.status(400).json({ error: "Invalid project name" });
  }
  const p = path.join(PROJECTS_DIR, name);
  if (!fs.existsSync(p) || !fs.existsSync(path.join(p, ".git"))) {
    return res.status(404).json({ error: "Project not found" });
  }

  try {
    const info = await getProjectInfo(name, { withLog: true });

    // Zkusíme najít bug tickets v projektu
    const bugsDir = path.join(p, "bugs");
    let bugs = [];
    if (fs.existsSync(bugsDir)) {
      bugs = fs.readdirSync(bugsDir).filter(f => f.endsWith(".json")).map(f => {
        const content = JSON.parse(fs.readFileSync(path.join(bugsDir, f), "utf8"));
        return { id: f.replace(".json", ""), ...content };
      });
    }

    res.json({ ...info, bugs });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
// Agent logy
app.get("/api/agents", (req, res) => {
  const agentsDir = path.join(SOVEREIGN_DIR, "workspaces");
  const agents = [];

  if (fs.existsSync(agentsDir)) {
    fs.readdirSync(agentsDir).forEach((name) => {
      const ws = path.join(agentsDir, name);
      if (!fs.statSync(ws).isDirectory()) return;

      // Hledáme manifest.json a logy
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

      agents.push({
        name,
        manifest,
        log,
        workspacePath: ws,
      });
    });
  }

  res.json(agents);
});

// ========== PAPARAZZI — DATA COLLECTOR & DOCUMENTATION ==========
// Paparazzi není jen foťák. Sběrá data o projektech, automaticky dokumentuje UI a sumarizuje je.
// Data collection je ASYNC + PARALELNÍ + CACHOVANÝ — nikdy neblokuje event loop.


// Složky, které nejsou „živé" projekty (backupy, staré verze, tooling)
const SKIP_DIRS = /^(old_|openclaw-backup|.*\.bak|.*backup|node_modules|dist|\.next|\.cache|\.content-cache)/i;
const EXCLUDE_DIRS = "--exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.next --exclude-dir=dist --exclude-dir=.cache --exclude-dir=.content-cache --exclude-dir=build --exclude-dir=.turbo";

// Počet zdrojových souborů (async, bounded)
async function countSourceFiles(p) {
  const out = await run(`find "${p}" -type f \\( -name '*.js' -o -name '*.jsx' -o -name '*.ts' -o -name '*.tsx' -o -name '*.cjs' -o -name '*.md' \\) -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/.next/*' -not -path '*/dist/*' 2>/dev/null | wc -l`, 2500);
  return parseInt(out, 10) || 0;
}

// Sběr reálných dat o jednom projektu — všechny git/grep/find volání PARALELNĚ (async)
async function collectProjectData(name) {
  const p = path.join(PROJECTS_DIR, name);
  const git = (cmd) => run(`cd "${p}" && ${cmd} 2>/dev/null`, 4000);

  // Všechny nezávislé příkazy spustíme najednou (Promise.allSettled) — výrazně rychlejší
  const [status, lastCommitAgo, lastCommitDate, lastHash, lastMsg, branch, commits7d, commits30d, authors, grepOut, srcCount] = await Promise.allSettled([
    git("git status --short"),
    git("git log -1 --format=%cd --date=relative"),
    git("git log -1 --format=%cd --date=iso"),
    git("git log -1 --format=%h"),
    git("git log -1 --format=%s"),
    git("git branch --show-current"),
    git("git log --oneline --since='7 days ago' 2>/dev/null | wc -l | tr -d ' '"),
    git("git log --oneline --since='30 days ago' 2>/dev/null | wc -l | tr -d ' '"),
    git("git log --format='%an' -5 2>/dev/null | sort -u | tr '\n' ', '"),
    run(`grep -rInE "TODO|FIXME|HACK|XXX" "${p}" ${EXCLUDE_DIRS} --include='*.js' --include='*.jsx' --include='*.ts' --include='*.tsx' --include='*.md' --include='*.cjs' 2>/dev/null | head -8`, 2500),
    countSourceFiles(p),
  ]);
  const val = (r) => (r.status === "fulfilled" ? r.value : "");

  const dirty = val(status).length > 0;

  // TODO / FIXME
  let todos = [];
  if (val(grepOut)) {
    todos = val(grepOut).split("\n").filter(Boolean).slice(0, 8).map(l => {
      const m = l.match(/([^:]+):(\d+):(.*)/);
      return m ? { file: m[1].replace(p + "/", ""), line: m[2], text: m[3].trim().slice(0, 80) } : null;
    }).filter(Boolean);
  }

  // README existuje?
  const hasReadme = ["README.md", "readme.md", "README"].some(f => fs.existsSync(path.join(p, f)));
  const readmeLines = hasReadme ? (() => {
    const f = ["README.md", "readme.md", "README"].find(f => fs.existsSync(path.join(p, f)));
    try { return fs.readFileSync(path.join(p, f), "utf8").split("\n").filter(l => l.trim().length > 0).length; } catch { return 0; }
  })() : 0;

  // package.json deps count
  let deps = 0, devDeps = 0, pkgName = "";
  const pkgPath = path.join(p, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      pkgName = pkg.name || "";
      deps = Object.keys(pkg.dependencies || {}).length;
      devDeps = Object.keys(pkg.devDependencies || {}).length;
    } catch {}
  }

  const srcFiles = parseInt(val(srcCount), 10) || 0;

  // Aktivita: kolik commitů za 30 dní
  const activity = parseInt(val(commits30d), 10) || 0;
  const activityLabel = activity >= 10 ? "hot" : activity >= 3 ? "active" : activity >= 1 ? "slow" : "idle";

  // Health skóre 0-100
  const hasRecent = activity >= 1;
  const clean = !dirty;
  const documented = hasReadme && readmeLines >= 5;
  let health = 0;
  health += hasRecent ? 30 : 0;
  health += clean ? 25 : 0;
  health += documented ? 20 : 0;
  health += hasReadme ? 5 : 0;
  health += activity >= 3 ? 10 : activity >= 1 ? 5 : 0;
  health += todos.length === 0 ? 10 : Math.max(0, 10 - todos.length);
  health = Math.min(100, health);

  return {
    name,
    lastCommitAgo: val(lastCommitAgo),
    lastCommitDate: val(lastCommitDate),
    lastHash: val(lastHash),
    lastMsg: val(lastMsg),
    branch: val(branch),
    dirty,
    status: dirty ? "warn" : "ok",
    commits7d: parseInt(val(commits7d), 10) || 0,
    commits30d: activity,
    authors: val(authors).replace(/,\s*$/, ""),
    todos,
    todoCount: todos.length,
    hasReadme,
    readmeLines,
    pkgName,
    deps,
    devDeps,
    srcFiles,
    activity: activityLabel,
    health,
  };
}
// ========== SYSTÉMOVÝ MONITORING — Paparazzi "The Big Eye" ==========
// Sběr reálných systémových dat (CPU, RAM, disky, procesy, služby)
// Všechna volání PARALELNĚ (Promise.allSettled) — neblokuje event loop.

async function collectSystemData() {
  const os = require("os");

  // Všechny nezávislé příkazy spustíme najednou
  const [loadAvg, memStats, diskStats, topProcs, uptime] = await Promise.allSettled([
    run("sysctl -n vm.loadavg 2>/dev/null | awk '{print $1, $2, $3}'"),
    run("vm_stat 2>/dev/null | head -6"),
    run("df -h / 2>/dev/null | tail -1"),
    run("ps aux -r 2>/dev/null | head -6 | tail -5"),
    run("uptime 2>/dev/null"),
  ]);
  const val = (r) => (r.status === "fulfilled" ? r.value : "");

  // CPU — load average (1, 5, 15 min) vs počet jader
  const cores = os.cpus().length;
  const loadParts = val(loadAvg).split(/\s+/).map(Number).filter(n => !isNaN(n));
  const load1 = loadParts[0] || 0;
  const load5 = loadParts[1] || 0;
  const load15 = loadParts[2] || 0;
  const cpuPct = Math.min(100, Math.round((load1 / cores) * 100));

  // RAM — z vm_stat (page size 16384)
  const memLines = val(memStats).split("\n");
  const pageSize = 16384;
  const parseMem = (label) => {
    const line = memLines.find(l => l.includes(label));
    if (!line) return 0;
    const m = line.match(/(\d+)/);
    return m ? parseInt(m[1], 10) * pageSize : 0;
  };
  const freePages = parseMem("Pages free");
  const activePages = parseMem("Pages active");
  const inactivePages = parseMem("Pages inactive");
  const speculativePages = parseMem("Pages speculative");
  const totalMem = os.totalmem();
  const usedMem = totalMem - freePages - inactivePages - speculativePages;
  const memPct = Math.min(100, Math.round((usedMem / totalMem) * 100));

  // Disky — df -h /
  const diskParts = val(diskStats).split(/\s+/);
  const diskTotal = diskParts[1] || "?";
  const diskUsed = diskParts[2] || "?";
  const diskAvail = diskParts[3] || "?";
  const diskPct = parseInt((diskParts[4] || "0").replace("%", ""), 10) || 0;

  // Top procesy (CPU)
  const procs = val(topProcs).split("\n").filter(Boolean).map(line => {
    const parts = line.trim().split(/\s+/);
    return {
      cpu: parseFloat(parts[2]) || 0,
      mem: parseFloat(parts[3]) || 0,
      cmd: parts.slice(10).join(" ").slice(0, 40) || "?",
    };
  }).slice(0, 5);

  // Uptime
  const upParts = val(uptime).match(/up\s+([^,]+)/);
  const uptimeStr = upParts ? upParts[1].trim() : "?";

  return {
    cpu: {
      cores,
      load1: +load1.toFixed(2),
      load5: +load5.toFixed(2),
      load15: +load15.toFixed(2),
      pct: cpuPct,
    },
    memory: {
      total: totalMem,
      used: usedMem,
      free: totalMem - usedMem,
      pct: memPct,
    },
    disk: {
      total: diskTotal,
      used: diskUsed,
      avail: diskAvail,
      pct: diskPct,
    },
    processes: procs,
    uptime: uptimeStr,
    hostname: os.hostname(),
    platform: `${os.platform()} ${os.release()}`,
  };
}

// Sumarizace dat — vyhodí zbytečnosti, dá stručný přehled „co se děje"
function summarizeProjects(projects) {
  const total = projects.length;
  const hot = projects.filter(p => p.activity === "hot");
  const active = projects.filter(p => p.activity === "active");
  const slow = projects.filter(p => p.activity === "slow");
  const idle = projects.filter(p => p.activity === "idle");
  const dirty = projects.filter(p => p.dirty);
  const undocumented = projects.filter(p => !p.hasReadme);
  const highTodo = projects.filter(p => p.todoCount >= 5);

  const lines = [];
  lines.push(`Sleduji ${total} projektů. ${hot.length} žhavých, ${active.length} aktivních, ${slow.length} pomalejších, ${idle.length} idle.`);
  if (hot.length) lines.push(`🔥 Žhavé: ${hot.map(p => p.name).join(", ")}.`);
  if (dirty.length) lines.push(`⚠️ Dirty working tree: ${dirty.map(p => p.name).join(", ")}.`);
  if (undocumented.length) lines.push(`📄 Bez README: ${undocumented.map(p => p.name).join(", ")}.`);
  if (highTodo.length) lines.push(`🧹 Naskládáno TODO: ${highTodo.map(p => `${p.name} (${p.todoCount})`).join(", ")}.`);
  if (slow.length) lines.push(`🕸️ Pomalu aktivní: ${slow.map(p => p.name).join(", ")}.`);

  if (lines.length === 0) lines.push("Všechny projekty jsou čisté a aktivní. Nic urgentního.");

  return {
    generatedAt: new Date().toISOString(),
    counts: { total, hot: hot.length, active: active.length, slow: slow.length, idle: idle.length, dirty: dirty.length, undocumented: undocumented.length },
    summary: lines,
  };
}

// Endpoint pro vyvolání snapshotu (vyvolává OpenClaw agenta přes externí volání nebo API)
app.post("/api/paparazzi/capture", requireAuth, (req, res) => {
  const { project, url, tag = "AUTO", title = "snapshot" } = req.body;
  if (!url) return res.status(400).json({ error: "URL is required for capture" });

  // V současné implementaci tento endpoint slouží jako trigger pro OpenClaw agenta.
  // Agent, který tento endpoint zavolá, očekává, že systém zajistí snapshot.
  // Pro plnou automatizaci v rámci OpenClaw runtime se doporučuje volat browser tool přímo z agenta.
  
  console.log(`[Paparazzi] Capture request: Project=${project}, URL=${url}, Tag=${tag}, Title=${title}`);
  
  res.json({ 
    success: true, 
    message: "Capture request received", 
    instruction: "Trigger the OpenClaw browser tool to save the screenshot to the Paparazzi iCloud directory." 
  });
});

// Hlavní Paparazzi endpoint — captures + data collection + summary
app.get("/api/paparazzi", (req, res) => {
  const captures = [];
  if (fs.existsSync(PAPARAZZI_DIR)) {
    fs.readdirSync(PAPARAZZI_DIR).filter(f => f.endsWith(".jpg")).forEach((f) => {
      const parts = f.replace(".jpg", "").split("_");
      captures.push({
        filename: f,
        timestamp: parts[0] + "_" + parts[1],
        tag: parts[2] || "IDLE",
        title: parts.slice(3).join(" ") || "unknown",
      });
    });
  }
  res.json(captures);
});

// Servírování lokálních souborů (workspace + Paparazzi captures) — file:// linky v prohlížeči nefungují
app.get("/api/files", (req, res) => {
  const { p } = req.query;
  if (!p || typeof p !== "string") return res.status(400).json({ error: "p (path) required" });

  // Bezpečnost: povolíme jen soubory uvnitř SOVEREIGN_DIR (workspaces) a PAPARAZZI_DIR.
  // path.relative() je bezpečnější než startsWith() — nemá prefix bug (sovereign-os vs sovereign-os-evil).
  const abs = path.resolve(p);
  const allowed = [SOVEREIGN_DIR, PAPARAZZI_DIR];
  const inside = allowed.some((root) => {
    const rel = path.relative(root, abs);
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
  });
  if (!inside) {
    return res.status(403).json({ error: "Path outside allowed roots" });
  }
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    return res.status(404).json({ error: "File not found" });
  }
  // dotfiles: "allow" — jinak send modul 404 na skryté adresáře (.openclaw)
  res.sendFile(abs, { dotfiles: "allow" });
});

// Server-side cache — data collection je drahý, tak ho cachujeme (60s) a obnovujeme na vyžádání
let paparazziCache = null;
let paparazziCacheAt = 0;
const CACHE_TTL = 300000; // 5 min — data o projektech se nemění tak často

// Data collection endpoint — všechna data o projektech (async, paralelní, cachovaný)
app.get("/api/paparazzi/data", async (req, res) => {
  // Refresh parametr: ?refresh=1 vynutí nový sběr
  const force = req.query.refresh === "1";
  const now = Date.now();

  if (!force && paparazziCache && now - paparazziCacheAt < CACHE_TTL) {
    return res.json({ ...paparazziCache, cached: true, cachedAt: paparazziCacheAt });
  }

  const dirs = fs.readdirSync(PROJECTS_DIR).filter(d => {
    if (SKIP_DIRS.test(d)) return false; // vyhodit backupy / old / node_modules
    try { return fs.statSync(path.join(PROJECTS_DIR, d)).isDirectory() && fs.existsSync(path.join(PROJECTS_DIR, d, ".git")); }
    catch { return false; }
  });

  // Paralelní sběr — Promise.allSettled, neblokuje, výrazně rychlejší než sekvenční
  const results = await Promise.allSettled(dirs.map((d) => collectProjectData(d)));
  const projects = results.filter(r => r.status === "fulfilled" && r.value).map(r => r.value);

  const summary = summarizeProjects(projects);
  const system = await collectSystemData();
  const payload = { projects, summary, system, cached: false };
  paparazziCache = payload;
  paparazziCacheAt = now;
  res.json(payload);
});

// Bug tickets — vytvoření
app.post("/api/bugs", requireAuth, (req, res) => {
  const { project, title, description, severity } = req.body;
  if (!project || !title) return res.status(400).json({ error: "project and title required" });

  const bugsDir = path.join(PROJECTS_DIR, project, "bugs");
  if (!fs.existsSync(bugsDir)) fs.mkdirSync(bugsDir, { recursive: true });

  const id = `bug-${Date.now()}`;
  const bug = {
    id,
    title,
    description: description || "",
    severity: severity || "medium",
    status: "open",
    created: new Date().toISOString(),
    resolved: null,
  };

  fs.writeFileSync(path.join(bugsDir, `${id}.json`), JSON.stringify(bug, null, 2));
  res.json(bug);
});

// Bug tickets — update (resolve, close)
app.patch("/api/bugs/:project/:id", requireAuth, (req, res) => {
  const { project, id } = req.params;
  const bugPath = path.join(PROJECTS_DIR, project, "bugs", `${id}.json`);
  if (!fs.existsSync(bugPath)) return res.status(404).json({ error: "Bug not found" });

  const bug = JSON.parse(fs.readFileSync(bugPath, "utf8"));
  const { status, resolved } = req.body;
  if (status) bug.status = status;
  if (resolved) bug.resolved = resolved;
  if (status === "resolved" && !bug.resolved) bug.resolved = new Date().toISOString();

  fs.writeFileSync(bugPath, JSON.stringify(bug, null, 2));
  res.json(bug);
});

// ========== LEADS ==========
// Načte všechny leady ze Scout workspace (leads.json, leads-new.json, leads-round2.json...)
app.get('/api/leads', (req, res) => {
  const scoutDir = path.join(SOVEREIGN_DIR, 'workspaces/scout');
  const all = [];
  if (fs.existsSync(scoutDir)) {
    fs.readdirSync(scoutDir).filter(f => f.startsWith('leads') && f.endsWith('.json')).forEach((f) => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(scoutDir, f), 'utf8'));
        const leads = Array.isArray(data) ? data : (data.leads || []);
        leads.forEach(l => all.push({ ...l, sourceFile: f }));
      } catch {}
    });
  }
  // deduplikace podle jména
  const seen = new Set();
  const unique = all.filter(l => {
    const k = (l.name || '').toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  res.json(unique);
});

// ========== REÁLNÁ EXEKUCE AGENTŮ ==========
// Mapování Sovereign agenta → exekuční prompt pro OpenClaw agenta (main)
// Agent má přístup k souborům a gitu → reálně vykoná úkol a zapíše manifest.
const EXEC_AGENT = process.env.SOVEREIGN_EXEC_AGENT || 'main';
const SOVEREIGN_EXEC_MODEL = process.env.SOVEREIGN_EXEC_MODEL || 'ollama/kimi-k2.7-code:cloud';

const AGENT_TASKS = {
  scout: {
    name: "The Scout (The Big Eye)",
    workspace: "scout",
    prompt: `Jsi The Scout — The Big Eye Sovereign OS. Tvoje role: vidět peníze a příležitosti tam, kde ostatní vidí jen hromadu dat.

ÚKOL: Najdi 5-7 NOVÝCH českých firem (10-200 zaměstnanců) v sektorech: účetnictví, právo, logistika, e-commerce, výroba, zdravotnictví, realitní kanceláře, pojišťovnictví, marketingové agentury. Firmy, které mají repetitivní úkoly vhodné pro AI automatizaci.

⚠️ NEPOUŽÍVEJ firmy, které už jsou v /Users/petrpiskacek/.openclaw/workspace/sovereign-os/workspaces/scout/leads.json (ADAR, CINK, Pragotour, DárkyHry, Mariveo) ani v leads-new.json (ROWAN, Servant, OnlineShop).

POSTUP:
1. Vyhledej na webu (web_search) kvalifikované leady v různých sektorech — zkoušej různé vyhledávací dotazy ("účetnická firma Praha", "advokátní kancelář Brno", "výrobní firma automatizace", "realitní kancelář AI", atd.).
2. Pro každý lead zapiš: jméno, web, sektor, lokace, odhad velikosti, repetitivní úkol, AI value proposition.
3. Zapiš výsledky do souboru /Users/petrpiskacek/.openclaw/workspace/sovereign-os/workspaces/scout/leads-round2.json (JSON array).
4. Aktualizuj manifest /Users/petrpiskacek/.openclaw/workspace/sovereign-os/workspaces/scout/manifest.json (status, summary, identity).

Pracuj s více sektory, ne jen jedním. Buď faktický a ověřitelný — neplň si to z hlavy. Ověřuj přes web_search.`,
  },
  strategist: {
    name: "The Strategist (The Big Mouth)",
    workspace: "strategist",
    prompt: `Jsi The Strategist — The Big Mouth Sovereign OS. Tvoje role: přeložit komplexitu do statusu a peněz.

ÚKOL: Vytvoř konkrétní pitch pro nejlepšího kandidáta ze všech leadů, které našel Scout (15 celkem). Cíl: realitní/zdravotnictví/marketing/e-commerce firma s jasnou AI příležitostí.

POSTUP:
1. Přečti leady ze souborů: /Users/petrpiskacek/.openclaw/workspace/sovereign-os/workspaces/scout/leads.json, leads-new.json, leads-round2.json.
2. Vyber JEDNOHO leada s nejsilnější AI příležitostí a největší pravděpodobností platby (velikost + jasný repetitivní problém).
3. Napiš pitch v Sovereign voice (zero bullshit, autentický český tón, hodnota místo technických detailů). Pitch musí obsahovat:
   - Hook (konkrétní problém té firmy)
   - Hodnotu (co AI ušetří — čas, peníze, nervy)
   - Konkrétní příklad (co se dá automatizovat)
   - Close (nízkotlaká výzva — 20min call, bez závazku)
4. Zapiš pitch do souboru /Users/petrpiskacek/.openclaw/workspace/sovereign-os/workspaces/strategist/pitch-[leada].md
5. Aktualizuj manifest /Users/petrpiskacek/.openclaw/workspace/sovereign-os/workspaces/strategist/manifest.json (status, summary, targetLead).

Pitch musí být konkrétní pro TU firmu, ne generický. Mluv o jejich skutečném problému. Vyber leada s největším byznys potenciálem.`,
  },
  archivist: {
    name: "The Archivist",
    workspace: "archivist",
    prompt: `Jsi The Archivist — Sovereign OS. Tvoje role: dokumentace a audit.

ÚKOL: Proveď rychlý audit jednoho projektu z /Users/petrpiskacek/projects/ — podívej se na jeho README, strukturu a stav. Vyber projekt, který nemá dobrou dokumentaci, a doplň/opiš ji.

POSTUP:
1. Projdi projekty v /Users/petrpiskacek/projects/ a najdi ten s nejhorší dokumentací.
2. Auditni ho (co to dělá, jak to běží, architektura).
3. Vylepši jeho README.md s konkrétními informacemi (bez fluffu).
4. Aktualizuj manifest /Users/petrpiskacek/.openclaw/workspace/sovereign-os/workspaces/archivist/manifest.json (status, summary, filesChanged).

Nezasahuj do cizích workspace agentů. Pracuj jen v tom projektu co audituješ.`,
  },
  spine: {
    name: "The Spine",
    workspace: "spine",
    prompt: `Jsi The Spine — Big Spine Sovereign OS. Tvoje role: držet strukturu, hlídat focus, být Merge Master.

ÚKOL: Proveď kontrolu stavu Sovereign OS workspace a zaznamenej ji.

POSTUP:
1. Projdi /Users/petrpiskacek/.openclaw/workspace/sovereign-os/workspaces/ — zkontroluj manifesty všech agentů (status, completed).
2. Zjisti, který agent má hotovou práci a která čeká.
3. Zapiš status report do /Users/petrpiskacek/.openclaw/workspace/sovereign-os/workspaces/spine/status-report.json (json s přehledem agentů).
4. Aktualizuj manifest /Users/petrpiskacek/.openclaw/workspace/sovereign-os/workspaces/spine/manifest.json (status, lastCheck).

Buď věcný a stručný. Identifikuj, co je hotové a co je blokované.`,
  },
};

// Spustí exekuci agenta přes OpenClaw agenta (main)
function runAgentExe(agentName, callback) {
  const task = AGENT_TASKS[agentName];
  if (!task) {
    return callback(new Error(`Neznámý agent: ${agentName}`));
  }

  // Timeout — pokud exekuce trvá déle než 5 min, vrátí chybu
  let finished = false;
  const timeout = setTimeout(() => {
    if (!finished) {
      finished = true;
      callback(new Error("Agent exekuce timeout (5 min)"));
    }
  }, 300000); // 5 min

  const args = ['agent', '--agent', EXEC_AGENT, '--json', '--model', SOVEREIGN_EXEC_MODEL, '-m', task.prompt];
  execFile('openclaw', args, {
    timeout: 300000, // 5 min
    maxBuffer: 10 * 1024 * 1024,
    killSignal: 'SIGKILL', // force kill po timeoutu
  }, (err, stdout, stderr) => {
    if (finished) return; // timeout už proběhl
    finished = true;
    clearTimeout(timeout);
    if (err) {
      console.error(`[Agent ${agentName}] Exekuce selhala: ${err.message}`);
      return callback(new Error(`Exekuce selhala: ${err.message} — ${stderr.slice(0, 300)}`));
    }
    try {
      const data = JSON.parse(stdout);
      const payloads = data.result?.payloads || [];
      const text = payloads.map(p => p.text || '').join('\n');
      const usage = data.result?.meta?.agentMeta?.usage || {};
      callback(null, { text, tokens: usage.total || usage.input + usage.output || 0, agent: task.name });
    } catch {
      callback(null, { text: stdout.slice(0, 1000), tokens: 0, agent: task.name });
    }
  });
}

// Endpoint: spuštění agenta
// Rate limiting: max 2 paralelní joby (ochrana proti přetížení)
const runningJobs = new Set();
const MAX_PARALLEL_JOBS = 2;

app.post('/api/agents/:name/run', requireAuth, (req, res) => {
  const { name } = req.params;
  if (!AGENT_TASKS[name]) {
    return res.status(404).json({ error: `Neznámý agent: ${name}` });
  }
  if (runningJobs.size >= MAX_PARALLEL_JOBS) {
    return res.status(429).json({ error: `Max ${MAX_PARALLEL_JOBS} paralelní joby. Zkuste to později.` });
  }
  runningJobs.add(name);
  runAgentExe(name, (err, result) => {
    runningJobs.delete(name);
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, ...result });
  });
});


// Health check — pro monitoring a auto-restart
app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime(), timestamp: new Date().toISOString() });
});


// Graceful shutdown — správné ukončení (SIGTERM/SIGINT)
const server = app.listen(PORT, () => {
  console.log(`[Sovereign API] Běží na http://localhost:${PORT}`);
  // Zapsat PID pro start/stop skripty
  try {
    fs.writeFileSync(path.join(__dirname, "../server.pid"), String(process.pid));
  } catch {}
});

// Graceful shutdown

// ========== PAPARAZZI — AUTOMATICKÝ BĚH V POZADÍ ==========
// Paparazzi "pracuje sám" — každých 30 min generuje Manažer Report
// a ukládá ho do souboru (historie). Jediné, co můžeš říct, je "ať se podívá znovu".

const PAPARAZZI_REPORT_DIR = path.join(SOVEREIGN_DIR, "workspaces/paparazzi");
const PAPARAZZI_REPORT_FILE = path.join(PAPARAZZI_REPORT_DIR, "paparazzi-report.json");
const PAPARAZZI_HISTORY_FILE = path.join(PAPARAZZI_REPORT_DIR, "paparazzi-history.json");
const PAPARAZZI_INTERVAL_MS = 60 * 60 * 1000; // 60 minut — LLM call je nákladný

// Generovat report a uložit (sdílená logika s endpointem)
async function generatePaparazziReport() {
  try {
    const [system, projects] = await Promise.all([
      collectSystemData(),
      (async () => {
        const dirs = fs.readdirSync(PROJECTS_DIR).filter(d => {
          if (SKIP_DIRS.test(d)) return false;
          try { return fs.statSync(path.join(PROJECTS_DIR, d)).isDirectory() && fs.existsSync(path.join(PROJECTS_DIR, d, ".git")); }
          catch { return false; }
        });
        const results = await Promise.allSettled(dirs.map((d) => collectProjectData(d)));
        return results.filter(r => r.status === "fulfilled" && r.value).map(r => r.value);
      })(),
    ]);
    const summary = summarizeProjects(projects);

    const prompt = buildPaparazziPrompt(system, summary);
    const report = await callOllama(prompt);

    const payload = {
      report: typeof report === "string" ? report : JSON.stringify(report),
      system,
      summary,
      generatedAt: new Date().toISOString(),
    };

    // Uložit aktuální report
    fs.mkdirSync(PAPARAZZI_REPORT_DIR, { recursive: true });
    fs.writeFileSync(PAPARAZZI_REPORT_FILE, JSON.stringify(payload, null, 2));

    // Přidat do historie (max 50 záznamů)
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

// Spustit automatický běh — Paparazzi pracuje sám v pozadí
setInterval(() => {
  generatePaparazziReport();
}, PAPARAZZI_INTERVAL_MS);

// První běh po 30s (ať se neblokuje start serveru)
setTimeout(() => {
  generatePaparazziReport();
}, 30000);

// ========== PAPARAZZI — MANAŽER REPORT (Ollama) ==========
// Volá Ollama (lokální server :11434, cloud model) s reálnými daty o systému a projektech.
// Paparazzi odpoví lidskou zprávou — "Manažer Report".

// Tajemství se načítají POUZE z env (viz .env, gitignored). Žádné hardcoded fallbacky.
// ===== OLLAMA — LLM pro Paparazzi report =====
// Ollama (lokální server :11434, cloud modely). Žádné API klíče, žádná externí závislost.
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "minimax-m3:cloud";

// Cache reportu (60s)
let paparazziReportCache = null;
let paparazziReportCacheAt = 0;

// Paparazzi persona — natvrdo definovaná.
// Drzý, přímý, inteligentní — mluví jako rapper, ne korporát.
const PAPARAZZI_PERSONA = `Jsi Paparazzi — "The Big Eye" Sovereign OS. Sběráš data o systému a projektech a reportuješ manažerovi (Peterovi).

Tvůj hlas: přímý, drzý, ale inteligentní. Mluvíš jako rapper, ne jako korporát. Krátké, jasné věty. Bez zbytečného balastu. Sebevědomý, občas sarkastický, ale vždy faktický. Žádný corporate jargon, žádné "synergie" a "best practices".`;

function buildPaparazziPrompt(system, summary) {
  // Stručná data o systému a projektech
  const sys = system || {};
  const cpu = sys.cpu || {};
  const mem = sys.memory || {};
  const disk = sys.disk || {};
  const procs = (sys.processes || []).slice(0, 3).map(p => `${p.cmd} (${p.cpu}%)`).join(", ");
  const counts = summary?.counts || {};

  // Kontext z minulého reportu (co se změnilo)
  let prevContext = "";
  try {
    const prev = JSON.parse(fs.readFileSync(PAPARAZZI_REPORT_FILE, "utf8"));
    const prevCounts = prev.summary?.counts || {};
    const changes = [];
    if (prevCounts.dirty !== undefined && prevCounts.dirty !== counts.dirty) {
      changes.push(`dirty working tree: ${prevCounts.dirty} → ${counts.dirty}`);
    }
    if (prevCounts.hot !== undefined && prevCounts.hot !== counts.hot) {
      changes.push(`žhavé projekty: ${prevCounts.hot} → ${counts.hot}`);
    }
    if (prev.system?.cpu?.pct !== undefined && prev.system.cpu.pct !== cpu.pct) {
      changes.push(`CPU: ${prev.system.cpu.pct}% → ${cpu.pct}%`);
    }
    if (prev.system?.memory?.pct !== undefined && prev.system.memory.pct !== mem.pct) {
      changes.push(`RAM: ${prev.system.memory.pct}% → ${mem.pct}%`);
    }
    prevContext = changes.length > 0
      ? `\n## ZMĚNY OD MINULÉHO REPORTU\n${changes.join("\n")}`
      : "\n## ZMĚNY OD MINULÉHO REPORTU\nŽádné výrazné změny — čísla jsou stejná. Vysvětli, proč se nic nezměnilo (co jsi kontroloval, co to znamená).";
  } catch {}

  const dataBlock = `
## AKTUÁLNÍ DATA (reálná, z monitoringu)
SYSTÉM:
- CPU: ${cpu.pct || 0}% (load ${cpu.load1 || 0}/${cpu.load5 || 0}, ${cpu.cores || "?"} jader)
- RAM: ${mem.pct || 0}% využito (${fmtBytes(mem.used)} z ${fmtBytes(mem.total)})
- Disk: ${disk.pct || 0}% (${disk.used || "?"} / ${disk.total || "?"})
- Top procesy: ${procs || "žádné"}
- Uptime: ${sys.uptime || "?"}

PROJEKTY:
- Celkem: ${counts.total || 0}
- Žhavé: ${counts.hot || 0}, Aktivní: ${counts.active || 0}, Pomalé: ${counts.slow || 0}, Idle: ${counts.idle || 0}
- Dirty working tree: ${counts.dirty || 0}
- Bez README: ${counts.undocumented || 0}
${prevContext}
`;

  return `${PAPARAZZI_PERSONA}\n\n${dataBlock}\n\nNapiš krátkou zprávu manažerovi (Peterovi) o stavu systému a projektů. Mluv jako Paparazzi — lidsky, ne korporátně. Struktura: 1) Co se děje (stav), 2) Co je problém (pokud je), 3) Co navrhuješ. Když se čísla nezměnily, vysvětli proč. Buď konkrétní a faktický. Max 150 slov.`;
}

// Volá Ollama (lokální server :11434) — cloud model přes lokální API.
async function callOllama(prompt) {
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: false }),
  });
  if (!res.ok) {
    throw new Error(`Ollama HTTP ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return data.response || "";
}

function fmtBytes(bytes) {
  if (!bytes) return "?";
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return gb.toFixed(1) + " GB";
  const mb = bytes / (1024 * 1024);
  return mb.toFixed(0) + " MB";
}

// Endpoint: Manažer Report od Paparazziho
app.get("/api/paparazzi/report", async (req, res) => {
  const force = req.query.refresh === "1";
  const now = Date.now();

  if (!force && paparazziReportCache && now - paparazziReportCacheAt < 60000) {
    return res.json({ ...paparazziReportCache, cached: true, cachedAt: paparazziReportCacheAt });
  }

  try {
    // 1. Sběr dat (systém + projekty)
    const [system, projects] = await Promise.all([
      collectSystemData(),
      (async () => {
        const dirs = fs.readdirSync(PROJECTS_DIR).filter(d => {
          if (SKIP_DIRS.test(d)) return false;
          try { return fs.statSync(path.join(PROJECTS_DIR, d)).isDirectory() && fs.existsSync(path.join(PROJECTS_DIR, d, ".git")); }
          catch { return false; }
        });
        const results = await Promise.allSettled(dirs.map((d) => collectProjectData(d)));
        return results.filter(r => r.status === "fulfilled" && r.value).map(r => r.value);
      })(),
    ]);
    const summary = summarizeProjects(projects);

    // 2. Sestavit prompt a zavolat Ollama
    const prompt = buildPaparazziPrompt(system, summary);
    const report = await callOllama(prompt);

    const payload = {
      report: typeof report === "string" ? report : JSON.stringify(report),
      system,
      summary,
      generatedAt: new Date().toISOString(),
      cached: false,
    };
    paparazziReportCache = payload;
    paparazziReportCacheAt = now;
    res.json(payload);
  } catch (err) {
    console.error("[Paparazzi] Report selhal:", err.message);
    res.status(500).json({ error: err.message });
  }
});

function shutdown(signal) {
  console.log(`[Sovereign API] Přijat ${signal}, ukončuji...`);
  server.close(() => {
    try { fs.unlinkSync(path.join(__dirname, "../server.pid")); } catch {}
    process.exit(0);
  });
  // Force exit po 5s, pokud se nepodaří zavřít
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("uncaughtException", (err) => {
  console.error("[Sovereign API] Uncaught exception:", err);
  // Nezabíjet proces tiše — logovat a ukončit (wrapper auto-restartuje).
  shutdown("uncaughtException");
});
process.on("unhandledRejection", (reason) => {
  console.error("[Sovereign API] Unhandled rejection:", reason);
  // Nezabíjet proces — logovat a pokračovat (stabilita)
});

