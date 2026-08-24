// ===== Rate Limiter — ochrana před infinite loopy a budget overflow =====
// Dva režimy:
// 1. Token budget per agent (cost-based)
// 2. Request rate limit per route/IP (request-based)

const fs = require("fs");
const path = require("path");
const config = require("../config.cjs");

const STATE_FILE = path.join(config.SOVEREIGN_DIR, "rate-limiter-state.json");

// Default limity: [limit, windowMs]
// - limit = max tokenů za okno (pro token budget)
// - limit = max requestů za okno (pro rate limit)
const DEFAULTS = {
  // Token budget per agent za 24h
  agentBudget: {
    scout: [250_000, 24 * 60 * 60 * 1000],
    strategist: [150_000, 24 * 60 * 60 * 1000],
    archivist: [100_000, 24 * 60 * 60 * 1000],
    spine: [50_000, 24 * 60 * 60 * 1000],
  },
  // Request rate limit per route za 1 min
  routeRate: {
    "/api/agents/:name/run": [10, 60 * 1000],
    "/api/agents/:name/stream": [5, 60 * 1000],
    "/api/projects/:name/run-agent": [10, 60 * 1000],
    "/api/executor/run/:project": [10, 60 * 1000],
    "/api/executor/run-all/:project": [5, 60 * 1000],
  },
  // Global fallback per IP za 1 min
  globalIpRate: [120, 60 * 1000],
};

// In-memory state
let state = loadState();

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const saved = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
      // Merge with defaults (noví agenti / routes)
      return mergeDefaults(saved);
    }
  } catch (e) {
    console.warn("[RateLimiter] Nelze načíst stav:", e.message);
  }
  return structuredClone(DEFAULTS);
}

function mergeDefaults(saved) {
  const merged = structuredClone(DEFAULTS);
  if (saved.agentBudget) {
    for (const k of Object.keys(DEFAULTS.agentBudget)) {
      if (saved.agentBudget[k]) merged.agentBudget[k] = saved.agentBudget[k];
    }
  }
  if (saved.routeRate) {
    for (const k of Object.keys(DEFAULTS.routeRate)) {
      if (saved.routeRate[k]) merged.routeRate[k] = saved.routeRate[k];
    }
  }
  if (saved.globalIpRate) merged.globalIpRate = saved.globalIpRate;
  if (saved.usage) merged.usage = saved.usage;
  return merged;
}

function persist() {
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.warn("[RateLimiter] Nelze uložit stav:", e.message);
  }
}

function now() {
  return Date.now();
}

function getUsageBucket(key, windowMs) {
  if (!state.usage) state.usage = {};
  const bucketKey = `${key}:${Math.floor(now() / windowMs)}`;
  if (!state.usage[bucketKey]) state.usage[bucketKey] = { count: 0, tokens: 0, firstSeen: now() };
  return state.usage[bucketKey];
}

function pruneUsage() {
  if (!state.usage) return;
  const cutoff = now() - 48 * 60 * 60 * 1000; // udržuj 48h
  for (const k of Object.keys(state.usage)) {
    if (state.usage[k].firstSeen < cutoff) delete state.usage[k];
  }
}

/**
 * Zkontroluje a zaznamená tokenový budget pro agenta.
 * @returns {{ allowed: boolean, remaining: number, resetAt: number, limit: number, current: number, windowMs: number }}
 */
function checkAgentBudget(agentName, tokens = 0) {
  const [limit, windowMs] = state.agentBudget[agentName] || state.agentBudget["_default"] || [50_000, 24 * 60 * 60 * 1000];
  const bucket = getUsageBucket(`agent:${agentName}`, windowMs);
  const current = bucket.tokens || 0;
  const allowed = current + tokens <= limit;
  const resetAt = (Math.floor(now() / windowMs) + 1) * windowMs;

  if (allowed) {
    bucket.tokens = current + tokens;
    pruneUsage();
    persist();
  }

  return {
    allowed,
    remaining: Math.max(0, limit - bucket.tokens),
    resetAt,
    limit,
    current: bucket.tokens,
    windowMs,
  };
}

/**
 * Odhadne tokeny podle modelu.
 * Pro účely rate limiteru používáme konzervativní odhad.
 */
function estimateTokens(modelName, input = "", output = "") {
  // Heuristika: ~0.75 tokens per word (angličtina)
  const words = (input.length + output.length) / 5;
  // Premium modely = dražší
  const multiplier = modelName?.includes("kimi") || modelName?.includes("claude") ? 1.5 :
                     modelName?.includes("minimax-m3") ? 2.0 :
                     1.0;
  return Math.ceil(words * multiplier);
}

/**
 * Request rate limit pro konkrétní route a klíč (IP nebo user).
 */
function checkRouteRate(routeKey, clientKey, cost = 1) {
  const [limit, windowMs] = state.routeRate[routeKey] || state.routeRate["_default"] || [60, 60 * 1000];
  const bucket = getUsageBucket(`route:${routeKey}:${clientKey}`, windowMs);
  const current = bucket.count || 0;
  const allowed = current + cost <= limit;
  const resetAt = (Math.floor(now() / windowMs) + 1) * windowMs;

  if (allowed) {
    bucket.count = current + cost;
    pruneUsage();
    persist();
  }

  return {
    allowed,
    remaining: Math.max(0, limit - bucket.count),
    resetAt,
    limit,
    current: bucket.count,
    windowMs,
  };
}

/**
 * Global IP rate limit fallback.
 */
function checkGlobalIp(ip, cost = 1) {
  const [limit, windowMs] = state.globalIpRate || [120, 60 * 1000];
  const bucket = getUsageBucket(`ip:${ip}`, windowMs);
  const current = bucket.count || 0;
  const allowed = current + cost <= limit;
  const resetAt = (Math.floor(now() / windowMs) + 1) * windowMs;

  if (allowed) {
    bucket.count = current + cost;
    pruneUsage();
    persist();
  }

  return { allowed, remaining: Math.max(0, limit - bucket.count), resetAt, limit, current, windowMs };
}

function getState() {
  return {
    agentBudget: { ...state.agentBudget },
    routeRate: { ...state.routeRate },
    globalIpRate: [...state.globalIpRate],
    usageSummary: getUsageSummary(),
  };
}

function getUsageSummary() {
  pruneUsage();
  const summary = {};
  for (const [key, bucket] of Object.entries(state.usage || {})) {
    summary[key] = { ...bucket };
  }
  return summary;
}

function setLimits({ agentBudget, routeRate, globalIpRate }) {
  if (agentBudget) state.agentBudget = { ...state.agentBudget, ...agentBudget };
  if (routeRate) state.routeRate = { ...state.routeRate, ...routeRate };
  if (globalIpRate) state.globalIpRate = globalIpRate;
  persist();
  return getState();
}

function resetUsage() {
  state.usage = {};
  persist();
  return getState();
}

module.exports = {
  DEFAULTS,
  checkAgentBudget,
  checkRouteRate,
  checkGlobalIp,
  estimateTokens,
  getState,
  setLimits,
  resetUsage,
};
