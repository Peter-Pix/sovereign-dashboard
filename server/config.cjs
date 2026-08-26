// Globální konfigurace serveru (gitignored tajemství se načítají v index.cjs přes .env loader).
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SOVEREIGN_DIR = path.resolve(ROOT, "../..", ".openclaw/workspace/sovereign-os");

// Výchozí modely (mohou být přepsány runtime přes modelStore)
const DEFAULT_EXEC_MODEL = process.env.SOVEREIGN_EXEC_MODEL || "ollama/deepseek-v4-flash:cloud"; // Phase 1: vše na deepseek
const DEFAULT_OLLAMA_MODEL = process.env.OLLAMA_MODEL || "minimax-m3:cloud";

module.exports = {
  PORT: 8891,
  PROJECTS_DIR: path.resolve(ROOT, ".."),
  // Projekty VYŘAZENÉ z exekuce roadmap (srdněle / kam nechceme jít).
  // Čárkou oddělený seznam — neplýtvá tokeny na nesmysly.
  get SKIP_PROJECTS() {
    const raw = process.env.SOVEREIGN_SKIP_PROJECTS || "";
    return raw.split(",").map((x) => x.trim()).filter(Boolean);
  },
  SOVEREIGN_DIR,
  PAPARAZZI_DIR: path.join(process.env.HOME, "Library/Mobile Documents/com~apple~CloudDocs/Paparazzi"),

  ALLOWED_ORIGINS: [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:3205",
    "http://127.0.0.1:3205",
    "http://localhost:8891",
    "http://127.0.0.1:8891",
  ],

  SAFE_NAME_RE: /^[A-Za-z0-9._-]+$/,
  MAX_NAME_LEN: 128,

  EXEC_AGENT: process.env.SOVEREIGN_EXEC_AGENT || "main",
  // Max souběžných exekucí v queue workeru (paralelní pool)
  EXEC_CONCURRENCY: Number(process.env.EXEC_CONCURRENCY) || 3,

  // Výchozí hodnoty — runtime přepisuje přes modelStore
  DEFAULT_EXEC_MODEL,
  DEFAULT_OLLAMA_MODEL,

  // Gettery — vždy vrací aktuální (runtime) hodnotu.
  // Lazy require uvnitř getteru (ne na top-level) zabrání circular dependency
  // mezi config.cjs a modelStore.cjs (modelStore require config.cjs).
  get EXEC_MODEL() {
    try {
      // Vyhni se circular dependency: modelStore.cjs require config.cjs,
      // takže tady nemůžeme require modelStore na top-level.
      // Místo toho čteme přímo ze state souboru (fallback) nebo z env.
      const fs = require("fs");
      const path = require("path");
      const stateFile = path.join(this.SOVEREIGN_DIR, "model-state.json");
      if (fs.existsSync(stateFile)) {
        const saved = JSON.parse(fs.readFileSync(stateFile, "utf8"));
        if (saved.execModel) return saved.execModel;
      }
      return DEFAULT_EXEC_MODEL;
    } catch {
      return DEFAULT_EXEC_MODEL;
    }
  },
  get OLLAMA_MODEL() {
    try {
      const fs = require("fs");
      const path = require("path");
      const stateFile = path.join(this.SOVEREIGN_DIR, "model-state.json");
      if (fs.existsSync(stateFile)) {
        const saved = JSON.parse(fs.readFileSync(stateFile, "utf8"));
        if (saved.ollamaModel) return saved.ollamaModel;
      }
      return DEFAULT_OLLAMA_MODEL;
    } catch {
      return DEFAULT_OLLAMA_MODEL;
    }
  },

  OLLAMA_URL: process.env.OLLAMA_URL || "http://localhost:11434",

  PAPARAZZI_INTERVAL_MS: 60 * 60 * 1000, // 60 min
  PAPARAZZI_CACHE_TTL_MS: 60 * 1000,     // 60 s
  PAPARAZZI_DATA_TTL_MS: 5 * 60 * 1000,    // 5 min

  PAPARAZZI_REPORT_DIR: path.join(SOVEREIGN_DIR, "reports/paparazzi"),
  PAPARAZZI_REPORT_FILE: path.join(SOVEREIGN_DIR, "reports/paparazzi", "latest.json"),
  PAPARAZZI_HISTORY_FILE: path.join(SOVEREIGN_DIR, "reports/paparazzi", "history.json"),
};
