const express = require("express");
const cors = require("cors");
const { execSync, exec } = require("child_process");
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

// Paparazzi captures
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

ÚKOL: Najdi 3 nové české firmy (10-200 zaměstnanců) v sektorech účetnictví, právo, logistika nebo e-commerce, které mají repetitivní úkoly vhodné pro AI automatizaci.

POSTUP:
1. Vyhledej na webu (Seznam Firmy.cz, webové stránky) kvalifikované leady.
2. Pro každý lead zapiš: jméno, web, sektor, lokace, odhad velikosti, repetitivní úkol, AI value proposition.
3. Zapiš výsledky do souboru /Users/petrpiskacek/.openclaw/workspace/sovereign-os/workspaces/scout/leads-new.json (JSON).
4. Aktualizuj manifest /Users/petrpiskacek/.openclaw/workspace/sovereign-os/workspaces/scout/manifest.json (status, summary, identity).

Nepřidávej nové leady do původního leads.json (zachovej ho). Buď faktický a ověřitelný — neplň si to z hlavy.`,
  },
  strategist: {
    name: "The Strategist (The Big Mouth)",
    workspace: "strategist",
    prompt: `Jsi The Strategist — The Big Mouth Sovereign OS. Tvoje role: přeložit komplexitu do statusu a peněz.

ÚKOL: Vytvoř konkrétní pitch pro jednoho z leadů, které našel Scout (ADAR účetnictví, CINK advokacie, Pragotour logistika, DárkyHry nebo Mariveo e-commerce).

POSTUP:
1. Přečti soubor /Users/petrpiskacek/.openclaw/workspace/sovereign-os/workspaces/scout/leads.json (pokud existuje).
2. Vyber jednoho leada a napiš pitch v Sovereign voice (zero bullshit, autentický český tón, hodnota místo technických detailů).
3. Zapiš pitch do souboru /Users/petrpiskacek/.openclaw/workspace/sovereign-os/workspaces/strategist/pitch-[leada].md
4. Aktualizuj manifest /Users/petrpiskacek/.openclaw/workspace/sovereign-os/workspaces/strategist/manifest.json (status, summary).

Pitch musí být konkrétní pro tu firmu, ne generický. Mluv o jejich skutečném problému.`,
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
  exec(`openclaw ${args.map(a => `"${a}"`).join(' ')}`, {
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
