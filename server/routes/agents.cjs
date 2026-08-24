// ===== Routes: Agenti (logy + exekuce + SSE stream) =====
const fs = require("fs");
const path = require("path");
const { asyncHandler, HttpError, logError } = require("../lib/logger.cjs");

module.exports = function registerAgents(app, deps) {
  const { config, requireAuth, AGENT_TASKS, runAgentExe, runAgentStream, isSafeName } = deps;

  app.get("/api/agents", asyncHandler(async (req, res) => {
    const agentsDir = path.join(config.SOVEREIGN_DIR, "workspaces");
    const agents = [];
    if (!fs.existsSync(agentsDir)) return res.json(agents);

    const entries = fs.readdirSync(agentsDir);
    for (const name of entries) {
      const ws = path.join(agentsDir, name);
      let stat;
      try { stat = fs.statSync(ws); } catch { continue; }
      if (!stat.isDirectory()) continue;

      const manifestPath = path.join(ws, "manifest.json");
      const logPath = path.join(ws, "agent.log");
      let manifest = null;
      let log = [];
      if (fs.existsSync(manifestPath)) {
        try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); } catch (e) {
          logError({ err: e, extra: { source: "agent_manifest", agent: name } });
        }
      }
      if (fs.existsSync(logPath)) {
        try { log = fs.readFileSync(logPath, "utf8").trim().split("\n").filter(Boolean).slice(-20); } catch (e) {
          logError({ err: e, extra: { source: "agent_log", agent: name } });
        }
      }
      agents.push({ name, manifest, log, workspacePath: ws });
    }
    res.json(agents);
  }));

  // Rate-limited job execution
  const runningJobs = new Set();
  const MAX_PARALLEL_JOBS = 2;
  const cleanup = () => runningJobs.clear();
  process.on("SIGTERM", cleanup);
  process.on("SIGINT", cleanup);

  // ===== SSE stream agenta =====
  // GET /api/agents/:name/stream — posílá stdout/stderr v reálném čase
  app.get("/api/agents/:name/stream", requireAuth, asyncHandler(async (req, res) => {
    const { name } = req.params;
    if (!AGENT_TASKS[name]) throw new HttpError(404, `Neznámý agent: ${name}`);
    if (runningJobs.size >= MAX_PARALLEL_JOBS) {
      throw new HttpError(429, `Max ${MAX_PARALLEL_JOBS} paralelní joby. Zkuste to později.`);
    }

    runningJobs.add(name);

    // SSE setup
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // vypnout proxy buffering (nginx)

    let lastActivity = Date.now();

    const send = (type, payload) => {
      if (res.writableEnded) return;
      lastActivity = Date.now();
      const data = JSON.stringify({ type, ...payload, t: lastActivity });
      res.write(`data: ${data}\n\n`);
      // Vyprázdníme buffer vždy po každé zprávě
      if (res.flush) res.flush();
    };

    // Heartbeat každých 8s — udrží spojení živé a dá UI vědět, že nezamrzlo
    const heartbeat = setInterval(() => {
      if (res.writableEnded) return;
      const idle = Date.now() - lastActivity;
      if (idle >= 7000) {
        send("heartbeat", { idleMs: idle });
      }
    }, 8000);

    const cleanupStream = () => {
      clearInterval(heartbeat);
      if (!res.writableEnded) {
        try { res.end(); } catch {}
      }
      runningJobs.delete(name);
    };

    req.on("close", cleanupStream);
    req.on("aborted", cleanupStream);

    // Zahájení streamu
    send("start", { agent: name });

    const handle = runAgentStream(name, {
      onStdout: (chunk) => {
        send("stdout", { chunk });
      },
      onStderr: (chunk) => {
        send("stderr", { chunk });
      },
      onError: (err) => {
        send("error", { message: err.message });
        cleanupStream();
      },
      onDone: (result) => {
        send("done", {
          text: result.text.slice(0, 5000), // strih pro SSE
          tokens: result.tokens,
          agent: result.agent,
        });
        cleanupStream();
      },
    });

    // Uživatel může stream ukončit dřív — zabijeme child
    res.on("close", () => {
      handle.kill();
      cleanupStream();
    });
  }));

  app.post("/api/agents/:name/run", requireAuth, asyncHandler(async (req, res) => {
    const { name } = req.params;
    if (!AGENT_TASKS[name]) throw new HttpError(404, `Neznámý agent: ${name}`);
    if (runningJobs.size >= MAX_PARALLEL_JOBS) {
      throw new HttpError(429, `Max ${MAX_PARALLEL_JOBS} paralelní joby. Zkuste to později.`);
    }

    runningJobs.add(name);
    try {
      const result = await new Promise((resolve, reject) => {
        runAgentExe(name, (err, result) => {
          runningJobs.delete(name); // cleanup vždy, ať dopadne jakkoliv
          if (err) return reject(err);
          resolve(result);
        });
      });
      res.json({ success: true, ...result });
    } catch (e) {
      runningJobs.delete(name); // safety cleanup pro případ promise reject
      throw new HttpError(500, `Agent exekuce selhala: ${e.message}`, { expose: false });
    }
  }));

  app.post("/api/projects/:name/run-agent", requireAuth, asyncHandler(async (req, res) => {
    const { name } = req.params;
    const { agent = "archivist" } = req.body || {};
    if (!isSafeName(name)) throw new HttpError(400, "Invalid project name");
    if (!AGENT_TASKS[agent]) throw new HttpError(404, `Neznámý agent: ${agent}`);
    if (runningJobs.size >= MAX_PARALLEL_JOBS) {
      throw new HttpError(429, `Max ${MAX_PARALLEL_JOBS} paralelní joby. Zkuste to později.`);
    }

    const projectPath = path.join(config.PROJECTS_DIR, name);
    const resolved = path.resolve(projectPath);
    if (!resolved.startsWith(path.resolve(config.PROJECTS_DIR))) {
      throw new HttpError(403, "Path outside allowed root");
    }
    if (!fs.existsSync(projectPath)) throw new HttpError(404, "Project not found");

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

    try {
      const { execFile } = require("child_process");
      const args = ["agent", "--agent", config.EXEC_AGENT, "--json", "--model", config.EXEC_MODEL, "-m", projectPrompt];

      const { stdout, stderr } = await new Promise((resolve, reject) => {
        execFile("openclaw", args, {
          timeout: 300000,
          maxBuffer: 10 * 1024 * 1024,
          killSignal: "SIGKILL",
          env: { ...process.env, FORCE_COLOR: "0" },
        }, (err, stdout, stderr) => {
          if (err) {
            const snippet = (stderr || "").slice(0, 500);
            return reject(new Error(`${err.message}${snippet ? ` — ${snippet}` : ""}`));
          }
          resolve({ stdout, stderr });
        });
      });
      runningJobs.delete(jobKey);

      try {
        const data = JSON.parse(stdout);
        const payloads = data.result?.payloads || [];
        const text = payloads.map((p) => p.text || "").join("\n");
        return res.json({ success: true, text, agent: task.name, project: name });
      } catch {
        let text = (stdout || "").trim();
        if (!text) text = "(Agent dokončil, ale nevrátil žádný výstup.)";
        else if (text.length > 2000) text = text.slice(0, 2000) + "\n[... truncated]";
        return res.json({ success: true, text, agent: task.name, project: name });
      }
    } catch (e) {
      runningJobs.delete(jobKey); // safety cleanup
      throw new HttpError(500, `Exekuce selhala: ${e.message}`, { expose: false });
    }
  }));
};
