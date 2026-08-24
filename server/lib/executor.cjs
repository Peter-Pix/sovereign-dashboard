// ===== Roadmap Executor — autonomní dokončování tasků =====
// Uzavírá kruh: roadmapa → agent → dokončení → odškrtnutí.
// S ochranou proti loopu a plýtvání tokeny.
const fs = require("fs");
const path = require("path");
const config = require("../config.cjs");
const { parseRoadmap, findRoadmapFiles } = require("./roadmaps.cjs");
const { AGENT_TASKS } = require("./agents.cjs");

// ===== LIMITY (ochrana proti loopu a plýtvání tokeny) =====
const LIMITS = {
  MAX_TASKS_PER_RUN: 5,        // max tasků v jednom run-all
  MAX_RETRIES_PER_TASK: 1,     // max pokusů na jeden task (0 = jen 1 pokus)
  MAX_TOTAL_EXECUTIONS: 20,    // globální budget za session
  COOLDOWN_MS: 2000,           // min interval mezi exekucemi
  AGENT_TIMEOUT_MS: 300000,    // 5 min timeout na agenta
};

// ===== STATE (in-memory tracking pro detekci loopu) =====
const executionState = {
  totalExecutions: 0,          // celkový počet exekucí za session
  taskAttempts: new Map(),     // taskKey → počet pokusů
  stuckTasks: new Set(),       // taskKey, které se nepodařilo odškrtnout
  lastExecutionAt: 0,          // timestamp poslední exekuce
  queue: [],                   // fronta tasků čekajících na zpracování
  current: null,               // aktuálně běžící task
  queueLog: [],                // historie zpracovaných tasků (pro UI)
  workerRunning: false,        // jestli worker běží
  paused: false,               // jestli je fronta pozastavená
};

function taskKey(project, taskText) {
  return `${project}::${taskText}`;
}

// Mapování tasku → agent podle klíčových slov
const AGENT_ROUTING = [
  { agent: "archivist", keywords: ["audit", "dokument", "readme", "refactor", "fix", "oprav", "kód", "code", "cleanup", "úklid", "test", "bug"] },
  { agent: "scout", keywords: ["lead", "firma", "prospect", "sales", "prodej", "vyhled", "search", "research", "průzkum"] },
  { agent: "strategist", keywords: ["pitch", "strateg", "plán", "plan", "marketing", "brand", "position", "gtm", "launch"] },
  { agent: "spine", keywords: ["status", "check", "verify", "kontrol", "přehled", "report", "monitor", "audit systému"] },
];

function routeTaskToAgent(taskText) {
  const lower = taskText.toLowerCase();
  for (const route of AGENT_ROUTING) {
    if (route.keywords.some((kw) => lower.includes(kw))) {
      return route.agent;
    }
  }
  return "archivist";
}

// Najde první nehotový task, který ještě není "stuck" a nepřekročil retry limit
function findNextTask(projectName) {
  const projectDir = path.join(config.PROJECTS_DIR, projectName);
  const files = findRoadmapFiles(projectDir);
  if (files.length === 0) return null;

  for (const file of files) {
    const content = fs.readFileSync(path.join(projectDir, file), "utf8");
    const parsed = parseRoadmap(content);
    for (const phase of parsed.phases) {
      for (const item of phase.items) {
        if (item.done) continue;
        const key = taskKey(projectName, item.text);
        // Přeskoč stuck tasky a tasky s vyčerpaným retry limitem
        if (executionState.stuckTasks.has(key)) continue;
        const attempts = executionState.taskAttempts.get(key) || 0;
        if (attempts > LIMITS.MAX_RETRIES_PER_TASK) continue;

        return {
          project: projectName,
          file,
          phase: phase.title,
          task: item.text,
          agent: routeTaskToAgent(item.text),
          attempts,
        };
      }
    }
  }
  return null; // Vše hotové (nebo vše stuck/vyčerpané)
}

// Odškrtne task v ROADMAP.md (přepíše [ ] → [x])
function markTaskDone(projectName, file, taskText) {
  const projectDir = path.join(config.PROJECTS_DIR, projectName);
  const filePath = path.join(projectDir, file);
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split("\n");

  let marked = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes("[ ]") && line.includes(taskText)) {
      lines[i] = line.replace("[ ]", "[x]");
      marked = true;
      break;
    }
  }

  if (marked) {
    fs.writeFileSync(filePath, lines.join("\n"));
  }
  return marked;
}

// Spustí agenta na konkrétní task (přes openclaw CLI)
function runTaskAgent(agentName, projectName, taskText, callback) {
  const task = AGENT_TASKS[agentName];
  if (!task) return callback(new Error(`Neznámý agent: ${agentName}`));

  const projectDir = path.join(config.PROJECTS_DIR, projectName);
  const prompt = `Jsi ${task.name} — Sovereign OS. Pracuješ na projektu "${projectName}" v ${projectDir}.

ÚKOL Z ROADMAPY: ${taskText}

POSTUP:
1. Prozkoumej projekt v ${projectDir} (README, struktura, stav).
2. Dokonči konkrétně tento úkol: "${taskText}".
3. Proveď skutečné změny (uprav soubory, doplň dokumentaci, oprav kód).
4. Zapiš shrnutí toho, co jsi udělal, do ${path.join(config.SOVEREIGN_DIR, "workspaces", task.workspace, "roadmap-task-" + projectName + ".json")}.

Buď konkrétní a věcný. Pracuj jen na tomto úkolu, ne na jiných.`;

  const { execFile } = require("child_process");
  const args = ["agent", "--agent", config.EXEC_AGENT, "--json", "--model", config.EXEC_MODEL, "-m", prompt];

  let finished = false;
  const timeout = setTimeout(() => {
    if (!finished) {
      finished = true;
      callback(new Error("Agent exekuce timeout (5 min)"));
    }
  }, LIMITS.AGENT_TIMEOUT_MS);

  execFile("openclaw", args, { timeout: LIMITS.AGENT_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024, killSignal: "SIGKILL" }, (err, stdout, stderr) => {
    if (finished) return;
    finished = true;
    clearTimeout(timeout);
    if (err) return callback(new Error(`Exekuce selhala: ${err.message}`));
    try {
      const data = JSON.parse(stdout);
      const payloads = data.result?.payloads || [];
      const text = payloads.map((p) => p.text || "").join("\n");
      callback(null, { text, agent: task.name });
    } catch {
      callback(null, { text: stdout.slice(0, 1000), agent: task.name });
    }
  });
}

// ===== Orchestrace s ochranou proti loopu =====

// Zkontroluje, jestli můžeme spustit další exekuci (budget + cooldown)
function canExecute() {
  if (executionState.totalExecutions >= LIMITS.MAX_TOTAL_EXECUTIONS) {
    return { ok: false, reason: `Globální budget vyčerpán (${LIMITS.MAX_TOTAL_EXECUTIONS} exekucí)` };
  }
  const now = Date.now();
  if (now - executionState.lastExecutionAt < LIMITS.COOLDOWN_MS) {
    return { ok: false, reason: "Cooldown — počkejte chvíli" };
  }
  return { ok: true };
}

// Spustí JEDEN task s plnou ochranou
function executeOneTask(projectName, callback) {
  const check = canExecute();
  if (!check.ok) return callback(new Error(check.reason));

  const next = findNextTask(projectName);
  if (!next) return callback(null, { done: true, message: "Všechny tasky hotové (nebo stuck/vyčerpané)" });

  const key = taskKey(projectName, next.task);
  executionState.totalExecutions++;
  executionState.lastExecutionAt = Date.now();
  executionState.taskAttempts.set(key, (executionState.taskAttempts.get(key) || 0) + 1);

  console.log(`[Executor] Spouštím ${next.agent} na: "${next.task}" (pokus ${next.attempts + 1})`);

  runTaskAgent(next.agent, projectName, next.task, (err, result) => {
    if (err) {
      console.error(`[Executor] Selhalo: ${err.message}`);
      return callback(null, { success: false, task: next.task, error: err.message });
    }

    const marked = markTaskDone(projectName, next.file, next.task);
    if (!marked) {
      // Task se nepodařilo odškrtnout → označ jako stuck, aby se nezacyklil
      executionState.stuckTasks.add(key);
      console.warn(`[Executor] Task se nepodařilo odškrtnout (stuck): "${next.task}"`);
    }

    callback(null, {
      success: true,
      project: projectName,
      task: next.task,
      agent: next.agent,
      marked,
      result: result.text?.slice(0, 500) || "Dokončeno",
    });
  });
}

// Spustí VŠECHNY tasky sekvenčně s budget limitem
function executeAllTasks(projectName, callback) {
  const completed = [];
  const failed = [];
  const skipped = [];

  const processNext = () => {
    const check = canExecute();
    if (!check.ok) {
      return callback(null, { success: true, completed, failed, skipped, stopped: check.reason });
    }
    if (completed.length + failed.length >= LIMITS.MAX_TASKS_PER_RUN) {
      return callback(null, { success: true, completed, failed, skipped, stopped: `Dosažen limit ${LIMITS.MAX_TASKS_PER_RUN} tasků na run` });
    }

    const next = findNextTask(projectName);
    if (!next) {
      return callback(null, { success: true, completed, failed, skipped, stopped: "Vše hotové" });
    }

    const key = taskKey(projectName, next.task);
    executionState.totalExecutions++;
    executionState.lastExecutionAt = Date.now();
    executionState.taskAttempts.set(key, (executionState.taskAttempts.get(key) || 0) + 1);

    console.log(`[Executor] (run-all) Spouštím ${next.agent} na: "${next.task}"`);

    runTaskAgent(next.agent, projectName, next.task, (err, result) => {
      if (err) {
        failed.push({ task: next.task, error: err.message });
      } else {
        const marked = markTaskDone(projectName, next.file, next.task);
        if (marked) {
          completed.push({ task: next.task, agent: next.agent });
        } else {
          executionState.stuckTasks.add(key);
          skipped.push({ task: next.task, reason: "Nepodařilo se odškrtnout (stuck)" });
        }
      }
      setTimeout(processNext, LIMITS.COOLDOWN_MS);
    });
  };

  processNext();
}

// Reset state (pro testování / novou session)
function resetExecutionState() {
  executionState.totalExecutions = 0;
  executionState.taskAttempts.clear();
  executionState.stuckTasks.clear();
  executionState.lastExecutionAt = 0;
  executionState.queue = [];
  executionState.current = null;
  executionState.queueLog = [];
  executionState.workerRunning = false;
  executionState.paused = false;
}

// Vrátí aktuální stav (pro monitoring)
function getExecutionState() {
  return {
    totalExecutions: executionState.totalExecutions,
    maxTotal: LIMITS.MAX_TOTAL_EXECUTIONS,
    stuckTasks: executionState.stuckTasks.size,
    activeAttempts: executionState.taskAttempts.size,
  };
}

// ===== QUEUE — zpracování tasků na pozadí =====

// Naplní frontu všemi nehotovými tasky projektu (neblokuje)
function enqueueProjectTasks(projectName) {
  const projectDir = path.join(config.PROJECTS_DIR, projectName);
  const files = findRoadmapFiles(projectDir);
  if (files.length === 0) return 0;

  let added = 0;
  for (const file of files) {
    const content = fs.readFileSync(path.join(projectDir, file), "utf8");
    const parsed = parseRoadmap(content);
    for (const phase of parsed.phases) {
      for (const item of phase.items) {
        if (item.done) continue;
        const key = taskKey(projectName, item.text);
        if (executionState.stuckTasks.has(key)) continue;
        const attempts = executionState.taskAttempts.get(key) || 0;
        if (attempts > LIMITS.MAX_RETRIES_PER_TASK) continue;
        // Přeskoč, pokud už je ve frontě
        if (executionState.queue.some((q) => q.key === key)) continue;

        executionState.queue.push({
          key,
          project: projectName,
          file,
          phase: phase.title,
          task: item.text,
          agent: routeTaskToAgent(item.text),
        });
        added++;
      }
    }
  }
  return added;
}

// Worker — zpracovává frontu po jednom tasku
function startQueueWorker() {
  if (executionState.workerRunning) return;
  executionState.workerRunning = true;

  const processNext = () => {
    // Zastav, pokud je fronta pozastavená
    if (executionState.paused) {
      executionState.workerRunning = false;
      return;
    }
    // Zastav, pokud je fronta prázdná
    if (executionState.queue.length === 0) {
      executionState.workerRunning = false;
      executionState.current = null;
      return;
    }

    const check = canExecute();
    if (!check.ok) {
      // Budget/cooldown — počkej a zkus znovu
      setTimeout(processNext, LIMITS.COOLDOWN_MS);
      return;
    }

    const item = executionState.queue.shift();
    executionState.current = item;
    executionState.totalExecutions++;
    executionState.lastExecutionAt = Date.now();
    executionState.taskAttempts.set(item.key, (executionState.taskAttempts.get(item.key) || 0) + 1);

    console.log(`[Executor] (queue) Spouštím ${item.agent} na: "${item.task}"`);

    runTaskAgent(item.agent, item.project, item.task, (err, result) => {
      if (err) {
        executionState.queueLog.unshift({
          task: item.task,
          agent: item.agent,
          status: "failed",
          error: err.message,
          at: new Date().toISOString(),
        });
      } else {
        const marked = markTaskDone(item.project, item.file, item.task);
        if (marked) {
          executionState.queueLog.unshift({
            task: item.task,
            agent: item.agent,
            status: "done",
            at: new Date().toISOString(),
          });
        } else {
          executionState.stuckTasks.add(item.key);
          executionState.queueLog.unshift({
            task: item.task,
            agent: item.agent,
            status: "stuck",
            at: new Date().toISOString(),
          });
        }
      }
      // Omez log na posledních 50 záznamů
      if (executionState.queueLog.length > 50) executionState.queueLog.length = 50;

      executionState.current = null;
      setTimeout(processNext, LIMITS.COOLDOWN_MS);
    });
  };

  processNext();
}

// Vrátí stav fronty (pro UI polling)
function getQueueState() {
  return {
    queueLength: executionState.queue.length,
    current: executionState.current,
    log: executionState.queueLog,
    workerRunning: executionState.workerRunning,
    paused: executionState.paused,
  };
}

// Pozastaví zpracování fronty
function pauseQueue() {
  executionState.paused = true;
  return { paused: true };
}

// Obnoví zpracování fronty
function resumeQueue() {
  executionState.paused = false;
  startQueueWorker();
  return { paused: false };
}

module.exports = {
  routeTaskToAgent,
  findNextTask,
  markTaskDone,
  runTaskAgent,
  executeOneTask,
  executeAllTasks,
  enqueueProjectTasks,
  startQueueWorker,
  getQueueState,
  pauseQueue,
  resumeQueue,
  resetExecutionState,
  getExecutionState,
  LIMITS,
  AGENT_ROUTING,
};
