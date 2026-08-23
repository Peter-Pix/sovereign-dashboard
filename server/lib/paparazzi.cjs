// ===== Paparazzi — LLM integrace a sběr dat =====
const fs = require("fs");
const path = require("path");
const config = require("../config.cjs");

const PAPARAZZI_REPORT_DIR = config.PAPARAZZI_REPORT_DIR;
const PAPARAZZI_REPORT_FILE = config.PAPARAZZI_REPORT_FILE;
const PAPARAZZI_HISTORY_FILE = config.PAPARAZZI_HISTORY_FILE;
const PAPARAZZI_INTERVAL_MS = config.PAPARAZZI_INTERVAL_MS;

async function callOllama(prompt, onToken = null) {
  const response = await fetch(config.OLLAMA_URL + "/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.OLLAMA_MODEL,
      prompt: prompt,
      stream: true, // Povolíme streamování
    }),
  });

  if (!response.ok) throw new Error(`Ollama API error: ${response.statusText}`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const json = JSON.parse(line);
        const token = json.response;
        fullText += token;
        if (onToken) onToken(token);
        if (json.done) break;
      } catch (e) {
        // Ignoruj nevalidní JSON řádky
      }
    }
  }
  return fullText;
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
