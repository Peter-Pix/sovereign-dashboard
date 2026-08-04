const express = require("express");
const cors = require("cors");
const { execSync } = require("child_process");
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

app.listen(PORT, () => {
  console.log(`[Sovereign API] Běží na http://localhost:${PORT}`);
});
