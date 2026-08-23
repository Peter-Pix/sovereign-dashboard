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

  // Spuštění agenta (rate limited)
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

  // Spuštění agenta na konkrétním projektu (Action Center)
  app.post("/api/projects/:name/run-agent", requireAuth, (req, res) => {
    const { name } = req.params;
    const { agent = "archivist" } = req.body;
    if (!isSafeName(name)) return res.status(400).json({ error: "Invalid project name" });
    if (!AGENT_TASKS[agent]) return res.status(404).json({ error: `Neznámý agent: ${agent}` });
    if (runningJobs.size >= MAX_PARALLEL_JOBS) return res.status(429).json({ error: `Max ${MAX_PARALLEL_JOBS} paralelní joby.` });

    // Vytvoříme prompt specifický pro daný projekt
    const projectPath = path.join(config.PROJECTS_DIR, name);
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

    runningJobs.add(`${agent}:${name}`);
    // Spustíme s custom promptem
    const { execFile } = require("child_process");
    const args = ["agent", "--agent", config.EXEC_AGENT, "--json", "--model", config.EXEC_MODEL, "-m", projectPrompt];
    execFile("openclaw", args, { timeout: 300000, maxBuffer: 10 * 1024 * 1024, killSignal: "SIGKILL" }, (err, stdout, stderr) => {
      runningJobs.delete(`${agent}:${name}`);
      if (err) return res.status(500).json({ error: `Exekuce selhala: ${err.message}` });
      try {
        const data = JSON.parse(stdout);
        const payloads = data.result?.payloads || [];
        const text = payloads.map((p) => p.text || "").join("\n");
        res.json({ success: true, text, agent: task.name, project: name });
      } catch {
        res.json({ success: true, text: stdout.slice(0, 1000), agent: task.name, project: name });
      }
    });
  });
};
