// server/lib/mcpManager.cjs — Správa MCP serverů přes OpenClaw nativní registry.
//
// Agenti běží přes `openclaw agent` CLI, takže nejedeme vlastní MCP runtime.
// Místo toho spravujeme OpenClaw-managed `mcp.servers` registry:
//   - `openclaw mcp list`   → přehled
//   - `openclaw mcp show`   → detail
//   - `openclaw mcp set`    → přidat/upravit server (stdin-safe JSON)
//   - `openclaw mcp unset`  → smazat
//   - `openclaw mcp probe`  → ověřit připojení + listovat tools
//   - `openclaw mcp status` → status bez připojení
//
// Výhody: agenti (openclaw agent) automaticky vidí MCP tools,
// žádné duplicitní DB drivery, žádný vlastní state management.

const { execFile } = require("child_process");
const path = require("path");
const config = require("../config.cjs");

const OPENCLAW_BIN = process.env.OPENCLAW_BIN || "openclaw";
const OPENCLAW_CONFIG = process.env.OPENCLAW_CONFIG || path.join(process.env.HOME, ".openclaw/openclaw.json");

// ── Low-level exec wrapper ────────────────────────────────────────────
function runOpenclaw(args, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, OPENCLAW_CONFIG };
    execFile(OPENCLAW_BIN, args, {
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"], // stdin closed — CLI jinak čeká na input
      env,
    }, (err, stdout, stderr) => {
      if (err) {
        const msg = (stderr || stdout || err.message || "").trim();
        return reject(new Error(`openclaw ${args[0]}: ${msg}`));
      }
      resolve({ stdout, stderr });
    });
  });
}

// ── Validace názvu (path/CLI injection ochrana) ─────────────────────────
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
function isValidServerName(name) {
  return typeof name === "string" && NAME_RE.test(name);
}

// ── Krátkodobý cache (TLT) — openclaw CLI má ~3.5s studený start,
// takže opakované dotazy bez cache trvají 7s+. Cache drží list+status
// 30s, probe vždy čerstvý (žádná cache pro mutace).
const CACHE_TTL_MS = 30 * 1000;
const _cache = {
  list: { at: 0, value: null },
  status: { at: 0, value: null },
};
function cached(key, fn) {
  const now = Date.now();
  if (_cache[key] && _cache[key].value !== null && now - _cache[key].at < CACHE_TTL_MS) {
    return Promise.resolve(_cache[key].value);
  }
  return fn().then((val) => {
    _cache[key] = { at: Date.now(), value: val };
    return val;
  });
}
function invalidate() {
  _cache.list = { at: 0, value: null };
  _cache.status = { at: 0, value: null };
}

// ── Veřejné API ─────────────────────────────────────────────────────────

/** List všech MCP serverů (z OpenClaw registru). */
async function listServers() {
  return cached("list", () => {
    return execOpenclawJson(["mcp", "list", "--json"]).then(({ stdout }) => {
      if (!stdout || typeof stdout !== "object") return [];
      return Object.entries(stdout).map(([name, def]) => ({ name, ...def }));
    });
  });
}

/**
 * Detail serveru.
 * @returns {object|null} — server config nebo null když neexistuje.
 */
async function getServer(name) {
  if (!isValidServerName(name)) throw new Error(`Neplatný název serveru: ${name}`);
  try {
    const { stdout } = await execOpenclawJson(["mcp", "show", name, "--json"]);
    return stdout || null;
  } catch {
    return null;
  }
}

/**
 * Status serverů (bez připojení).
 * Vrací pole {name, configured, enabled, ok, transport, authStatus, ...}
 */
async function statusServers() {
  return cached("status", () => {
    return execOpenclawJson(["mcp", "status", "--json"])
      .then(({ stdout }) => stdout?.servers || [])
      .catch(() => []);
  });
}

/**
 * Přidá nebo upraví MCP server.
 * @param {string} name
 * @param {object} def — MCP server definition (command/args/env | url/transport/headers)
 */
async function upsertServer(name, def) {
  if (!isValidServerName(name)) throw new Error(`Neplatný název serveru: ${name}`);
  const json = JSON.stringify(def);
  const { stdout } = await execOpenclaw(["mcp", "set", name, json]);
  invalidate();
  return { ok: true, name, stdout };
}

/** Smaže MCP server. */
async function removeServer(name) {
  if (!isValidServerName(name)) throw new Error(`Neplatný název serveru: ${name}`);
  await execOpenclaw(["mcp", "unset", name]);
  invalidate();
  return { ok: true, name };
}

/**
 * Probe — live připojení + list tools.
 * Vrací {launch, tools, resources, prompts, diagnostics, toolList}
 */
async function probeServer(name, { timeoutMs = 30000 } = {}) {
  if (!isValidServerName(name)) throw new Error(`Neplatný název serveru: ${name}`);
  const { stdout } = await execOpenclawJson(["mcp", "probe", name, "--json"], timeoutMs);
  const server = stdout?.servers?.[name] || {};
  return {
    launch: server.launch || null,
    tools: server.tools || 0,
    resources: server.resources ?? false,
    prompts: server.prompts ?? false,
    toolList: Array.isArray(stdout?.tools) ? stdout.tools : (server.toolList || server.toolsList || []),
    diagnostics: stdout?.diagnostics || server.diagnostics || [],
  };
}

/**
 * Probe VŠECH serverů najednou (status + probe bez arg).
 */
async function probeAll({ timeoutMs = 45000 } = {}) {
  try {
    const { stdout } = await execOpenclawJson(["mcp", "probe", "--json"], timeoutMs);
    const servers = stdout?.servers || {};
    return {
      servers: Object.entries(servers).map(([name, info]) => ({ name, ...info })),
      tools: stdout?.tools || [],
      diagnostics: stdout?.diagnostics || [],
    };
  } catch (e) {
    return { error: e.message, servers: [], tools: [], diagnostics: [] };
  }
}

// ── Helper: execOpenclaw (raw, bez JSON parse) ────────────────────────────
function execOpenclaw(args, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    execFile(OPENCLAW_BIN, args, {
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, OPENCLAW_CONFIG },
    }, (err, stdout, stderr) => {
      if (err) {
        const msg = (stderr || stdout || err.message || "").trim();
        return reject(new Error(msg || `openclaw ${args[0]} selhal`));
      }
      resolve({ stdout, stderr });
    });
  });
}

// ── Helper: execOpenclawJson ────────────────────────────────────────────
function execOpenclawJson(args, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    execFile(OPENCLAW_BIN, args, {
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"], // stdin closed → - jinak hí na input
      env: { ...process.env, OPENCLAW_CONFIG },
    }, (err, stdout, stderr) => {
      if (err) {
        const msg = (stderr || stdout || err.message || "").trim();
        return reject(new Error(msg || `openclaw ${args[0]} selhal`));
      }
      // openclaw CLI s --json vrací JSON, ale někdy je doplněný o
      // user-facing output na stdout. Najdi první '{' a parsuj odtud.
      try {
        const idx = stdout.indexOf("{");
        const jsonStr = idx >= 0 ? stdout.slice(idx) : stdout;
        resolve({ stdout: JSON.parse(jsonStr) });
      } catch {
        resolve({ stdout: null });
      }
    });
  });
}

module.exports = {
  isValidServerName,
  listServers,
  getServer,
  statusServers,
  upsertServer,
  removeServer,
  probeServer,
  probeAll,
};
