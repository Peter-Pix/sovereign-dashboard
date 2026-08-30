// ===== Unit test: timeout zabije i gateway task =====
// Ověřuje, že když lokální openclaw agent proces dostane timeout,
// executor zavolá i `openclaw tasks cancel <session-key>`, aby gateway
// task nepokračoval na pozadí a nespálil budget na "mrtvé" exekuci.

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");

const FIXTURE_NAME = `__executor_timeout_test_${Date.now()}`;
const PROJECTS_DIR = path.resolve(__dirname, "..", ".."); // server/config.cjs: ROOT/../..
const FIXTURE_DIR = path.join(PROJECTS_DIR, FIXTURE_NAME);
const EXECUTOR_PATH = require.resolve("../server/lib/executor.cjs");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function setupFixture() {
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(FIXTURE_DIR, "README.md"),
    `# ${FIXTURE_NAME}\n\nTestovací projekt pro executor timeout.\n`,
    "utf8"
  );
  fs.writeFileSync(
    path.join(FIXTURE_DIR, "ROADMAP.md"),
    `# ROADMAP\n\n## Fáze A\n- [ ] Dummy task pro timeout test\n`,
    "utf8"
  );
}

function cleanupFixture() {
  try {
    fs.rmSync(FIXTURE_DIR, { recursive: true, force: true });
  } catch {}
}

test("runTaskAgent: při timeoutu zavolá openclaw tasks cancel <session-key>", { timeout: 3000 }, async () => {
  setupFixture();

  const calls = [];
  const realExecFile = childProcess.execFile;

  // Mock execFile: openclaw agent nikdy nevrátí (simuluje uváznutý běh);
  // openclaw tasks cancel okamžitě uspěje.
  childProcess.execFile = (cmd, args, opts, cb) => {
    calls.push({ cmd, args, opts });
    if (cmd === "openclaw" && args[0] === "agent") {
      // simulace: proces běží donekonečna — lokální timeout ho zabije
      return { pid: 999001 };
    }
    if (cmd === "openclaw" && args[0] === "tasks" && args[1] === "cancel") {
      if (typeof cb === "function") cb(null, "", "");
      return { pid: 999002 };
    }
    // Pro ostatní příkazy (např. testy uvnitř selfCorrect) vracíme ok.
    if (typeof cb === "function") cb(null, "", "");
    return { pid: 999003 };
  };

  let executor;
  let callbackErr = null;
  let callbackResult;

  try {
    // Vyčisti cache executoru, aby načetl mocknutý child_process
    delete require.cache[EXECUTOR_PATH];
    executor = require(EXECUTOR_PATH);

    // Nastav extrémně krátký timeout pro test
    executor.LIMITS.AGENT_TIMEOUT_MS = 150;

    executor.runTaskAgent("archivist", FIXTURE_NAME, "Dummy task pro timeout test", (err, result) => {
      callbackErr = err;
      callbackResult = result;
    });

    // Počkej, až projede timeout + cancel
    await sleep(400);
  } finally {
    // Obnov execFile a vyčisti cache executoru
    childProcess.execFile = realExecFile;
    delete require.cache[EXECUTOR_PATH];
    cleanupFixture();
  }

  // ASSERTIONS
  const agentCall = calls.find((c) => c.cmd === "openclaw" && c.args[0] === "agent");
  assert.ok(agentCall, "mel by zavolat openclaw agent");

  const sessionKeyIndex = agentCall.args.indexOf("--session-key");
  assert.ok(sessionKeyIndex !== -1, "openclaw agent musi dostat --session-key");
  const sessionKey = agentCall.args[sessionKeyIndex + 1];
  assert.ok(
    typeof sessionKey === "string" && sessionKey.startsWith("agent:main:"),
    `session key musi zacinat agent:main:, dostal: ${sessionKey}`
  );
  assert.ok(sessionKey.includes(FIXTURE_NAME), "session key musi obsahovat nazev projektu");

  const cancelCall = calls.find((c) => c.cmd === "openclaw" && c.args[0] === "tasks" && c.args[1] === "cancel");
  assert.ok(cancelCall, "mel by zavolat openclaw tasks cancel");
  assert.strictEqual(cancelCall.args[2], sessionKey, "tasks cancel musi pouzit stejny session key");

  assert.ok(callbackErr, "callback mel dostat timeout chybu");
  assert.ok(callbackErr.message.includes("timeout"), `chyba by mela obsahovat 'timeout': ${callbackErr.message}`);
  assert.ok(callbackResult === undefined || callbackResult === null, "callback result mel byt prazdny pri chybe");
});
