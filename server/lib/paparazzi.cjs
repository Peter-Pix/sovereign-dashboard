// ===== Paparazzi Manažer Report (Ollama) =====
// Volá Ollama (lokální server :11434, cloud model) s reálnými daty o systému a projektech.
const fs = require("fs");
const path = require("path");
const config = require("../config.cjs");
const { fmtBytes } = require("./system.cjs");

const PAPARAZZI_REPORT_DIR = path.join(config.SOVEREIGN_DIR, "workspaces/paparazzi");
const PAPARAZZI_REPORT_FILE = path.join(PAPARAZZI_REPORT_DIR, "paparazzi-report.json");
const PAPARAZZI_HISTORY_FILE = path.join(PAPARAZZI_REPORT_DIR, "paparazzi-history.json");
const PAPARAZZI_INTERVAL_MS = config.PAPARAZZI_INTERVAL_MS;

// Paparazzi persona — natvrdo definovaná.
const PAPARAZZI_PERSONA = `Jsi Paparazzi — "The Big Eye" Sovereign OS. Sběráš data o systému a projektech a reportuješ manažerovi (Peterovi).

Tvůj hlas: přímý, drzý, ale inteligentní. Mluvíš jako rapper, ne jako korporát. Krátké, jasné věty. Bez zbytečného balastu. Sebevědomý, občas sarkastický, ale vždy faktický. Žádný corporate jargon, žádné "synergie" a "best practices".`;

function buildPaparazziPrompt(system, summary) {
  const sys = system || {};
  const cpu = sys.cpu || {};
  const mem = sys.memory || {};
  const disk = sys.disk || {};
  const procs = (sys.processes || []).slice(0, 3).map((p) => `${p.cmd} (${p.cpu}%)`).join(", ");
  const counts = summary?.counts || {};

  let prevContext = "";
  try {
    const prev = JSON.parse(fs.readFileSync(PAPARAZZI_REPORT_FILE, "utf8"));
    const prevCounts = prev.summary?.counts || {};
    const changes = [];
    if (prevCounts.dirty !== undefined && prevCounts.dirty !== counts.dirty) {
      changes.push(`dirty working tree: ${prevCounts.dirty} → ${counts.dirty}`);
    }
    if (prevCounts.hot !== undefined && prevCounts.hot !== counts.hot) {
      changes.push(`žhavé projekty: ${prevCounts.hot} → ${counts.hot}`);
    }
    if (prev.system?.cpu?.pct !== undefined && prev.system.cpu.pct !== cpu.pct) {
      changes.push(`CPU: ${prev.system.cpu.pct}% → ${cpu.pct}%`);
    }
    if (prev.system?.memory?.pct !== undefined && prev.system.memory.pct !== mem.pct) {
      changes.push(`RAM: ${prev.system.memory.pct}% → ${mem.pct}%`);
    }
    prevContext = changes.length > 0
      ? `\n## ZMĚNY OD MINULÉHO REPORTU\n${changes.join("\n")}`
      : "\n## ZMĚNY OD MINULÉHO REPORTU\nŽádné výrazné změny — čísla jsou stejná. Vysvětli, proč se nic nezměnilo.";
  } catch {}

  const dataBlock = `
## AKTUÁLNÍ DATA (reálná, z monitoringu)
SYSTÉM:
- CPU: ${cpu.pct || 0}% (load ${cpu.load1 || 0}/${cpu.load5 || 0}, ${cpu.cores || "?"} jader)
- RAM: ${mem.pct || 0}% využito (${fmtBytes(mem.used)} z ${fmtBytes(mem.total)})
- Disk: ${disk.pct || 0}% (${disk.used || "?"} / ${disk.total || "?"})
- Top procesy: ${procs || "žádné"}
- Uptime: ${sys.uptime || "?"}

PROJEKTY:
- Celkem: ${counts.total || 0}
- Žhavé: ${counts.hot || 0}, Aktivní: ${counts.active || 0}, Pomalé: ${counts.slow || 0}, Idle: ${counts.idle || 0}
- Dirty working tree: ${counts.dirty || 0}
- Bez README: ${counts.undocumented || 0}
${prevContext}
`;

  return `${PAPARAZZI_PERSONA}\n\n${dataBlock}\n\nNapiš krátkou zprávu manažerovi (Peterovi) o stavu systému a projektů. Mluv jako Paparazzi — lidsky, ne korporátně. Struktura: 1) Co se děje (stav), 2) Co je problém (pokud je), 3) Co navrhuješ. Když se čísla nezměnily, vysvětli proč. Buď konkrétní a faktický. Max 150 slov.`;
}

// Volá Ollama — cloud model přes lokální server.
async function callOllama(prompt) {
  const res = await fetch(`${config.OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.OLLAMA_MODEL, prompt, stream: false }),
  });
  if (!res.ok) {
    throw new Error(`Ollama HTTP ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return data.response || "";
}

module.exports = {
  buildPaparazziPrompt,
  callOllama,
  PAPARAZZI_REPORT_DIR,
  PAPARAZZI_REPORT_FILE,
  PAPARAZZI_HISTORY_FILE,
  PAPARAZZI_INTERVAL_MS,
};
