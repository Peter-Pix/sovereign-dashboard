// ===== Integration testy pro routes — path traversal, mutex, dedup =====

const { test } = require("node:test");
const assert = require("node:assert");
const http = require("http");
const path = require("path");
const fs = require("fs");

const SERVER_PATH = path.resolve(__dirname, "../server/index.cjs");

// Pomocná funkce: HTTP request
function request(opts, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(opts, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

const HOST = "localhost";
const PORT = 8891;

// ===== isSafeName =====
const { isSafeName } = require("../server/lib/projects.cjs");

test("isSafeName: blokuje path traversal", () => {
  assert.strictEqual(isSafeName("../../../etc/passwd"), false);
  assert.strictEqual(isSafeName("foo/../bar"), false);
  assert.strictEqual(isSafeName("/etc/passwd"), false);
  assert.strictEqual(isSafeName("foo bar"), false);
  assert.strictEqual(isSafeName("foo;rm"), false);
});

test("isSafeName: povoluje legitimní názvy", () => {
  assert.strictEqual(isSafeName("sovereign-dashboard"), true);
  assert.strictEqual(isSafeName("rap-knowledge-graph"), true);
  assert.strictEqual(isSafeName("test.123"), true);
});

// ===== Routes (live server) =====

test("/api/files: blokuje path traversal přes absolutní cestu", async () => {
  const res = await request({
    hostname: HOST, port: PORT, path: "/api/files?p=/etc/passwd", method: "GET",
  });
  assert.strictEqual(res.status, 403);
});

test("/api/files: blokuje path traversal přes relativní cestu", async () => {
  const res = await request({
    hostname: HOST, port: PORT, path: "/api/files?p=../../etc/passwd", method: "GET",
  });
  assert.strictEqual(res.status, 403);
});

test("/api/projects/../run-agent: path traversal v URL", async () => {
  const res = await request({
    hostname: HOST, port: PORT, path: "/api/projects/..%2F..%2Fetc/run-agent", method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  // 401 (no auth) > 400 (invalid name) — obě jsou OK, hlavní je že neprojde 500
  assert.ok(res.status === 401 || res.status === 400, `expected 401/400, got ${res.status}`);
});

test("/api/bugs: blokuje path traversal v project", async () => {
  const res = await request({
    hostname: HOST, port: PORT, path: "/api/bugs", method: "POST",
    headers: { "Content-Type": "application/json" },
  }, JSON.stringify({ project: "../../../tmp", title: "test" }));
  // 401 bez auth, 400 s authem — obě OK
  assert.ok(res.status === 401 || res.status === 400, `expected 401/400, got ${res.status}`);
});

test("/api/bugs: validuje bug ID formát", async () => {
  const res = await request({
    hostname: HOST, port: PORT, path: "/api/bugs/foo/evil-path-traversal", method: "PATCH",
    headers: { "Content-Type": "application/json" },
  }, JSON.stringify({ status: "resolved" }));
  // 401 bez auth, 400 s authem — bug ID s pomlčkou je validní,
  // ale path-traversal v cestě by měl být 400 s authem
  assert.ok(res.status === 401 || res.status === 400, `expected 401/400, got ${res.status}`);
});

test("/health: vrátí OK", async () => {
  const res = await request({
    hostname: HOST, port: PORT, path: "/health", method: "GET",
  });
  assert.strictEqual(res.status, 200);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.status, "ok");
  assert.ok(body.uptime > 0);
  assert.ok(body.timestamp);
});

test("/api/projects: vrací pole s reálnými git daty", async () => {
  const res = await request({
    hostname: HOST, port: PORT, path: "/api/projects", method: "GET",
  });
  assert.strictEqual(res.status, 200);
  const projects = JSON.parse(res.body);
  assert.ok(Array.isArray(projects));
  assert.ok(projects.length > 0);

  // Každý projekt by měl mít reálná data
  for (const p of projects.slice(0, 3)) {
    assert.ok(p.name, "name required");
    assert.ok(p.lastHash, "lastHash required");
    assert.ok(p.lastMsg, "lastMsg required");
    assert.notStrictEqual(p.lastMsg, "Last commit updated", "hardcoded placeholder still present!");
    assert.ok(p.branch, "branch required");
    assert.ok(typeof p.dirty === "boolean", "dirty must be boolean");
    assert.ok(typeof p.health === "number", "health must be number");
    assert.ok(["hot", "active", "slow", "idle"].includes(p.activity), `invalid activity: ${p.activity}`);
  }
});

test("/api/executor/state: vrací execution state", async () => {
  const res = await request({
    hostname: HOST, port: PORT, path: "/api/executor/state", method: "GET",
  });
  assert.strictEqual(res.status, 200);
  const state = JSON.parse(res.body);
  assert.ok("totalExecutions" in state);
  assert.ok("maxTotal" in state);
  assert.ok("stuckTasks" in state);
  assert.ok("queueLength" in state);
});

test("/api/leads: dedup s městem (žádné duplikáty)", async () => {
  const res = await request({
    hostname: HOST, port: PORT, path: "/api/leads", method: "GET",
  });
  assert.strictEqual(res.status, 200);
  const leads = JSON.parse(res.body);
  assert.ok(Array.isArray(leads));

  // Ověř, že name+city kombinace je unikátní
  const seen = new Set();
  let dupes = 0;
  for (const l of leads) {
    const name = (l.name || "").toLowerCase().trim();
    const city = (l.city || l.lokace || l.location || "").toLowerCase().trim();
    const key = `${name}::${city}`;
    if (seen.has(key)) dupes++;
    seen.add(key);
  }
  assert.strictEqual(dupes, 0, "leads should have unique name+city combinations");
});
