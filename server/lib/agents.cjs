// ===== Reálná exekuce Sovereign agentů (přes OpenClaw agenta) =====
const { execFile, spawn } = require("child_process");
const config = require("../config.cjs");

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

Pitch musí být konkrétní pro TU firmu, ne generický. Mluv o jejich skutečném problému. Vyber leada s největším byznys potenciálem.

=== STRATEGICKÉ PLÁNOVÁNÍ ROADMAPY (planner režim) ===
Když dostaneš úkol "planner roadmap" pro konkrétní projekt:
1. Přečti <projekt>/planner/state.md (faktický stav od Archivista).
2. Navrhni roadmapu rozdělenou na MALÉ ATOMICKÉ TASKY (~5 min práce agenta).
3. Každý task musí být:
   - Krátký a jednoduchý (jeden konkrétní krok, ne celá funkce)
   - Detailně popsaný až k cíli (agent ví přesně, co má udělat a kdy je hotovo)
   - Samostatně odškrtnutelný (po dokončení je jasně hotový)
4. Strategicky: co je nejdůležitější pro byznys? Co odemkne další práci? (závislosti)
5. Marketingově chytře: co zlepší vnímání projektu (landing, OG image, SEO, dokumentace)?
6. Zapiš do <projekt>/ROADMAP.md ve standardním formátu:
   # Projekt: <název>
   ## Fáze A: <název fáze>
   - [ ] <task> (5 min)
   - [ ] <task> (5 min)
7. Fáze řaď logicky: Základ → Funkce → Marketing → Dokumentace.
8. NEZAPISUJ velké vágní tasky ("implementovat celou aplikaci") — vždy rozděl na malé kroky.

Tento režim je VÝSTUP pro Buildera — on bude tasky číst a odškrtávat.`,
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

Nezasahuj do cizích workspace agentů. Pracuj jen v tom projektu co audituješ.

=== STRATEGICKÝ AUDIT (planner režim) ===
Když dostaneš úkol "planner audit" pro konkrétní projekt:
1. Projdi projekt důkladně: README, struktura, git log, TODO/FIXME, package.json, hlavní zdrojáky.
2. Zjisti a zapiš FAKTICKÝ stav (bez plánování, jen data):
   - Co je hotové (funkce, které fungují)
   - Co chybí / je rozbité (neimplementované, chyby)
   - Technický dluh (TODO, FIXME, hardcoded, zastaralé)
   - Rizika a pozorování (bezpečnost, chybějící testy, špatná dokumentace)
3. Zapiš do souboru <projekt>/planner/state.md ve strukturovaném formátu:
   # Stav projektu: <název>
   ## Co je hotové ✅
   ## Co chybí / je rozbité ⚠️
   ## Technický dluh 🧹
   ## Pozorování / rizika 🔍
4. Buď 100% faktický — NEVYMYŠLEJ SI. Jen to, co reálně vidíš v kódu.
5. Aktualizuj manifest (status, summary, filesChanged).

Tento režim je VSTUP pro Strategistovo plánování — dodává mu přesný obraz stavu.`,
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
  builder: {
    name: "The Builder",
    workspace: "builder",
    prompt: `Jsi The Builder — Sovereign OS. Tvoje role: stavět produkční aplikace task po tasku z ROADMAP.md.

ÚKOL: Dokonči konkrétní build task v projektu. Pracuj POUZE v projektovém adresáři, který ti byl zadán. Nezasahuj do jiných projektů ani do sovereign-os workspace.

POSTUP:
1. Přečti ROADMAP.md a AGENTS.md v projektovém adresáři — pochop stack, strukturu a pravidla.
2. Dokonči konkrétně zadaný task. Proveď skutečné změny (vytvoř soubory, napiš kód, uprav config).
3. Postupuj podle stacku: Next.js + TypeScript + PostgreSQL + ORM + Tailwind/shadcn + Zod + testy.
4. Po změnách spusť testy (npm test / node --test / pnpm test podle package.json). Pokud failují, oprav a znovu. Max 3 pokusy.
5. Commitni změny s konvenčním commit message (feat/fix/refactor/chore).
6. Zapiš shrnutí do /Users/petrpiskacek/.openclaw/workspace/sovereign-os/workspaces/builder/roadmap-task-{project}.json (json: task, done, filesChanged, summary, testResult).

PRAVIDLA:
- Nikdy floating point pro peníze (používej integer minor units).
- Nikdy nevěř client-side payment state — jen server-side webhook potvrzení.
- AI nikdy autonomně nepřesouvá peníze.
- Každá autorizace server-side, ownership checks, rate limiting, audit log.
- AI výstupy validuj Zod schématem.
- Nevytvářej dead code ani abstrakce bez potřeby.
- Nikdy nevkládej secret do source code (použij .env, gitignored).
- Dokumentuj důležitá rozhodnutí do docs/.`,
  },
};


// ANSI strip + chunk buffering pro clean stream
function stripAnsi(raw) {
  if (!raw) return "";
  let text = raw.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
  text = text.replace(/[⠋⠙⠹⠸⠼⠴⠦⠧⸩✔✓⟳↻⚡🌐📡💬📝🔍✅❌✗✘×+\-*/\\|‣▪▸▸►]/g, "");
  text = text.replace(/^[\s⠋⠙⠹⠸⠼⠴⠦⠧⸩✔✓⟳\->\\|\\/]+$/gm, "");
  text = text.split("\n").map(l => l.trimEnd()).join("\n").trim();
  return text;
}

// Spustí exekuci agenta přes OpenClaw agenta (main) — klasický buffer-based režim
function runAgentExe(agentName, callback) {
  const task = AGENT_TASKS[agentName];
  if (!task) {
    return callback(new Error(`Neznámý agent: ${agentName}`));
  }

  let finished = false;
  const timeout = setTimeout(() => {
    if (!finished) {
      finished = true;
      callback(new Error("Agent exekuce timeout (5 min)"));
    }
  }, 300000);

  const args = ["agent", "--agent", config.EXEC_AGENT, "--json", "--model", config.EXEC_MODEL, "-m", task.prompt];

  // Retry na transientní SQLite lock (gateway zrovna zapisuje). Nečekáme
  // na 5-min timeout — zkusíme párkrát s krátkým backoffem a pak failneme.
  execOpenclawWithRetry(args, { timeoutMs: 300000, attempts: 3, baseDelayMs: 2000 }).then((res) => {
    if (finished) return;
    finished = true;
    clearTimeout(timeout);
    if (res.error) {
      const e = res.error;
      const snippet = (e._stderr || "").slice(0, 300);
      console.error(`[Agent ${agentName}] Exekuce selhala: ${e.message}`);
      return callback(new Error(`Exekuce selhala: ${e.message}${snippet ? " — " + snippet.slice(0, 300) : ""}`));
    }
    const { stdout } = res;
    try {
      const data = JSON.parse(stdout);
      const payloads = data.result?.payloads || [];
      const text = payloads.map((p) => p.text || "").join("\n");
      const usage = data.result?.meta?.agentMeta?.usage || {};
      callback(null, { text, tokens: usage.total || usage.input + usage.output || 0, agent: task.name });
    } catch {
      callback(null, { text: stdout.slice(0, 1000), tokens: 0, agent: task.name });
    }
  }).catch((err) => {
    if (finished) return;
    finished = true;
    clearTimeout(timeout);
    console.error(`[Agent ${agentName}] Retry selhala: ${err.message}`);
    callback(new Error(`Exekuce selhala: ${err.message}`));
  });
}

/**
 * Stream režim — vrací stdout/stderr v reálném čase přes callbacky.
 * @param {string} agentName
 * @param {{ onStdout?: (chunk: string) => void, onStderr?: (chunk: string) => void, onError?: (err: Error) => void, onDone?: (result: object) => void }} handlers
 * @returns {{ kill: () => void, pid?: number }} — handle pro ukončení
 */
function runAgentStream(agentName, handlers = {}) {
  const task = AGENT_TASKS[agentName];
  const { onStdout, onStderr, onError, onDone, taskText, projectName } = handlers;
  let finished = false;

  if (!task) {
    const err = new Error(`Neznámý agent: ${agentName}`);
    if (onError) onError(err);
    return { kill() {} };
  }

  // Pokud je zadán taskText (planner režim), zabal agentův prompt do kontextu projektu.
  // Jinak použij čistý agentův prompt (stávající chování).
  const prompt = taskText
    ? `Jsi ${task.name} — Sovereign OS. ${projectName ? `Pracuješ na projektu "${projectName}".` : ""}

ÚKOL: ${taskText}

${task.prompt}`
    : task.prompt;

  const args = ["agent", "--agent", config.EXEC_AGENT, "--json", "--model", config.EXEC_MODEL, "-m", prompt];
  const child = spawn("openclaw", args, {
    timeout: 300000,
    killSignal: "SIGKILL",
  });

  const cleanup = () => {
    if (finished) return;
    finished = true;
    try { child.kill("SIGKILL"); } catch {}
  };

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");

  let stdoutBuffer = "";

  // Buffer pro řádkové dělení
  let lineBuffer = "";

  child.stdout.on("data", (rawChunk) => {
    const chunk = stripAnsi(rawChunk);
    stdoutBuffer += chunk;

    if (!chunk || !onStdout) return;

    // Pokusíme se flushnout kompletní řádky z bufferu
    const parts = chunk.split("\n");
    const isPartial = chunk.endsWith("\n") === false && !rawChunk.endsWith("\n");

    // Všechny kromě posledního (pokud není kompletní) jsou kompletní řádky
    const complete = isPartial ? parts.slice(0, -1) : parts;

    for (const line of complete) {
      const flushed = lineBuffer + line;
      if (flushed) onStdout(flushed + "\n");
      lineBuffer = "";
    }

    // Poslední část (nekompletní řádek) jde do bufferu
    if (isPartial && parts.length > 0) {
      lineBuffer += parts[parts.length - 1];
    } else if (!chunk.includes("\n") && chunk) {
      // Jeden celý chunk bez nového řádku
      lineBuffer += chunk;
      // Flush pokud je buffer příliš velký (žádný newline za 500 znaků)
      if (lineBuffer.length > 500) {
        onStdout(lineBuffer);
        lineBuffer = "";
      }
    }
  });

  child.stderr.on("data", (chunk) => {
    if (onStderr) onStderr(chunk);
  });

  child.on("error", (err) => {
    if (finished) return;
    finished = true;
    if (onError) onError(err);
  });

  child.on("exit", (code, signal) => {
    if (finished) return;
    finished = true;

    if (code !== 0 && code !== null) {
      const err = new Error(`Agent exited with code ${code}`);
      if (onError) return onError(err);
    }

    // Parsování JSON výstupu
    try {
      const data = JSON.parse(stdoutBuffer);
      const payloads = data.result?.payloads || [];
      const text = payloads.map((p) => p.text || "").join("\n");
      const usage = data.result?.meta?.agentMeta?.usage || {};
      if (onDone) onDone({ text, tokens: usage.total || usage.input + usage.output || 0, agent: task.name, code, signal });
    } catch {
      if (onDone) onDone({ text: stdoutBuffer.slice(0, 1000), tokens: 0, agent: task.name, code, signal });
    }
  });

  // Safety timeout
  const timeout = setTimeout(() => {
    if (finished) return;
    cleanup();
    if (onError) onError(new Error("Agent exekuce timeout (5 min)"));
  }, 300000);

  child.on("exit", () => clearTimeout(timeout));

  return {
    kill: cleanup,
    pid: child.pid,
  };
}


// ---------------------------------------------------------------------------
// Retry na transientní SQLite lock chybu (gateway zapisuje do state store).
// OpenClaw má tvrdý SQLite busy_timeout 5s — když gateway právě zapisuje
// (běžící tasky/session), externí `openclaw agent` dostane
// "database is locked" / "transaction lock wait failed". To je DOČASNÉ —
// jakmile gateway zápis dokončí, lock se uvolní. Místo okamžitého 500
// zkusíme párkrát znovu s krátkým backoffem.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isTransientSqliteLock = (msg) => {
  if (!msg) return false;
  return /database is locked|transaction lock wait failed|SQLITE_BUSY|lock wait/i.test(msg);
};

async function execOpenclawWithRetry(args, { timeoutMs = 300000, attempts = 3, baseDelayMs = 2000 } = {}) {
  const { execFile } = require("child_process");
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const { stdout, stderr } = await new Promise((resolve, reject) => {
        execFile("openclaw", args, {
          timeout: timeoutMs,
          maxBuffer: 10 * 1024 * 1024,
          killSignal: "SIGKILL",
          env: { ...process.env, FORCE_COLOR: "0" },
        }, (err, stdout, stderr) => {
          if (err) return reject(Object.assign(err, { _stderr: stderr || "" }));
          resolve({ stdout, stderr });
        });
      });
      return { stdout, stderr };
    } catch (err) {
      lastErr = err;
      const msg = `${err.message} ${err._stderr || ""}`;
      if (!isTransientSqliteLock(msg)) return { error: err }; // netranzitivní → vrať hned
      if (i < attempts - 1) {
        console.warn(`[Agent] SQLite lock (pokus ${i + 1}/${attempts}), retry za ${baseDelayMs}ms`);
        await sleep(baseDelayMs * (i + 1)); // 2s, 4s, 6s
      }
    }
  }
  return { error: lastErr };
}

module.exports = { AGENT_TASKS, runAgentExe, runAgentStream, execOpenclawWithRetry, isTransientSqliteLock, sleep };


