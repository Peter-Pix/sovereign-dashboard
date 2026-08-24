// ===== Model Store — runtime přepínání modelu (bez restartu serveru) =====
// Umožňuje měnit EXEC_MODEL a OLLAMA_MODEL za běhu.
// Persistuje do souboru, aby přežil restart serveru.

const fs = require("fs");
const path = require("path");
const config = require("../config.cjs");

const STATE_FILE = path.join(config.SOVEREIGN_DIR, "model-state.json");

// Výchozí modely z config.cjs
const DEFAULTS = {
  execModel: config.EXEC_MODEL,
  ollamaModel: config.OLLAMA_MODEL,
};

// Runtime state (in-memory, inicializovaný z defaults)
let state = { ...DEFAULTS };

// Načti persistovaný stav (pokud existuje)
try {
  if (fs.existsSync(STATE_FILE)) {
    const saved = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    if (saved.execModel) state.execModel = saved.execModel;
    if (saved.ollamaModel) state.ollamaModel = saved.ollamaModel;
  }
} catch (e) {
  console.warn("[ModelStore] Nelze načíst stav:", e.message);
}

// Persistuj stav
function persist() {
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.warn("[ModelStore] Nelze uložit stav:", e.message);
  }
}

// Validace model name — povolíme jen bezpečné znaky.
// Model name je jako "ollama/kimi-k2.7-code:cloud" — povolíme alfanumerické,
// tečky, podtržítka, pomlčky, dvojtečky a JEDEN lomítko (namespace/model).
// Zakážeme ".." (path traversal) a lomítka na začátku/konci.
const MODEL_NAME_RE = /^(?!.*\.\.)(?!.*\/\/)[A-Za-z0-9._:\/-]+$/;
function isValidModelName(name) {
  if (typeof name !== "string" || name.length === 0 || name.length > 200) return false;
  if (!MODEL_NAME_RE.test(name)) return false;
  // Zakázat lomítko na začátku/konci (absolutní cesta)
  if (name.startsWith("/") || name.endsWith("/")) return false;
  // Zakázat ".." (path traversal)
  if (name.includes("..")) return false;
  return true;
}

// Getter — vrací aktuální modely
function getModels() {
  return { ...state };
}

// Setter — aktualizuje jeden nebo oba modely
function setModels({ execModel, ollamaModel } = {}) {
  const changes = {};

  if (execModel !== undefined) {
    if (!isValidModelName(execModel)) {
      throw new Error(`Neplatný exec model: ${execModel}`);
    }
    state.execModel = execModel;
    changes.execModel = execModel;
  }

  if (ollamaModel !== undefined) {
    if (!isValidModelName(ollamaModel)) {
      throw new Error(`Neplatný ollama model: ${ollamaModel}`);
    }
    state.ollamaModel = ollamaModel;
    changes.ollamaModel = ollamaModel;
  }

  if (Object.keys(changes).length > 0) {
    persist();
  }
  return { ...state, changed: changes };
}

// Reset na výchozí
function resetModels() {
  state = { ...DEFAULTS };
  persist();
  return { ...state };
}

module.exports = {
  getModels,
  setModels,
  resetModels,
  isValidModelName,
  DEFAULTS,
};
