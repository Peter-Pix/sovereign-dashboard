// ===== Roadmap Executor — autonomní dokončování tasků =====
// Uzavírá kruh: roadmapa → agent → dokončení → odškrtnutí.
// S ochranou proti loopu a plýtvání tokeny.

const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { buildContext } = require("./contextBuilder.cjs");
const { buildMcpContextSection } = require("./mcpContext.cjs");
const { selfCorrect } = require("./selfCorrector.cjs");
const config = require("../config.cjs");
const { parseRoadmap, findRoadmapFiles } = require("./roadmaps.cjs");
const { AGENT_TASKS } = require("./agents.cjs");
const { isSafeName } = require("./projects.cjs"); // použito pro validaci projectName

// ===== LIMITY (ochrana proti loopu a plýtvání tokeny) =====
const LIMITS = {
  MAX_TASKS_PER_RUN: 5,        // max tasků v jednom run-all
  MAX_CONCURRENT: config.EXEC_CONCURRENCY || 3, // max souběžných exekucí (paralelní pool)
  // --- Adaptivní řízení (inteligentní sloty) ---
  // Max souběžných exekucí z JEDNOHO projektu (default 1). Tasky z jednoho
  // projektu si konkurují na stejných souborech → paralelně nedávají smysl.
  MAX_PER_PROJECT: Number(process.env.EXEC_MAX_PER_PROJECT) || 1,
  // Max souběžných tasků ze STEJNÉ fáze (závislé tasky → sekvenčně).
  MAX_PER_PHASE: Number(process.env.EXEC_MAX_PER_PHASE) || 1,
  MAX_RETRIES_PER_TASK: 1,     // max POKUSů CELKEM (1 = jen jeden pokus, 0 = žádný, 2 = dva pokusy)
  MAX_TOTAL_EXECUTIONS: 20,    // globální budget za session
  COOLDOWN_MS: 2000,           // min interval mezi exekucemi
  AGENT_TIMEOUT_MS: 300000,    // 5 min timeout na agenta
  MAX_LOG_ENTRIES: 50,         // omezení queue logu
  MAX_TASK_ATTEMPTS_MAP: 200,  // bezpečnostní limit velikosti Map
  MAX_STUCK_TASKS_SET: 200,    // bezpečnostní limit velikosti Set
};

// ===== STATE (in-memory tracking pro detekci loopu) =====
const executionState = {
  totalExecutions: 0,
  taskAttempts: new Map(),
  stuckTasks: new Set(),
  lastExecutionAt: 0,
  queue: [],
  queueIndex: new Set(), // O(1) detekce duplikátů místo .some() — viz Bug D
  current: null,
  active: [],       // pole běžících exekucí (paralelní pool) — viz Phase 1
  pausedKeys: new Set(), // keyy tasků pozastavených uživatelem (per-process kill)
  queueLog: [],
  workerRunning: false,
  paused: false,
};

// Pomocná funkce: vyčistí záznam, pokud task úspěšně dokončen (viz Bug B)
function clearTaskAttempts(key) {
  executionState.taskAttempts.delete(key);
}

// Pomocná funkce: bounded Map/Set (viz Bug H)
function boundedAdd(map, key, value) {
  if (map instanceof Map) {
    if (map.size >= LIMITS.MAX_TASK_ATTEMPTS_MAP && !map.has(key)) {
      // Nejstarší klíč odebereme (FIFO)
      const firstKey = map.keys().next().value;
      map.delete(firstKey);
    }
    map.set(key, value);
  } else if (map instanceof Set) {
    if (map.size >= LIMITS.MAX_STUCK_TASKS_SET && !map.has(key)) {
      const firstValue = map.values().next().value;
      map.delete(firstValue);
    }
    map.add(key);
  }
}

function taskKey(project, taskText) {
  return `${project}::${taskText}`;
}

// Validuje projectName proti path traversal (viz Bug I)
function assertSafeProject(projectName) {
  if (!isSafeName(projectName)) {
    throw new Error(`Neplatný název projektu: ${projectName}`);
  }
}

// Mapování tasku → agent podle klíčových slov
// Všechna klíčová slova jsou normalizovaná (lowercase, bez diakritiky) pro konzistentní matching (viz Bug F)
const AGENT_ROUTING = [
  {
    agent: "archivist",
    keywords: ["audit", "dokument", "readme", "refactor", "fix", "oprav", "kod", "code", "cleanup", "uklid", "test", "bug", "prepsat", "doplnit", "vylepsit"],
  },
  {
    agent: "scout",
    keywords: ["lead", "firma", "prospect", "sales", "prodej", "vyhled", "search", "research", "pruzkum", "ares", "ico"],
  },
  {
    agent: "strategist",
    keywords: ["pitch", "strateg", "plan", "marketing", "brand", "position", "gtm", "launch", "byznys", "cena", "klient"],
  },
  {
    agent: "spine",
    // Normalizovaná slova (bez diakritiky): overit, prehled, kontrola, ...
    keywords: ["status", "check", "verify", "kontrol", "prehled", "report", "monitor", "system", "log", "sync", "csv", "db", "sqlite", "spustit", "otevrit", "bezi", "cte"],
  },
];

// Normalizuje text (lowercase + odstraní diakritiku) pro konzistentní routing
function normalizeForRouting(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// Model pro daného agenta. Phase 1: VŠE na jednom modelu (EXEC_MODEL).
// Kdyby se v budoucnu kombinovaly modely, stačí tady přidat mapu per agent.
function modelForAgent(agentName) {
  return config.EXEC_MODEL; // deepseek default
}

function routeTaskToAgent(taskText) {
  const normalized = normalizeForRouting(taskText);
  for (const route of AGENT_ROUTING) {
    if (route.keywords.some((kw) => normalized.includes(kw))) {
      return route.agent;
    }
  }
  return "archivist";
}

// ====================================================================
// ROADMAP PARSING — projde CELOU roadmapu, přeskočí jen jednotlivé stuck/vyčerpané tasky
// Dříve: nalezení jednoho stuck tasku přeskočilo celý zbytek fáze (viz Bug E)
// ====================================================================
function findNextTask(projectName) {
  assertSafeProject(projectName);

  const projectDir = path.join(config.PROJECTS_DIR, projectName);
  const files = findRoadmapFiles(projectDir);
  if (files.length === 0) return null;

  for (const file of files) {
    const filePath = path.join(projectDir, file);
    let content;
    try {
      content = fs.readFileSync(filePath, "utf8");
    } catch {
      continue;
    }
    const parsed = parseRoadmap(content);

    // Projdi VŠECHNY phases a VŠECHNY items — přeskoč jen jednotlivé stuck/vyčerpané
    for (const phase of parsed.phases) {
      for (const item of phase.items) {
        if (item.done) continue;

        const key = taskKey(projectName, item.text);
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

// ====================================================================
// TASK LINE MATCHING — přesná shoda s normalizací
// Dříve: order-flexible "every word match" vytvářel false-positive na krátkých textech (viz Bug A)
// Nově: normalizujeme obě strany, porovnáváme CELÉ řetězce, ale ne case-sensitive
// ====================================================================
function normalizeTaskText(text) {
  return text
    .replace(/[#*_~`]/g, "")     // odstraní markdown formátování
    .replace(/\s+/g, " ")        // srazí více mezer
    .trim()
    .toLowerCase();
}

function findTaskLine(lines, taskText) {
  if (!taskText) return -1;
  const normTask = normalizeTaskText(taskText);
  if (!normTask) return -1;

  // Pro krátké tasky (< 20 znaků) vyžadujeme PŘESNOU substring shodu.
  // Jinak by se krátká slova jako "app.py" matchla na každý řádek, kde se vyskytují.
  // Tím se řeší false-positive z Bug A.
  const isShortTask = normTask.length < 20;

  let bestIdx = -1;
  let bestScore = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Bug fix: matchuj i [x] řádky. Dřív se [x] skipovaly → pokud agent
    // sám odškrtl task (nebo text modifikoval), markTaskDone nenašel [ ]
    // a vrátil "stuck" i když byla práce hotová.
    if (!line.includes("[") || !line.includes("]")) continue;

    const normLine = normalizeTaskText(line);

    // 1) Přesná substring shoda po normalizaci → okamžitá výhra (delší tasky)
    //    Pro krátké tasky kontrolujeme, že se vyskytuje jako celé slovo.
    if (isShortTask) {
      const regex = new RegExp("\\b" + normTask.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b");
      if (regex.test(normLine)) return i;
    } else if (normLine.includes(normTask)) {
      return i;
    }

    // 2) Score-based fallback: překryv slov pro delší tasky (≥80%)
    //    Pro krátké tasky se nevyužívá fallback (už by se matchla přesná shoda).
    const taskWords = normTask.split(/\s+/).filter((w) => w.length >= 4);
    if (taskWords.length < 2) continue;
    const matchedWords = taskWords.filter((w) => normLine.includes(w));
    const score = matchedWords.length / taskWords.length;

    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  // Pro krátké tasky: přesná shoda nebyla nalezena → -1 (žádný fallback)
  // Pro delší tasky: vyžadujeme ≥80% překryv slov
  return isShortTask ? -1 : (bestScore >= 0.8 ? bestIdx : -1);
}

function markTaskDone(projectName, file, taskText) {
  assertSafeProject(projectName);

  const projectDir = path.join(config.PROJECTS_DIR, projectName);
  const filePath = path.join(projectDir, file);

  let content;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch (e) {
    console.error(`[Executor] Nelze číst ${filePath}: ${e.message}`);
    return false;
  }

  const lines = content.split("\n");
  const idx = findTaskLine(lines, taskText);
  if (idx === -1) return false;

  // Pokud už je [x], nezměníme nic (práce je hotnáš — není to stuck)
  const line = lines[idx];
  if (line.includes("[x]")) return true;

  // Atomický zápis (zápis do temp + rename), aby se zabránilo poškození při concurrent čtení
  const newContent = lines.map((l, i) => (i === idx ? l.replace("[ ]", "[x]") : l)).join("\n");
  const tmpPath = filePath + ".tmp." + process.pid;

  try {
    fs.writeFileSync(tmpPath, newContent);
    fs.renameSync(tmpPath, filePath);
  } catch (e) {
    console.error(`[Executor] Nelze zapsat ${filePath}: ${e.message}`);
    try { fs.unlinkSync(tmpPath); } catch {}
    return false;
  }
  return true;
}

// ====================================================================
// AGENT EXECUTION — robustní spouštění přes openclaw CLI
// Dříve: chybějící diagnostika ze stderr (viz Bug C)
// ====================================================================
function runTaskAgent(agentName, projectName, taskText, callback, model) {
  const execModel = model || config.EXEC_MODEL; // Phase 1: default = deepseek
  const task = AGENT_TASKS[agentName];
  if (!task) return callback(new Error(`Neznámý agent: ${agentName}`));

  // TEST SEAM (E2E): deterministický mock — místo reálného openclaw agenta
  // okamžitě "dokončí" task. Pouze pro testy paralelního poolu, kde
  // nechceme volat cloud model (5 min / reálné tokeny).
  // Aktivuje se: EXECUTOR_MOCK_AGENT=1  (+ volitelně EXECUTOR_MOCK_DELAY_MS pro
  // načasování tak, aby se nejdřív zaplnily všechny sloty).
  if (process.env.EXECUTOR_MOCK_AGENT === "1") {
    const delay = Number(process.env.EXECUTOR_MOCK_DELAY_MS) || 0;
    const modelUsed = execModel;
    setTimeout(() => {
      // Simulace: agent task "dokončil" (markTaskDone pak odškrtne ROADMAP).
      callback(null, { text: `[mock] ${agentName} dokončil: ${taskText} (${modelUsed})`, agent: task.name });
    }, delay);
    return;
  }

  const projectDir = path.join(config.PROJECTS_DIR, projectName);

  let contextSection = "";
  try {
    const ctx = buildContext(projectName, taskText, { maxFiles: 8, maxCharsPerFile: 3000 });
    contextSection = "\n\n" + ctx.context;
  } catch (e) {
    contextSection = `\n\n(_Kontextové soubory se nepodařilo načíst: ${e.message}_)`;
  }

  // MCP sekci načteme async — agenty mají přístup k MCP tools,
  // ale model musí vědět, že existují. Načtení je best-effort (nikdy nefailne).
  buildMcpContextSection()
    .then((mcpSection) => {
      const basePrompt = `Jsi ${task.name} — Sovereign OS. Pracuješ na projektu "${projectName}" v ${projectDir}.\n\nÚKOL Z ROADMAPY: ${taskText}${contextSection}\n\nPOSTUP:
1. Použij výše uvedený kontext (README, kód, dokumentaci).
2. Dokonči konkrétně tento úkol: "${taskText}".
3. Proveď skutečné změny (uprav soubory, doplň dokumentaci, oprav kód).
4. Po změnách spusť testy příkazem, který najdeš v package.json nebo pomocí "node --test".
5. Pokud testy failují, OPRAV CHYBU a znovu je spusť. Max 3 pokusy.
6. Zapiš shrnutí toho, co jsi udělal, do ${path.join(config.SOVEREIGN_DIR, "workspaces", task.workspace, "roadmap-task-" + projectName + ".json")}.${mcpSection}

Buď konkrétní a věcný. Pracuj jen na tomto úkolu, ne na jiných.`;

      const runAgentWithPrompt = (prompt, cb) => {
        const args = ["agent", "--agent", config.EXEC_AGENT, "--json", "--model", execModel, "-m", prompt];
        let finished = false;
        const timeout = setTimeout(() => {
          if (finished) return;
          finished = true;
          cb(new Error("Agent exekuce timeout (5 min)"));
        }, LIMITS.AGENT_TIMEOUT_MS);

        execFile("openclaw", args, {
          timeout: LIMITS.AGENT_TIMEOUT_MS,
          maxBuffer: 10 * 1024 * 1024,
          killSignal: "SIGKILL",
          env: { ...process.env, FORCE_COLOR: "0" },
        }, (err, stdout, stderr) => {
          if (finished) return;
          finished = true;
          clearTimeout(timeout);
          if (err) {
            const snippet = (stderr || "").slice(0, 500);
            return cb(new Error(`Exekuce selhala: ${err.message}${snippet ? ` — stderr: ${snippet}` : ""}`));
          }
          try {
            const data = JSON.parse(stdout);
            const payloads = data.result?.payloads || [];
            const text = payloads.map((p) => p.text || "").join("\n");
            cb(null, { text, agent: task.name });
          } catch {
            let text = (stdout || "").trim();
            if (!text) text = "(Agent dokončil, ale nevrátil žádný výstup.)";
            else if (text.length > 2000) text = text.slice(0, 2000) + "\n[... truncated]";
            cb(null, { text, agent: task.name });
          }
        });
      };

      selfCorrect(runAgentWithPrompt, projectDir, basePrompt)
        .then((result) => {
          const summary = result.success
            ? `✓ Task dokončen na ${result.attempts}. pokus. Testy prošly.`
            : `⚠ Task dokončen po ${result.attempts} pokusech. Testy stále failují.`;
          const text = [result.finalResult?.text || "", "", "---", summary, "", `Test command: ${result.testResult?.command || "none"}`, `Test output: ${(result.testResult?.stdout || "").slice(0, 500)}`].join("\n");
          callback(null, {
            text,
            agent: task.name,
            attempts: result.attempts,
            success: result.success,
          });
        })
        .catch((err) => callback(err));
    })
    .catch(() => {
      // MCP načtení selhalo — spustíme bez MCP sekce (graceful degradation)
      const basePrompt = `Jsi task.name — Sovereign OS. Pracuješ na projektu "${projectName}" v ${projectDir}.\n\nÚKOL Z ROADMAPY: ${taskText}${contextSection}`;
      const runAgentWithPrompt = (prompt, cb) => {
        const args = ["agent", "--agent", config.EXEC_AGENT, "--json", "--model", execModel, "-m", prompt];
        execFile("openclaw", args, { timeout: LIMITS.AGENT_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024, killSignal: "SIGKILL", env: { ...process.env, FORCE_COLOR: "0" } }, (err, stdout, stderr) => {
          if (err) return cb(new Error(`Exekuce selhala: ${err.message}`));
          try {
            const data = JSON.parse(stdout);
            const payloads = data.result?.payloads || [];
            cb(null, { text: payloads.map((p) => p.text || "").join("\n"), agent: task.name });
          } catch {
            cb(null, { text: (stdout || "").slice(0, 1000), agent: task.name });
          }
        });
      };
      selfCorrect(runAgentWithPrompt, projectDir, basePrompt)
        .then((result) => callback(null, { text: result.finalResult?.text || "", agent: task.name, success: result.success }))
        .catch((err) => callback(err));
    });
}

// ===== Orchestrace s ochranou proti loopu =====// ===== Orchestrace s ochranou proti loopu =====// ===== Orchestrace s ochranou proti loopu =====

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

// ====================================================================
// ORCHESTRATION — executeOneTask, executeAllTasks, queue
// Opraveno: chybějící oddělovač mezi fail (err) a success (null) cestou (viz Bug G)
// ====================================================================
function executeOneTask(projectName, callback) {
  let next;
  try {
    const check = canExecute();
    if (!check.ok) return callback(null, { success: false, error: check.reason });
    next = findNextTask(projectName);
    if (!next) return callback(null, { done: true, message: "Všechny tasky hotové (nebo stuck/vyčerpané)" });
  } catch (e) {
    return callback(null, { success: false, error: e.message });
  }

  const key = taskKey(projectName, next.task);
  executionState.totalExecutions++;
  executionState.lastExecutionAt = Date.now();
  boundedAdd(executionState.taskAttempts, key, (executionState.taskAttempts.get(key) || 0) + 1);

  console.log(`[Executor] Spouštím ${next.agent} na: "${next.task}" (pokus ${next.attempts + 1})`);

  runTaskAgent(next.agent, projectName, next.task, (err, result) => {
    if (err) {
      console.error(`[Executor] Selhalo: ${err.message}`);
      // Při chybě neoznačujeme jako stuck — ponecháme attempts, aby mohl být znovu zkoušen
      return callback(null, { success: false, task: next.task, agent: next.agent, error: err.message });
    }

    const marked = markTaskDone(projectName, next.file, next.task);
    if (marked) {
      // Úspěšně hotovo — vyčistí attempts, aby se task mohl znovu objevit pokud někdo rollbackne (viz Bug B)
      clearTaskAttempts(key);
    } else {
      // Task se nepodařilo odškrtnout → označ jako stuck, aby se nezacyklil
      boundedAdd(executionState.stuckTasks, key, true);
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

    let next;
    try {
      next = findNextTask(projectName);
    } catch (e) {
      return callback(null, { success: false, error: e.message, completed, failed, skipped });
    }
    if (!next) {
      return callback(null, { success: true, completed, failed, skipped, stopped: "Vše hotové" });
    }

    const key = taskKey(projectName, next.task);
    executionState.totalExecutions++;
    executionState.lastExecutionAt = Date.now();
    boundedAdd(executionState.taskAttempts, key, (executionState.taskAttempts.get(key) || 0) + 1);

    console.log(`[Executor] (run-all) Spouštím ${next.agent} na: "${next.task}"`);

    runTaskAgent(next.agent, projectName, next.task, (err, result) => {
      if (err) {
        const category = err.message?.includes("timeout") || err.message?.includes("Timeout")
          ? "timeout"
          : (err.message?.includes("OLLAMA") || err.message?.includes("Bad Gateway") ? "upstream" : "internal");
        failed.push({
          task: next.task,
          agent: next.agent,
          error: err.message,
          category,
          retryable: category !== "internal",
          at: new Date().toISOString(),
        });
      } else {
        const marked = markTaskDone(projectName, next.file, next.task);
        if (marked) {
          completed.push({ task: next.task, agent: next.agent });
          clearTaskAttempts(key);
        } else {
          boundedAdd(executionState.stuckTasks, key, true);
          skipped.push({ task: next.task, reason: "Nepodařilo se odškrtnout (stuck)" });
        }
      }
      setTimeout(processNext, LIMITS.COOLDOWN_MS);
    });
  };

  processNext();
}

function resetExecutionState() {
  executionState.totalExecutions = 0;
  executionState.taskAttempts.clear();
  executionState.stuckTasks.clear();
  executionState.lastExecutionAt = 0;
  executionState.queue = [];
  executionState.queueIndex.clear();
  executionState.current = null;
  executionState.active = [];
  executionState.pausedKeys.clear();
  executionState.queueLog = [];
  executionState.workerRunning = false;
  executionState.paused = false;
}

// Obohatí aktivní exekuce o elapsed time (pro UI transparentnost).
function withElapsed(active) {
  const now = Date.now();
  return active.map((a) => ({
    ...a,
    elapsedMs: a.startedAt ? now - new Date(a.startedAt).getTime() : 0,
  }));
}

function getExecutionState() {
  const perProject = {};
  for (const a of executionState.active) {
    perProject[a.project] = (perProject[a.project] || 0) + 1;
  }
  return {
    totalExecutions: executionState.totalExecutions,
    maxTotal: LIMITS.MAX_TOTAL_EXECUTIONS,
    stuckTasks: executionState.stuckTasks.size,
    activeAttempts: executionState.taskAttempts.size,
    slots: {
      total: LIMITS.MAX_CONCURRENT,
      used: executionState.active.length,
    },
    active: withElapsed(executionState.active), // běžící exekuce + elapsed
    perProject,                            // { projectName: pocetBezicich }
    runningAgents: executionState.active.length,
  };
}

// ===== QUEUE — zpracování tasků na pozadí =====

function enqueueProjectTasks(projectName) {
  try {
    assertSafeProject(projectName);
  } catch (e) {
    console.error(`[Executor] enqueue: ${e.message}`);
    return 0;
  }

  const projectDir = path.join(config.PROJECTS_DIR, projectName);
  const files = findRoadmapFiles(projectDir);
  if (files.length === 0) return 0;

  let added = 0;
  for (const file of files) {
    let content;
    try {
      content = fs.readFileSync(path.join(projectDir, file), "utf8");
    } catch {
      continue;
    }
    const parsed = parseRoadmap(content);
    for (const phase of parsed.phases) {
      for (const item of phase.items) {
        if (item.done) continue;

        const key = taskKey(projectName, item.text);
        if (executionState.stuckTasks.has(key)) continue;

        const attempts = executionState.taskAttempts.get(key) || 0;
        if (attempts > LIMITS.MAX_RETRIES_PER_TASK) continue;

        // O(1) detekce duplikátu přes Set (viz Bug D)
        if (executionState.queueIndex.has(key)) continue;

        executionState.queue.push({
          key,
          project: projectName,
          file,
          phase: phase.title,
          task: item.text,
          agent: routeTaskToAgent(item.text),
        });
        executionState.queueIndex.add(key);
        added++;
      }
    }
  }
  return added;
}

// ===== Adaptivní scheduler =====
// Rozhodne, jestli task MŮŽE běžet TEĎ, nebo má počkat (kvůli závislostem).
// Princip: tasky z jednoho projektu si konkurují na souborech → paralelně
// nedávají smysl (MAX_PER_PROJECT). Tasky ze stejné fáze jsou závislé →
// sekvenčně (MAX_PER_PHASE). Pozastavené tasky se nespouští.
function canRunNow(item, active) {
  if (executionState.pausedKeys.has(item.key)) return false;

  // Projekt limit — kolik tasků z toho projektu už běží
  const sameProject = active.filter((a) => a.project === item.project).length;
  if (sameProject >= LIMITS.MAX_PER_PROJECT) return false;

  // Fáze limit — kolik tasků ze stejné fáze už běží
  if (item.phase) {
    const samePhase = active.filter((a) => a.project === item.project && a.phase === item.phase).length;
    if (samePhase >= LIMITS.MAX_PER_PHASE) return false;
  }

  return true;
}

function startQueueWorker() {
  // Phase 1: paralelní pool — až MAX_CONCURRENT souběžných exekucí.
  // queue je sdílená, tasky se berou FIFO, ale běží paralelně (až 3 najednou).
  if (executionState.paused) return;

  const pump = () => {
    // Zastav, když je pause nebo není co dělat
    if (executionState.paused) {
      executionState.workerRunning = false;
      executionState.current = null;
      return;
    }

    // Spouští, dokud je volný slot A fronta má tasky.
    // Adaptivní: vybere task, který MŮŽE běžet (nekonkuruje na projekt/fázi,
    // není pozastavený). Závislé tasky zůstanou ve frontě — nespustí se
    // paralelně s předchůdcem, ale neblokují slot.
    while (executionState.active.length < LIMITS.MAX_CONCURRENT && executionState.queue.length > 0) {
      const check = canExecute();
      if (!check.ok) {
        setTimeout(pump, LIMITS.COOLDOWN_MS);
        return;
      }

      // Najdi první task, který může běžet teď (adaptivní výběr)
      let item = null;
      let idx = -1;
      for (let i = 0; i < executionState.queue.length; i++) {
        if (canRunNow(executionState.queue[i], executionState.active)) {
          item = executionState.queue[i];
          idx = i;
          break;
        }
      }
      // Žádný task nemůže běžet (všechny blokované závislostmi) → počkej na dokončení
      if (!item) {
        setTimeout(pump, LIMITS.COOLDOWN_MS);
        return;
      }
      executionState.queue.splice(idx, 1);
      executionState.queueIndex.delete(item.key);

      const model = modelForAgent(item.agent);
      const activeEntry = {
        key: item.key,
        project: item.project,
        agent: item.agent,
        task: item.task,
        model,
        startedAt: new Date().toISOString(),
        file: item.file,
        phase: item.phase,
      };
      executionState.active.push(activeEntry);
      executionState.current = activeEntry; // pro UI zpětnou kompatibilitu (první aktivní)
      executionState.totalExecutions++;
      executionState.lastExecutionAt = Date.now();
      boundedAdd(executionState.taskAttempts, item.key, (executionState.taskAttempts.get(item.key) || 0) + 1);

      console.log(`[Executor] (queue) Spouštím ${item.agent} (${model}) na: "${item.task}" [${executionState.active.length}/${LIMITS.MAX_CONCURRENT} slotů]`);

      runTaskAgent(item.agent, item.project, item.task, (err, result) => {
        // Odeber z active poolu
        const idx = executionState.active.indexOf(activeEntry);
        if (idx !== -1) executionState.active.splice(idx, 1);
        executionState.current = executionState.active[0] || null;

        if (err) {
          const category = err.message?.includes("timeout") || err.message?.includes("Timeout")
            ? "timeout"
            : (err.message?.includes("OLLAMA") || err.message?.includes("Bad Gateway") ? "upstream" : "internal");
          executionState.queueLog.unshift({
            task: item.task,
            agent: item.agent,
            status: "failed",
            error: err.message,
            category,
            retryable: category !== "internal",
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
            clearTaskAttempts(item.key); // viz Bug B
          } else {
            boundedAdd(executionState.stuckTasks, item.key, true);
            executionState.queueLog.unshift({
              task: item.task,
              agent: item.agent,
              status: "stuck",
              at: new Date().toISOString(),
            });
          }
        }
        if (executionState.queueLog.length > LIMITS.MAX_LOG_ENTRIES) {
          executionState.queueLog.length = LIMITS.MAX_LOG_ENTRIES;
        }

        // Když se uvolní slot, spustí další (po krátkém cooldownu)
        setTimeout(pump, LIMITS.COOLDOWN_MS);
      });
    }

    // Po skončení smyčky: pokud není nic aktivní ani ve frontě, worker je idle
    if (executionState.active.length === 0 && executionState.queue.length === 0) {
      executionState.workerRunning = false;
      executionState.current = null;
    } else {
      executionState.workerRunning = true;
    }
  };

  executionState.workerRunning = true;
  pump();
}

function getQueueState() {
  return {
    queueLength: executionState.queue.length,
    current: executionState.current,
    active: executionState.active,
    slots: {
      total: LIMITS.MAX_CONCURRENT,
      used: executionState.active.length,
    },
    log: executionState.queueLog,
    workerRunning: executionState.workerRunning,
    paused: executionState.paused,
    pausedProcesses: getPausedProcesses(),
  };
}

// ===== Per-process pause/resume (adaptivní řízení) =====
// Pozastaví JEDEN task/agenta (ne celou frontu). Task je "odpojen":
// - pokud běží → slot se uvolní (child agent doběhne na pozadí, výsledek se zahodí)
// - už nebude znovu spuštěn (key zůstává v pausedKeys)
// - task se NEodškrtne (práce není považována za hotovou)
function pauseProcess(key) {
  if (!key) return { success: false, error: "Chybí key" };

  executionState.pausedKeys.add(key);

  // Pokud běží, uvolni slot (odeber z active poolu)
  const idx = executionState.active.findIndex((a) => a.key === key);
  if (idx !== -1) {
    executionState.active.splice(idx, 1);
    executionState.current = executionState.active[0] || null;
  }

  // Odeber z fronty (pokud čekal)
  const qIdx = executionState.queue.findIndex((q) => q.key === key);
  if (qIdx !== -1) {
    executionState.queue.splice(qIdx, 1);
    executionState.queueIndex.delete(key);
  }

  executionState.queueLog.unshift({
    task: key.split("::").pop(),
    agent: "user",
    status: "paused",
    at: new Date().toISOString(),
  });

  return { success: true, pausedKeys: executionState.pausedKeys.size };
}

// Zruší pozastavení → task se může znovu spustit (pokud znovu enqueue)
function resumeProcess(key) {
  if (!key) return null;
  executionState.pausedKeys.delete(key);
  return { success: true, pausedKeys: executionState.pausedKeys.size };
}

// Pozastaví všechny procesy jednoho projektu (zkratka)
function pauseProject(projectName) {
  const keys = [];
  for (const a of executionState.active) {
    if (a.project === projectName) {
      keys.push(a.key);
      pauseProcess(a.key);
    }
  }
  for (const q of executionState.queue) {
    if (q.project === projectName && !executionState.pausedKeys.has(q.key)) {
      keys.push(q.key);
      pauseProcess(q.key);
    }
  }
  return { success: true, paused: keys.length, project: projectName };
}

function getPausedProcesses() {
  return Array.from(executionState.pausedKeys).map((k) => {
    const [project, ...rest] = k.split("::");
    return { key: k, project, task: rest.join("::") };
  });
}

function pauseQueue() {
  executionState.paused = true;
  return { paused: true };
}

function resumeQueue() {
  executionState.paused = false;
  startQueueWorker();
  return { paused: false };
}

module.exports = {
  routeTaskToAgent,
  modelForAgent,
  findNextTask,
  markTaskDone,
  findTaskLine,
  normalizeTaskText,
  runTaskAgent,
  executeOneTask,
  executeAllTasks,
  enqueueProjectTasks,
  startQueueWorker,
  getQueueState,
  pauseQueue,
  resumeQueue,
  pauseProcess,
  resumeProcess,
  pauseProject,
  getPausedProcesses,
  canRunNow,
  resetExecutionState,
  getExecutionState,
  LIMITS,
  AGENT_ROUTING,
};
