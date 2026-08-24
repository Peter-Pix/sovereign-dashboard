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
  execFile("openclaw", args, {
    timeout: 300000,
    maxBuffer: 10 * 1024 * 1024,
    killSignal: "SIGKILL",
  }, (err, stdout, stderr) => {
    if (finished) return;
    finished = true;
    clearTimeout(timeout);
    if (err) {
      console.error(`[Agent ${agentName}] Exekuce selhala: ${err.message}`);
      return callback(new Error(`Exekuce selhala: ${err.message} — ${stderr.slice(0, 300)}`));
    }
    try {
      const data = JSON.parse(stdout);
      const payloads = data.result?.payloads || [];
      const text = payloads.map((p) => p.text || "").join("\n");
      const usage = data.result?.meta?.agentMeta?.usage || {};
      callback(null, { text, tokens: usage.total || usage.input + usage.output || 0, agent: task.name });
    } catch {
      callback(null, { text: stdout.slice(0, 1000), tokens: 0, agent: task.name });
    }
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
  const { onStdout, onStderr, onError, onDone } = handlers;
  let finished = false;

  if (!task) {
    const err = new Error(`Neznámý agent: ${agentName}`);
    if (onError) onError(err);
    return { kill() {} };
  }

  const args = ["agent", "--agent", config.EXEC_AGENT, "--json", "--model", config.EXEC_MODEL, "-m", task.prompt];
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

module.exports = { AGENT_TASKS, runAgentExe, runAgentStream };
