// ===== Integration testy pro API routes =====
// Testuje reálné endpointy proti běžícímu serveru (localhost:8891).
// Vyžaduje, aby server běžel (npm run server:start).
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const PORT = 8891;
const BASE = `http://localhost:${PORT}`;

// Načtení auth tokenu z .env
function loadAuthToken() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return null;
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    if (line.startsWith("SOVEREIGN_AUTH_TOKEN=")) {
      return line.split("=")[1].trim();
    }
  }
  return null;
}

const AUTH_TOKEN = loadAuthToken();

// Spustí server jako subprocess, pokud neběží
let serverProc = null;

before(async () => {
  // Zkontroluj, jestli server už běží
  try {
    const res = await fetch(`${BASE}/health`);
    if (res.ok) return; // server už běží
  } catch {
    // server neběží, spustíme ho
  }
  serverProc = spawn("node", ["server/index.cjs"], {
    cwd: path.join(__dirname, ".."),
    stdio: "ignore",
  });
  // Počkej na start
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch {}
  }
  throw new Error("Server se nepodařilo spustit");
});

after(() => {
  if (serverProc) serverProc.kill();
});

test("GET /health vrací ok", async () => {
  const res = await fetch(`${BASE}/health`);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.status, "ok");
  assert.ok(body.uptime >= 0);
});

test("GET /api/projects vrací pole projektů", async () => {
  const res = await fetch(`${BASE}/api/projects`);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body));
  assert.ok(body.length > 0);
  assert.ok(body[0].name);
});

test("GET /api/agents vrací agenty", async () => {
  const res = await fetch(`${BASE}/api/agents`);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body));
});

test("GET /api/leads vrací leady", async () => {
  const res = await fetch(`${BASE}/api/leads`);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body));
});

test("GET /api/paparazzi vrací captures", async () => {
  const res = await fetch(`${BASE}/api/paparazzi`);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body));
});

test("GET /api/paparazzi/history vrací pole", async () => {
  const res = await fetch(`${BASE}/api/paparazzi/history`);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body));
});

test("POST /api/bugs bez auth → 401", async () => {
  const res = await fetch(`${BASE}/api/bugs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project: "x", title: "t" }),
  });
  assert.strictEqual(res.status, 401);
});

test("POST /api/agents/:name/run bez auth → 401", async () => {
  const res = await fetch(`${BASE}/api/agents/spine/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.strictEqual(res.status, 401);
});

test("GET /api/files s path traversal → 403", async () => {
  const res = await fetch(`${BASE}/api/files?p=/etc/passwd`);
  assert.strictEqual(res.status, 403);
});

test("GET /api/projects/:name s invalid name → 400", async () => {
  const res = await fetch(`${BASE}/api/projects/foo;rm%20-rf%20/`);
  assert.strictEqual(res.status, 400);
});

test("POST /api/projects/:name/run-agent s neznámým agentem → 404 (s auth)", async (t) => {
  if (!AUTH_TOKEN) {
    t.skip("AUTH_TOKEN není nastaven");
    return;
  }
  const res = await fetch(`${BASE}/api/projects/test/run-agent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-auth-token": AUTH_TOKEN,
    },
    body: JSON.stringify({ agent: "nonexistent" }),
  });
  assert.strictEqual(res.status, 404);
});
