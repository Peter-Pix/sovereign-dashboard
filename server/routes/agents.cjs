// ===== Routes: Agenti (logy + exekuce) =====
const fs = require("fs");
const path = require("path");

module.exports = function registerAgents(app, deps) {
  const { config, requireAuth, AGENT_TASKS, runAgentExe, isSafeName } = deps;

  // Seznam agentů s manifesty + logy
  app.get("/api/agents", (req, res) => {
    const agentsDir = path.join(config.SOVEREIGN_DIR, "workspaces");
    const agents = [];
    if (fs.existsSync(agentsDir)) {
      fs.readdirSync(agentsDir).forEach((name) => {
        const ws = path.join(agentsDir, name);
        try {
          if (!fs.statSync(ws).isDirectory()) return;
        } catch { return; }
        const manifestPath = path.join(ws, "manifest.json");
        const logPath = path.join(ws, "agent.log");
        let manifest = null;
        let log = [];
        if (fs.existsSync(manifestPath)) {
          try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); } catch {}
        }
        if (fs.existsSync(logPath)) {
          try { log = fs.readFileSync(logPath, "utf8").trim().split("\n").filter(Boolean).slice(-20); } catch {}
        }
        agents.push({ name, manifest, log, workspacePath: ws });
      });
    }
    res.json(agents);
  });

  // Spuštění agenta (rate limited)
  const runningJobs = new Set();
  const MAX_PARALLEL_JOBS = 2;
  // Bug 13: Cleanup při SIGTERM/SIGINT
  const cleanup = () => runningJobs.clear();
  process.on("SIGTERM", cleanup);
  process.on("SIGINT", cleanup);

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

  // Spuštění agenta na konkrétním projektu (Action Center)
  app.post("/api/projects/:name/run-agent", requireAuth, (req, res) => {
    const { name } = req.params;
    const { agent = "archivist" } = req.body;
    // Bug 8: Path traversal ochrana
    if (!isSafeName(name)) return res.status(400).json({ error: "Invalid project name" });
    if (!AGENT_TASKS[agent]) return res.status(404).json({ error: `Neznámý agent: ${agent}` });
    if (runningJobs.size >= MAX_PARALLEL_JOBS) return res.status(429).json({ error: `Max ${MAX_PARALLEL_JOBS} paralelní joby.` });

    const projectPath = path.join(config.PROJECTS_DIR, name);
    // Po validaci ověříme, že cesta je uvnitř PROJECTS_DIR
    const resolved = path.resolve(projectPath);
    if (!resolved.startsWith(path.resolve(config.PROJECTS_DIR))) {
      return res.status(403).json({ error: "Path outside allowed root" });
    }
    if (!fs.existsSync(projectPath)) return res.status(404).json({ error: "Project not found" });

    const task = AGENT_TASKS[agent];
    const projectPrompt = `Jsi ${task.name} — Sovereign OS. Pracuješ na projektu "${name}" v ${projectPath}.

ÚKOL: Proveď audit a vylepšení projektu "${name}".

POSTUP:
1. Prozkoumej strukturu projektu v ${projectPath} (README, zdrojové soubory, konfigurace).
2. Identifikuj, co projekt dělá a jaký je jeho stav.
3. Vylepši dokumentaci (README.md) s konkrétními informacemi.
4. Zapiš shrnutí do ${path.join(config.SOVEREIGN_DIR, "workspaces", task.workspace, "project-audit-" + name + ".json")}.

Buď konkrétní a věcný. Nezasahuj do jiných projektů.`;

    const jobKey = `${agent}:${name}`;
    runningJobs.add(jobKey);
    // Spustíme s custom promptem
    const { execFile } = require("child_process");
    const args = ["agent", "--agent", config.EXEC_AGENT, "--json", "--model", config.EXEC_MODEL, "-m", projectPrompt];
    // Bug 5: killSignal pro zombie processes
    execFile("openclaw", args, {
      timeout: 300000,
      maxBuffer: 10 * 1024 * 1024,
      killSignal: "SIGKILL",
      env: { ...process.env, FORCE_COLOR: "0" }, // Bug C (z minula): bez ANSI
    }, (err, stdout, stderr) => {
      runningJobs.delete(jobKey);
      if (err) {
        const stderrSnippet = (stderr || "").slice(0, 500);
        return res.status(500).json({ error: `Exekuce selhala: ${err.message}` + (stderrSnippet ? ` — ${stderrSnippet}` : "") });
      }
      try {
        const data = JSON.parse(stdout);
        const payloads = data.result?.payloads || [];
        const text = payloads.map((p) => p.text || "").join("\n");
        res.json({ success: true, text, agent: task.name, project: name });
      } catch {
        let text = (stdout || "").trim();
        if (!text) text = "(Agent dokončil, ale nevrátil žádný výstup.)";
        else if (text.length > 2000) text = text.slice(0, 2000) + "\n[... truncated]";
        res.json({ success: true, text, agent: task.name, project: name });
      }
    });
  });
};
