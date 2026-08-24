// ===== Unit testy pro MCP Manager (lib/mcpManager.cjs) =====

const { test } = require("node:test");
const assert = require("node:assert");

const mcpManager = require("../server/lib/mcpManager.cjs");

// ===== isValidServerName =====

test("isValidServerName: povoluje legitimní názvy", () => {
  assert.strictEqual(mcpManager.isValidServerName("postgres"), true);
  assert.strictEqual(mcpManager.isValidServerName("prod-db"), true);
  assert.strictEqual(mcpManager.isValidServerName("my_server.1"), true);
  assert.strictEqual(mcpManager.isValidServerName("analytics-2026"), true);
});

test("isValidServerName: blokuje path traversal + injection", () => {
  assert.strictEqual(mcpManager.isValidServerName("../../etc"), false);
  assert.strictEqual(mcpManager.isValidServerName("/etc/passwd"), false);
  assert.strictEqual(mcpManager.isValidServerName("a b"), false);
  assert.strictEqual(mcpManager.isValidServerName("a;rm -rf /"), false);
  assert.strictEqual(mcpManager.isValidServerName(""), false);
  assert.strictEqual(mcpManager.isValidServerName(null), false);
  assert.strictEqual(mcpManager.isValidServerName(undefined), false);
  assert.strictEqual(mcpManager.isValidServerName("x".repeat(70)), false); // >64
  assert.strictEqual(mcpManager.isValidServerName("a"), true); // 1 znak je OK
});

// ===== Low-level funkce (mockované CLI) =====

test("listServers: normalizuje objekt {name: def} na pole", async () => {
  // Přímo testuje pomocnou logiku přes reálný (prázdný) registr
  const servers = await mcpManager.listServers();
  assert.ok(Array.isArray(servers), "listServers musí vrátit pole");
});

test("statusServers: vrací pole", async () => {
  const status = await mcpManager.statusServers();
  assert.ok(Array.isArray(status), "statusServers musí vrátit pole");
});

test("getServer: neexistující server vrací null", async () => {
  const s = await mcpManager.getServer("neexistujici-server-xyz");
  assert.strictEqual(s, null);
});

test("upsertServer: neplatný název vyhodí chybu", async () => {
  await assert.rejects(
    () => mcpManager.upsertServer("../../etc", { command: "npx" }),
    /Neplatný název/
  );
});

test("removeServer: neplatný název vyhodí chybu", async () => {
  await assert.rejects(
    () => mcpManager.removeServer("a b c"),
    /Neplatný název/
  );
});

test("probeServer: neplatný název vyhodí chybu", async () => {
  await assert.rejects(
    () => mcpManager.probeServer("../../etc/passwd"),
    /Neplatný název/
  );
});

// ===== End-to-end: full lifecycle přes reálný CLI =====
// Poznámka: testy spouští reálné `openclaw mcp` CLI — vyžaduje openclaw.
// Pokud CLI není dostupné, testy se přeskočí (skip).

const HAS_OPENCLAW = (() => {
  try {
    return require("child_process").execSync("which openclaw").toString().trim().length > 0;
  } catch { return false; }
})();

test("E2E: upsert → get → probe → delete lifecycle", { skip: !HAS_OPENCLAW }, async () => {
  const name = `test-mcp-${Date.now()}`;

  // 1. Přidat
  const add = await mcpManager.upsertServer(name, {
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-memory"],
  });
  assert.ok(add.ok, "add musí projít");

  // 2. Najít v listu
  const servers = await mcpManager.listServers();
  const found = servers.find((s) => s.name === name);
  assert.ok(found, "server musí být v listu");

  // 3. Status
  const status = await mcpManager.statusServers();
  const st = status.find((s) => s.name === name);
  assert.ok(st, "server musí být ve statusu");
  assert.strictEqual(st.configured, true, "musí být configured");

  // 4. Get
  const got = await mcpManager.getServer(name);
  assert.ok(got, "getServer musí vrátit server");

  // 5. Smazat
  const del = await mcpManager.removeServer(name);
  assert.ok(del.ok, "delete musí projít");

  // 6. Ověřit, že je pryč
  const after = await mcpManager.listServers();
  assert.ok(!after.find((s) => s.name === name), "server musí být smazán");
}, { timeout: 60000 });
