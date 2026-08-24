// ===== Centrální error logger s persistencí =====
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const config = require("../config.cjs");

// Log dir — vedle SOVEREIGN_DIR
const LOG_DIR = path.join(config.SOVEREIGN_DIR, "logs");
const ERROR_LOG_FILE = path.join(LOG_DIR, "errors.jsonl");
const MAX_LOG_LINES = 1000;

// Inicializuj dir (best-effort)
try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch {}

// Kategorie chyb (podle toho se řídí severity + retry logika)
const ERROR_CATEGORIES = {
  VALIDATION: "validation",      // 400 — chyba v requestu, ne opakovat
  AUTH: "auth",                  // 401/403 — chyba v requestu
  NOT_FOUND: "not_found",        // 404 — zdroj neexistuje
  RATE_LIMIT: "rate_limit",      // 429 — backoff a retry
  UPSTREAM: "upstream",          // 502 — Ollama/openclaw selhal, retryable
  INTERNAL: "internal",          // 500 — interní bug, loguj a neopakuj
  TIMEOUT: "timeout",            // 504 — retry s delším limitem
};

const SEVERITY = {
  validation: "info",
  auth: "warn",
  not_found: "info",
  rate_limit: "warn",
  upstream: "error",
  internal: "error",
  timeout: "error",
};

// HTTP status → kategorie
const STATUS_TO_CATEGORY = {
  400: ERROR_CATEGORIES.VALIDATION,
  401: ERROR_CATEGORIES.AUTH,
  403: ERROR_CATEGORIES.AUTH,
  404: ERROR_CATEGORIES.NOT_FOUND,
  429: ERROR_CATEGORIES.RATE_LIMIT,
  500: ERROR_CATEGORIES.INTERNAL,
  502: ERROR_CATEGORIES.UPSTREAM,
  503: ERROR_CATEGORIES.UPSTREAM,
  504: ERROR_CATEGORIES.TIMEOUT,
};

function categorize(statusOrError) {
  if (typeof statusOrError === "number") {
    return STATUS_TO_CATEGORY[statusOrError] || ERROR_CATEGORIES.INTERNAL;
  }
  // Error object — heuristika z kódu
  const code = statusOrError?.code || "";
  if (code === "ENOENT" || code === "ENOTDIR") return ERROR_CATEGORIES.NOT_FOUND;
  if (code === "ETIMEDOUT" || code === "TIMEOUT") return ERROR_CATEGORIES.TIMEOUT;
  if (code === "ECONNREFUSED" || code === "ECONNRESET") return ERROR_CATEGORIES.UPSTREAM;
  return ERROR_CATEGORIES.INTERNAL;
}

function isRetryable(category) {
  return category === ERROR_CATEGORIES.RATE_LIMIT
      || category === ERROR_CATEGORIES.UPSTREAM
      || category === ERROR_CATEGORIES.TIMEOUT;
}

// Sanitizuj error — odstraň citlivé údaje
function sanitize(err) {
  if (!err) return null;
  if (typeof err === "string") return { message: err.slice(0, 500) };
  return {
    name: err.name,
    message: (err.message || "").slice(0, 500),
    code: err.code,
    // Stack jen v dev módu — v produkci je to spam
    stack: process.env.NODE_ENV === "production"
      ? (err.stack || "").split("\n").slice(0, 5).join(" | ")
      : err.stack,
  };
}

// Vygeneruj correlation ID (8 znaků z nano-style alphabetu)
function newCorrelationId() {
  return crypto.randomBytes(6).toString("base64url");
}

// Append-only zápis do JSONL souboru (s bounded size)
function appendToFile(entry) {
  try {
    fs.appendFileSync(ERROR_LOG_FILE, JSON.stringify(entry) + "\n");

    // Rotace — pokud je soubor moc velký, přejmenuj a začni nový
    const stats = fs.statSync(ERROR_LOG_FILE);
    if (stats.size > MAX_LOG_LINES * 500) {
      const rotated = path.join(LOG_DIR, `errors-${Date.now()}.jsonl`);
      fs.renameSync(ERROR_LOG_FILE, rotated);
    }
  } catch (e) {
    // Poslední možnost — alespoň console
    console.error("[Logger] Failed to write error log:", e.message);
  }
}

// Hlavní API: logError
function logError({ err, req, category, status, extra = {} }) {
  const cat = category || categorize(err?.code ? err : (status || 500));
  const severity = SEVERITY[cat] || "error";
  const entry = {
    timestamp: new Date().toISOString(),
    severity,
    category: cat,
    retryable: isRetryable(cat),
    status,
    correlationId: req?.correlationId,
    method: req?.method,
    url: req?.url,
    ip: req?.ip,
    project: req?.params?.project || req?.params?.name,
    error: sanitize(err),
    ...extra,
  };

  appendToFile(entry);

  // Také stderr output (pro lokální debugging)
  const method = req?.method ? `[${req.method} ${req.url}]` : "";
  const prefix = `[${entry.correlationId || "—"}] ${method}`;
  if (severity === "error") {
    console.error(`${prefix} ${cat}:`, err?.message || status);
  } else if (severity === "warn") {
    console.warn(`${prefix} ${cat}:`, err?.message || status);
  }

  return entry;
}

// Express error middleware (musí mít 4 args!)
function errorMiddleware(err, req, res, next) {
  if (res.headersSent) {
    // Hlavičky už odeslány → nelze měnit response, jen abort
    console.error(`[${req.correlationId || "—"}] Headers already sent, aborting connection`);
    return req.socket?.destroy?.();
  }

  const status = err.status || err.statusCode || 500;
  const cat = categorize(status);
  const entry = logError({ err, req, status, extra: { route: req.route?.path } });

  // Pro klienta: bez stacku (security)
  const body = {
    error: err.expose ? err.message : (status >= 500 ? "Internal Server Error" : (err.message || "Error")),
    correlationId: entry.correlationId,
    category: cat,
    retryable: entry.retryable,
  };
  // Pokud je to 4xx, přidej detaily
  if (status >= 400 && status < 500 && err.details) {
    body.details = err.details;
  }

  res.status(status).json(body);
}

// Wrapper pro async route handlers — chytá thrown/rejected errory
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Třída pro vytváření chyb s status kódem a expose flag
class HttpError extends Error {
  constructor(status, message, { details = null, expose = true } = {}) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.expose = expose && status < 500; // 5xx nikdy neexponuj
    this.details = details;
  }
}

module.exports = {
  ERROR_CATEGORIES,
  STATUS_TO_CATEGORY,
  categorize,
  isRetryable,
  sanitize,
  newCorrelationId,
  logError,
  errorMiddleware,
  asyncHandler,
  HttpError,
};
