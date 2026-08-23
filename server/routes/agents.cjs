// ===== Routes: Agenti (logy + exekuce) =====
const fs = require("fs");
const path = require("path");

module.exports = function registerAgents(app, deps) {
  const { config, requireAuth, AGENT_TASKS, runAgentExe } = deps;

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
};
