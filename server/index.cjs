const express = require("express");
const cors = require("cors");
const { execSync, execFile } = require("child_process");
const { promisify } = require("util");
const execFileP = promisify(execFile);
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 8891;
const PROJECTS_DIR = path.resolve(__dirname, "../../");
const SOVEREIGN_DIR = path.resolve(__dirname, "../../../.openclaw/workspace/sovereign-os");
const PAPARAZZI_DIR = path.join(process.env.HOME, "Library/Mobile Documents/com~apple~CloudDocs/Paparazzi");

// ========== API ==========

// Seznam projektů s reálnýma datama
app.get("/api/projects", (req, res) => {
  const projects = [];
  const dirs = fs.readdirSync(PROJECTS_DIR).filter(d => {
    try { return fs.statSync(path.join(PROJECTS_DIR, d)).isDirectory() && fs.existsSync(path.join(PROJECTS_DIR, d, ".git")); }
    catch { return false; }
  });

  dirs.forEach((name) => {
    const p = path.join(PROJECTS_DIR, name);
    try {
      const lastCommit = execSync(`cd "${p}" && git log -1 --format=%cd --date=relative 2>/dev/null`, { encoding: "utf8" }).trim() || "unknown";
      const branch = execSync(`cd "${p}" && git branch --show-current 2>/dev/null`, { encoding: "utf8" }).trim() || "unknown";
      const status = execSync(`cd "${p}" && git status --short 2>/dev/null`, { encoding: "utf8" }).trim();
      const dirty = status.length > 0;
      const lastHash = execSync(`cd "${p}" && git log -1 --format=%h 2>/dev/null`, { encoding: "utf8" }).trim() || "unknown";
      const lastMsg = execSync(`cd "${p}" && git log -1 --format=%s 2>/dev/null`, { encoding: "utf8" }).trim() || "unknown";

      projects.push({
        name,
        lastCommit,
        branch,
        dirty,
        lastHash,
        lastMsg,
        status: dirty ? "warn" : "ok",
      });
    } catch {}
  });

  res.json(projects);
});

// Detail projektu
app.get("/api/projects/:name", (req, res) => {
  const { name } = req.params;
  const p = path.join(PROJECTS_DIR, name);
  if (!fs.existsSync(p) || !fs.existsSync(path.join(p, ".git"))) {
    return res.status(404).json({ error: "Project not found" });
  }

  try {
    const lastCommit = execSync(`cd "${p}" && git log -1 --format=%cd --date=relative 2>/dev/null`, { encoding: "utf8" }).trim() || "unknown";
    const branch = execSync(`cd "${p}" && git branch --show-current 2>/dev/null`, { encoding: "utf8" }).trim() || "unknown";
    const status = execSync(`cd "${p}" && git status --short 2>/dev/null`, { encoding: "utf8" }).trim();
    const dirty = status.length > 0;
    const lastHash = execSync(`cd "${p}" && git log -1 --format=%h 2>/dev/null`, { encoding: "utf8" }).trim() || "unknown";
    const lastMsg = execSync(`cd "${p}" && git log -1 --format=%s 2>/dev/null`, { encoding: "utf8" }).trim() || "unknown";
    const log = execSync(`cd "${p}" && git log --oneline -10 2>/dev/null`, { encoding: "utf8" }).trim().split("\n").filter(Boolean);

    // Zkusíme najít bug tickets v projektu
    const bugsDir = path.join(p, "bugs");
    let bugs = [];
    if (fs.existsSync(bugsDir)) {
      bugs = fs.readdirSync(bugsDir).filter(f => f.endsWith(".json")).map(f => {
        const content = JSON.parse(fs.readFileSync(path.join(bugsDir, f), "utf8"));
        return { id: f.replace(".json", ""), ...content };
      });
    }

    res.json({
      name,
      lastCommit,
      branch,
      dirty,
      lastHash,
      lastMsg,
      log,
      bugs,
      status: dirty ? "warn" : "ok",
    });
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

// Async bounded shell — spustí příkaz v shellu, hard timeout, nikdy nevyhodí (neblokuje event loop)
async function run(cmd, timeoutMs = 4000) {
  try {
    const { stdout } = await execFileP("/bin/zsh", ["-c", cmd], { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 });
    return String(stdout).trim();
  } catch {
    return "";
  }
}

// Počet zdrojových souborů (async, bounded)
async function countSourceFiles(p) {
  const out = await run(`find "${p}" -type f \\( -name '*.js' -o -name '*.jsx' -o -name '*.ts' -o -name '*.tsx' -o -name '*.cjs' -o -name '*.md' \\) -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/.next/*' -not -path '*/dist/*' 2>/dev/null | wc -l`, 4000);
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
    run(`grep -rInE "TODO|FIXME|HACK|XXX" "${p}" ${EXCLUDE_DIRS} --include='*.js' --include='*.jsx' --include='*.ts' --include='*.tsx' --include='*.md' --include='*.cjs' 2>/dev/null | head -8`, 4000),
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
app.post("/api/paparazzi/capture", (req, res) => {
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

// Server-side cache — data collection je drahý, tak ho cachujeme (60s) a obnovujeme na vyžádání
let paparazziCache = null;
let paparazziCacheAt = 0;
const CACHE_TTL = 60000; // 60s

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
  const payload = { projects, summary, cached: false };
  paparazziCache = payload;
  paparazziCacheAt = now;
  res.json(payload);
});

// Bug tickets — vytvoření
app.post("/api/bugs", (req, res) => {
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
app.patch("/api/bugs/:project/:id", (req, res) => {
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
// Mapování Sovereign agenta → exekuční prompt pro OpenClaw agenta (experimental)
// Agent má přístup k souborům a gitu → reálně vykoná úkol a zapíše manifest.
const EXEC_AGENT = process.env.SOVEREIGN_EXEC_AGENT || 'experimental';
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

// Spustí exekuci agenta přes OpenClaw agenta (experimental)
function runAgentExe(agentName, callback) {
  const task = AGENT_TASKS[agentName];
  if (!task) {
    return callback(new Error(`Neznámý agent: ${agentName}`));
  }

  const args = ['agent', '--agent', EXEC_AGENT, '--json', '--model', SOVEREIGN_EXEC_MODEL, '-m', task.prompt];
  execFile('openclaw', args, {
    timeout: 300000, // 5 min
    maxBuffer: 10 * 1024 * 1024,
  }, (err, stdout, stderr) => {
    if (err) {
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
app.post('/api/agents/:name/run', (req, res) => {
  const { name } = req.params;
  if (!AGENT_TASKS[name]) {
    return res.status(404).json({ error: `Neznámý agent: ${name}` });
  }
  runAgentExe(name, (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, ...result });
  });
});

app.listen(PORT, () => {
  console.log(`[Sovereign API] Běží na http://localhost:${PORT}`);
});
