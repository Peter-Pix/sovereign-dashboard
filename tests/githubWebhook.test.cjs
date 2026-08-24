// ===== Unit testy pro GitHub Webhook handler =====

const { test } = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");

const { verifySignature, getRepoName, getEventType, pingResponse } = require("../server/lib/githubWebhook.cjs");

function sign(payload, secret) {
  return "sha256=" + crypto.createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

// ===== verifySignature =====

test("verifySignature: validní podpis", () => {
  const secret = "test-secret";
  const payload = '{"action":"opened"}';
  const sig = sign(payload, secret);
  const res = verifySignature(payload, sig, secret);
  assert.strictEqual(res.valid, true);
  assert.strictEqual(res.reason, null);
});

test("verifySignature: špatný podpis", () => {
  const secret = "test-secret";
  const payload = '{"action":"opened"}';
  const sig = sign(payload, secret);
  const res = verifySignature(payload, sig, "wrong-secret");
  assert.strictEqual(res.valid, false);
  assert.strictEqual(res.reason, "signature mismatch");
});

test("verifySignature: chybějící secret", () => {
  const payload = '{"action":"opened"}';
  const sig = sign(payload, "x");
  const res = verifySignature(payload, sig, null);
  assert.strictEqual(res.valid, false);
  assert.strictEqual(res.reason, "secret not configured");
});

test("verifySignature: špatný formát signature", () => {
  const res = verifySignature('{}', "bad-format", "test-secret");
  assert.strictEqual(res.valid, false);
  assert.strictEqual(res.reason, "missing or invalid signature format");
});

test("verifySignature: prázdný payload", () => {
  const secret = "test-secret";
  const sig = sign("", secret);
  const res = verifySignature("", sig, secret);
  assert.strictEqual(res.valid, true);
});

// ===== getRepoName =====

test("getRepoName: z repository.name", () => {
  const repo = getRepoName({ repository: { name: "sovereign-dashboard" } });
  assert.strictEqual(repo, "sovereign-dashboard");
});

test("getRepoName: z repository.full_name", () => {
  const repo = getRepoName({ repository: { full_name: "piskacek/sovereign-dashboard" } });
  assert.strictEqual(repo, "sovereign-dashboard");
});

test("getRepoName: null pro prázdný payload", () => {
  assert.strictEqual(getRepoName(null), null);
  assert.strictEqual(getRepoName({}), null);
});

// ===== getEventType =====

test("getEventType: lowercase header", () => {
  assert.strictEqual(getEventType({ "x-github-event": "push" }), "push");
});

test("getEventType: fallback na unknown", () => {
  assert.strictEqual(getEventType({}), "unknown");
});

// ===== pingResponse =====

test("pingResponse: vrací ok", () => {
  const res = pingResponse();
  assert.strictEqual(res.ok, true);
  assert.ok(res.message);
});
