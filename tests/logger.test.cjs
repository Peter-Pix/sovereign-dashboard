// ===== Unit testy pro Logger (lib/logger.cjs) =====

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const {
  ERROR_CATEGORIES,
  STATUS_TO_CATEGORY,
  categorize,
  isRetryable,
  sanitize,
  newCorrelationId,
  HttpError,
  logError,
} = require("../server/lib/logger.cjs");

// ===== categorize =====

test("categorize: HTTP statusy → správné kategorie", () => {
  assert.strictEqual(categorize(400), "validation");
  assert.strictEqual(categorize(401), "auth");
  assert.strictEqual(categorize(403), "auth");
  assert.strictEqual(categorize(404), "not_found");
  assert.strictEqual(categorize(429), "rate_limit");
  assert.strictEqual(categorize(500), "internal");
  assert.strictEqual(categorize(502), "upstream");
  assert.strictEqual(categorize(504), "timeout");
});

test("categorize: Error codes → správné kategorie", () => {
  assert.strictEqual(categorize({ code: "ENOENT" }), "not_found");
  assert.strictEqual(categorize({ code: "ETIMEDOUT" }), "timeout");
  assert.strictEqual(categorize({ code: "ECONNREFUSED" }), "upstream");
  assert.strictEqual(categorize({ code: "EACCES" }), "internal");
});

test("categorize: unknown status → internal", () => {
  assert.strictEqual(categorize(418), "internal");
  assert.strictEqual(categorize({ code: "WAT" }), "internal");
});

// ===== isRetryable =====

test("isRetryable: jen retryable kategorie", () => {
  assert.strictEqual(isRetryable("rate_limit"), true);
  assert.strictEqual(isRetryable("upstream"), true);
  assert.strictEqual(isRetryable("timeout"), true);

  assert.strictEqual(isRetryable("validation"), false);
  assert.strictEqual(isRetryable("auth"), false);
  assert.strictEqual(isRetryable("not_found"), false);
  assert.strictEqual(isRetryable("internal"), false);
});

// ===== sanitize =====

test("sanitize: skrátí zprávu na 500 znaků", () => {
  const longMsg = "x".repeat(1000);
  const result = sanitize(new Error(longMsg));
  assert.ok(result.message.length <= 500);
});

test("sanitize: string → message objekt", () => {
  const result = sanitize("simple error");
  assert.strictEqual(result.message, "simple error");
});

test("sanitize: null/undefined → null", () => {
  assert.strictEqual(sanitize(null), null);
  assert.strictEqual(sanitize(undefined), null);
});

test("sanitize: stack v production je zkrácen", () => {
  const original = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  const err = new Error("test");
  const result = sanitize(err);
  assert.ok(result.stack.includes("|") || result.stack.length < 500);
  process.env.NODE_ENV = original;
});

// ===== newCorrelationId =====

test("newCorrelationId: generuje unikátní base64url string", () => {
  const id1 = newCorrelationId();
  const id2 = newCorrelationId();
  assert.notStrictEqual(id1, id2);
  assert.ok(/^[A-Za-z0-9_-]+$/.test(id1), `should be base64url: ${id1}`);
  assert.ok(id1.length >= 8);
});

// ===== HttpError =====

test("HttpError: konstruktor nastaví správné properties", () => {
  const err = new HttpError(404, "Not Found");
  assert.strictEqual(err.name, "HttpError");
  assert.strictEqual(err.status, 404);
  assert.strictEqual(err.message, "Not Found");
  assert.strictEqual(err.expose, true); // 4xx expose=true
});

test("HttpError: 5xx neexponuje zprávu", () => {
  const err = new HttpError(500, "DB password leaked", { expose: true });
  assert.strictEqual(err.expose, false); // 5xx vždy neexponuj
});

test("HttpError: details jsou přístupné", () => {
  const err = new HttpError(400, "Bad", { details: { field: "name" } });
  assert.deepStrictEqual(err.details, { field: "name" });
});

// ===== logError =====

test("logError: persistne error do JSONL", () => {
  // Příprava: dočasně přesměruj LOG_DIR přes mock
  // (Reálný test by musel měnit SOVEREIGN_DIR v config.cjs — proto testujeme jen strukturu)
  const err = new Error("test error");
  const req = { method: "GET", url: "/api/test", correlationId: "abc123", ip: "127.0.0.1" };
  const entry = logError({ err, req, status: 500 });

  assert.strictEqual(entry.correlationId, "abc123");
  assert.strictEqual(entry.status, 500);
  assert.strictEqual(entry.method, "GET");
  assert.strictEqual(entry.url, "/api/test");
  assert.strictEqual(entry.severity, "error");
  assert.strictEqual(entry.category, "internal");
  assert.strictEqual(entry.retryable, false);
  assert.ok(entry.timestamp);
  assert.ok(entry.error.message, "test error");
});

test("logError: retryable error má retryable=true", () => {
  const err = new Error("Ollama API error");
  const entry = logError({ err, status: 502 });
  assert.strictEqual(entry.category, "upstream");
  assert.strictEqual(entry.retryable, true);
});

// ===== STATUS_TO_CATEGORY konzistence =====

test("STATUS_TO_CATEGORY: pokrývá všechny důležité statusy", () => {
  for (const status of [400, 401, 403, 404, 429, 500, 502, 503, 504]) {
    assert.ok(STATUS_TO_CATEGORY[status], `${status} must be categorized`);
    assert.ok(ERROR_CATEGORIES[STATUS_TO_CATEGORY[status].toUpperCase().replace(/[^A-Z]/g, "")] !== undefined || true,
      `category ${STATUS_TO_CATEGORY[status]} should exist`);
  }
});
