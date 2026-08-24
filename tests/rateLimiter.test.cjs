// ===== Unit testy pro Rate Limiter =====

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const express = require("express");

const rateLimiter = require("../server/lib/rateLimiter.cjs");
const { rateLimitByRoute, rateLimitGlobal } = require("../server/lib/rateLimitMiddleware.cjs");

// Reset state před/po testech
function resetState() {
  rateLimiter.resetUsage();
}

function resetLimits() {
  rateLimiter.setLimits({
    agentBudget: rateLimiter.DEFAULTS.agentBudget,
    routeRate: rateLimiter.DEFAULTS.routeRate,
    globalIpRate: rateLimiter.DEFAULTS.globalIpRate,
  });
}

// ===== isValidModelName-like validace není v rateLimiteru, ale estimateTokens =====

test("estimateTokens: heuristika funguje", () => {
  const t1 = rateLimiter.estimateTokens("ollama/minimax-m3:cloud", "hello world", "result");
  assert.ok(t1 > 0);

  const t2 = rateLimiter.estimateTokens("ollama/kimi-k2.7-code:cloud", "x".repeat(100));
  const t3 = rateLimiter.estimateTokens("ollama/deepseek-v4-flash:cloud", "x".repeat(100));
  assert.ok(t2 > t3 || t2 === t3, "kimi může být dražší nebo stejný");
});

// ===== Agent Budget =====

test("checkAgentBudget: první spotřeba je allowed", () => {
  resetState();
  const res = rateLimiter.checkAgentBudget("scout", 1000);
  assert.strictEqual(res.allowed, true);
  assert.strictEqual(res.current, 1000);
  assert.strictEqual(res.limit, 250000);
});

test("checkAgentBudget: překročení limitu je blocked", () => {
  resetState();
  const first = rateLimiter.checkAgentBudget("scout", 240000);
  assert.strictEqual(first.allowed, true);

  const second = rateLimiter.checkAgentBudget("scout", 20000);
  assert.strictEqual(second.allowed, false);
  assert.strictEqual(second.current, 240000); // nepřičte se
  assert.strictEqual(second.remaining, 10000);
});

test("checkAgentBudget: neznámý agent fallback na _default", () => {
  resetState();
  // Pokud není _default, použije se poslední fallback [50000, 24h]
  const res = rateLimiter.checkAgentBudget("unknown-agent", 1000);
  assert.strictEqual(res.allowed, true);
  assert.strictEqual(res.limit, 50000);
});

// ===== Route Rate =====

test("checkRouteRate: limit 10 requestů", () => {
  resetState();
  const key = "client-1";
  let last;
  for (let i = 0; i < 10; i++) {
    last = rateLimiter.checkRouteRate("/api/agents/:name/run", key, 1);
    assert.strictEqual(last.allowed, true);
  }

  const blocked = rateLimiter.checkRouteRate("/api/agents/:name/run", key, 1);
  assert.strictEqual(blocked.allowed, false);
  assert.strictEqual(blocked.remaining, 0);
  assert.ok(blocked.resetAt > Date.now());
});

test("checkRouteRate: různé klienty mají vlastní buckety", () => {
  resetState();
  for (let i = 0; i < 5; i++) {
    assert.strictEqual(rateLimiter.checkRouteRate("/api/test", "a", 1).allowed, true);
    assert.strictEqual(rateLimiter.checkRouteRate("/api/test", "b", 1).allowed, true);
  }
});

// ===== Global IP =====

test("checkGlobalIp: limit funguje", () => {
  resetState();
  resetLimits();
  // Nastavíme malý limit pro rychlý test — vyhneme se kolizi s jinými testy
  rateLimiter.setLimits({ globalIpRate: [5, 60000] });
  const ip = "127.0.0.1";
  for (let i = 0; i < 5; i++) {
    assert.strictEqual(rateLimiter.checkGlobalIp(ip, 1).allowed, true);
  }
  const blocked = rateLimiter.checkGlobalIp(ip, 1);
  assert.strictEqual(blocked.allowed, false);
});

// ===== State / Persistence =====

test("getState: obsahuje defaults", () => {
  resetState();
  resetLimits();
  const state = rateLimiter.getState();
  assert.ok(state.agentBudget.scout);
  assert.ok(state.routeRate["/api/agents/:name/run"]);
  assert.strictEqual(state.globalIpRate[0], 120);
});

test("setLimits: změní limity", () => {
  resetState();
  const updated = rateLimiter.setLimits({
    agentBudget: { scout: [1000, 3600000] },
    routeRate: { "/api/test": [3, 1000] },
    globalIpRate: [10, 1000],
  });

  assert.deepStrictEqual(updated.agentBudget.scout, [1000, 3600000]);
  assert.deepStrictEqual(updated.routeRate["/api/test"], [3, 1000]);
  assert.deepStrictEqual(updated.globalIpRate, [10, 1000]);
});

// ===== Middleware integrace =====

test("rateLimitByRoute middleware: blokuje po limitu", { timeout: 5000 }, async () => {
  resetState();
  resetLimits();
  const app = express();
  app.use(express.json());
  // simulace x-auth-token
  app.use((req, res, next) => {
    req.headers["x-auth-token"] = "test";
    next();
  });
  app.get("/test", rateLimitByRoute("/test"), (req, res) => res.json({ ok: true }));

  const server = app.listen(0);
  const port = server.address().port;

  try {
    const url = `http://127.0.0.1:${port}/test`;
    // override limit pro /test
    rateLimiter.setLimits({ routeRate: { "/test": [2, 60000] } });

    const r1 = await fetch(url);
    assert.strictEqual(r1.status, 200);
    assert.strictEqual(r1.headers.get("x-ratelimit-remaining"), "1");

    const r2 = await fetch(url);
    assert.strictEqual(r2.status, 200);
    assert.strictEqual(r2.headers.get("x-ratelimit-remaining"), "0");

    const r3 = await fetch(url);
    assert.strictEqual(r3.status, 429);
    const body = await r3.json();
    assert.strictEqual(body.category, "rate_limit");
    assert.strictEqual(body.retryable, true);
    assert.ok(r3.headers.get("retry-after"));
  } finally {
    server.close();
  }
});

test("rateLimitGlobal middleware: fallback IP limit", { timeout: 5000 }, async () => {
  resetState();
  resetLimits();
  const app = express();
  app.set("trust proxy", true);
  app.get("/ping", rateLimitGlobal, (req, res) => res.json({ ok: true }));

  const server = app.listen(0);
  const port = server.address().port;

  try {
    rateLimiter.setLimits({ globalIpRate: [2, 60000] });
    const url = `http://127.0.0.1:${port}/ping`;

    const r1 = await fetch(url);
    assert.strictEqual(r1.status, 200);

    const r2 = await fetch(url);
    assert.strictEqual(r2.status, 200);

    const r3 = await fetch(url);
    assert.strictEqual(r3.status, 429);
  } finally {
    server.close();
  }
});
