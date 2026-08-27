// ===== Paparazzi — LLM integrace a sběr dat =====
const fs = require("fs");
const path = require("path");
const config = require("../config.cjs");

const PAPARAZZI_REPORT_DIR = config.PAPARAZZI_REPORT_DIR;
const PAPARAZZI_REPORT_FILE = config.PAPARAZZI_REPORT_FILE;
const PAPARAZZI_HISTORY_FILE = config.PAPARAZZI_HISTORY_FILE;
const PAPARAZZI_INTERVAL_MS = config.PAPARAZZI_INTERVAL_MS;

// ===== callOllama — podporuje LOKÁLNÍ i CLOUD modely =====
// Cloud model (obsahuje ":cloud" v názvu) se volá na https://ollama.com/api/chat
// s Bearer tokenem (OLLAMA_API_KEY). Lokální model na localhost:11434/api/generate.
// Fix: dřív se cloud model volal na lokální endpoint → "Model error".
// Sdílený stream parser pro Ollama (NDJSON). Vrací slepený text.
// extractToken(json) — jak vytáhnout token z řádku (liší se cloud vs local).
async function streamTokens(response, extractToken, onToken) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  let done = false;
  while (!done) {
    const { done: streamDone, value } = await reader.read();
    if (streamDone) break;
    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const json = JSON.parse(line);
        const token = extractToken(json);
        if (typeof token === "string" && token) {
          fullText += token;
          if (onToken) onToken(token);
        }
        // done:true → ukonči i vnější smyčku (dřív se break týkal jen vnitřní for)
        if (json.done) { done = true; break; }
      } catch (e) {
        // ignoruj nevalidní JSON
      }
    }
  }
  return fullText;
}

// Timeout pro Ollama call — pokud model visí (gateway draining, síť, OOM),
// SSE spojení by jinak zůstalo otevřené 15+ min a přispívalo k OOM killům.
// Default 120s je dost pro report (~30s), ale chrání před nekonečným čekáním.
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS) || 120000;

async function callOllama(prompt, onToken = null) {
  const model = config.OLLAMA_MODEL;
  const isCloud = String(model).includes(":cloud");

  // AbortController — přeruší fetch i stream po timeoutu
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
  const cleanup = () => clearTimeout(timeout);

  try {
    if (isCloud) {
      // --- Cloud model: https://ollama.com/api/chat ---
      const apiKey = process.env.OLLAMA_API_KEY || process.env.OLLAMA_CLOUD_API_KEY;
      if (!apiKey) {
        throw new Error("Cloud model vyžaduje OLLAMA_API_KEY (nenastavený v .env)");
      }
      const baseUrl = (process.env.OLLAMA_CLOUD_URL || "https://ollama.com").replace(/\/$/, "");
      const response = await fetch(baseUrl + "/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: "user", content: prompt }],
          stream: true,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`Ollama Cloud error: ${response.status} ${response.statusText}${body ? ` — ${body.slice(0, 200)}` : ""}`);
      }
      // /api/chat stream: { message: { role, content } }
      return await streamTokens(response, (json) => json.message?.content ?? "", onToken);
    }

    // --- Lokální model: localhost/api/generate ---
    const response = await fetch(config.OLLAMA_URL + "/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model,
        prompt: prompt,
        stream: true,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}${body ? ` — ${body.slice(0, 200)}` : ""}`);
    }
    // /api/generate stream: { response: "..." } (fallback identity_layer_json)
    return await streamTokens(response, (json) => json.response ?? json.identity_layer_json ?? "", onToken);
  } catch (err) {
    // Abort → jasná chyba místo nekonečného čekání
    if (err.name === "AbortError") {
      throw new Error(`Ollama call timeout (${OLLAMA_TIMEOUT_MS / 1000}s) — model ${model} visel`);
    }
    throw err;
  } finally {
    cleanup();
  }
}

function buildPaparazziPrompt(system, summary) {
  return `You are "Paparazzi", a cynical but brilliant system manager and observer. 
Your job is to analyze the current state of the ecosystem and write a brief, sharp, 
street-style report for the owner (Peter). Use bolding, lists, and a bit of irony.
Keep it concise but concrete.

SYSTEM STATE:
${JSON.stringify(system, null, 2)}

ECOSYSTEM SUMMARY:
${JSON.stringify(summary, null, 2)}

Write the report in Czech. Start with "Yo Peter, tady Paparazzi..."`;
}

async function gatherAllData() {
  const { SKIP_DIRS, collectProjectData, summarizeProjects } = require("./projects.cjs");
  const { collectSystemData } = require("./system.cjs");
  const { PROJECTS_DIR } = require("../config.cjs");

  const dirs = fs.readdirSync(PROJECTS_DIR).filter((d) => {
    if (SKIP_DIRS.test(d)) return false;
    try { return fs.statSync(path.join(PROJECTS_DIR, d)).isDirectory() && fs.existsSync(path.join(PROJECTS_DIR, d, ".git")); }
    catch { return false; }
  });

  const results = await Promise.allSettled(dirs.map((d) => collectProjectData(d)));
  const projects = results.filter((r) => r.status === "fulfilled" && r.value).map((r) => r.value);
  const summary = summarizeProjects(projects);
  const system = await collectSystemData();
  return { projects, summary, system };
}

module.exports = {
  buildPaparazziPrompt,
  callOllama,
  gatherAllData,
  PAPARAZZI_REPORT_DIR,
  PAPARAZZI_REPORT_FILE,
  PAPARAZZI_HISTORY_FILE,
  PAPARAZZI_INTERVAL_MS,
};
