// Globální konfigurace serveru (gitignored tajemství se načítají v index.cjs přes .env loader).
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SOVEREIGN_DIR = path.resolve(ROOT, "../..", ".openclaw/workspace/sovereign-os");

module.exports = {
  PORT: 8891,
  PROJECTS_DIR: path.resolve(ROOT, ".."),
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
  EXEC_MODEL: process.env.SOVEREIGN_EXEC_MODEL || "ollama/minimax-m3:cloud",

  OLLAMA_URL: process.env.OLLAMA_URL || "http://localhost:11434",
  OLLAMA_MODEL: process.env.OLLAMA_MODEL || "minimax-m3:cloud",

  PAPARAZZI_INTERVAL_MS: 60 * 60 * 1000, // 60 min
  PAPARAZZI_CACHE_TTL_MS: 60 * 1000,     // 60 s
  PAPARAZZI_DATA_TTL_MS: 5 * 60 * 1000,    // 5 min

  PAPARAZZI_REPORT_DIR: path.join(SOVEREIGN_DIR, "reports/paparazzi"),
  PAPARAZZI_REPORT_FILE: path.join(SOVEREIGN_DIR, "reports/paparazzi", "latest.json"),
  PAPARAZZI_HISTORY_FILE: path.join(SOVEREIGN_DIR, "reports/paparazzi", "history.json"),
};
