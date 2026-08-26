// ===== Lifecycle testy pro Sovereign Dashboard =====
// Ověřují životní cyklus procesů: start → běh → stop → restart.
//
// PROČ tyto testy existují:
// Historický bug — po `stop` zůstával frontend Vite (port 3205) běžet jako
// orphaned proces, protože starý stop.sh ho nezachytil (killoval jen backend).
// Ukazatel se pořád točil, "projekt nešel zastavit". Tyto testy chytají
// přesně ten scénář a jakoukoli regresi v start/stop mechanismu.
//
// Design:
//   - Testuje REÁLNÉ skripty: scripts/start.sh a scripts/stop.sh
//   - Ověřuje VŠECHNY komponenty: backend (8891), frontend Vite (3205)
//   - Čeká na skutečný stav (waitFor), ne na pevné sleep — robustní
//   - Po každém testu uklízí, na konci obnoví původní stav
//   - Node built-in test runner (node:test) — žádné nové dependency
//
// Technické poznámky (hard-learned):
//   - lsof na macOS je v /usr/sbin a flagy MUSÍ být oddělené ("-i","-P","-n"),
//     spojené ("-iP") nevrací výstup.
//   - Detached procesy (backend, vite) spouštět přes spawn({detached:true,
//     stdio:"ignore"}).unref(), NE přes sh("... &") — spawnSync na "&"
//     čeká na zavření fds a visí.
//   - sh() má timeout 15000 jako pojistka proti visení.
//
// Spuštění: node --test --test-force-exit tests/lifecycle.test.cjs

const { test, before, after } = require("node:test");
const assert = require("node:assert");
const { spawnSync, spawn } = require("child_process");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PLIST = path.join(process.env.HOME, "Library/LaunchAgents/ai.sovereign-dashboard.plist");

const BACKEND_PORT = 8891;
const FRONTEND_PORT = 3205;

// ============ Helpery ============

function sh(cmd, opts = {}) {
  const r = spawnSync("bash", ["-c", cmd], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: (opts.timeout || 15000),   // pojistka proti visení
    env: { ...process.env, ...opts.env },
  });
  return { code: r.status, stdout: (r.stdout || "").trim(), stderr: (r.stderr || "").trim() };
}

function portListening(port) {
  try {
    const r = spawnSync("/usr/sbin/lsof", ["-i", "-P", "-n"], { encoding: "utf8", timeout: 10000 });
    return r.stdout.split("\n").some(l => l.includes(`:${port}`) && l.includes("LISTEN"));
  } catch { return false; }
}

function backendHealthy() {
  try {
    const r = spawnSync("curl", ["-s", "-m", "2", `http://localhost:${BACKEND_PORT}/health`], { encoding: "utf8", timeout: 5000 });
    return r.stdout.trim().length > 0;
  } catch { return false; }
}

function pidsOf(pattern) {
  const r = sh(`pgrep -f '${pattern}' || true`);
  return r.stdout ? r.stdout.split("\n").filter(Boolean).map(Number) : [];
}

// Komponenty sovereignu (detekce podle cesty k projektu, NE podle process name!)
const components = {
  wrapper:   () => pidsOf("scripts/start.sh"),
  backend:   () => pidsOf("server/index.cjs"),
  frontend:  () => pidsOf("sovereign-dashboard/node_modules/.bin/vite"),
  frontendP: () => pidsOf("npm exec vite --port 3205"),  // parent npm proces
};

const backendProcs = components.backend;
const wrapperProcs = components.wrapper;

function allPids() {
  return [...new Set([
    ...components.wrapper(),
    ...components.backend(),
    ...components.frontend(),
    ...components.frontendP(),
  ])];
}

function isRunning() {
  return allPids().length > 0 || portListening(BACKEND_PORT);
}

// Spustí backend přes start.sh jako detached proces.
// POZN.: spawn + detached + stdio:"ignore" (NE spawnSync na "&" — to visí).
function startBackend() {
  spawn("bash", ["scripts/start.sh"], {
    cwd: ROOT, stdio: "ignore", detached: true,
  }).unref();
}

// Spustí frontend vite jako detached proces (orphaned scénář).
function startFrontend() {
  spawn("npx", ["vite", "--port", String(FRONTEND_PORT)], {
    cwd: ROOT, stdio: "ignore", detached: true,
  }).unref();
}

// Kompletní zastavení všeho (robustní, nezávislé na stop.sh)
function stopEverything() {
  sh(`launchctl bootout "gui/$(id -u)/ai.sovereign-dashboard" 2>/dev/null || launchctl unload ${PLIST} 2>/dev/null`);
  sh("pkill -f scripts/start.sh 2>/dev/null || true");
  sh("pkill -f server/index.cjs 2>/dev/null || true");
  sh("pkill -f 'sovereign-dashboard/node_modules/.bin/vite' 2>/dev/null || true");
  sh("pkill -f 'npm exec vite --port 3205' 2>/dev/null || true");
  const leftover = allPids();
  if (leftover.length) sh(`kill -9 ${leftover.join(" ")} 2>/dev/null || true`);
}

function waitFor(fn, ms, label) {
  return new Promise((resolve) => {
    const start = Date.now();
    const iv = setInterval(() => {
      if (fn()) { clearInterval(iv); resolve(true); }
      else if (Date.now() - start > ms) { clearInterval(iv); resolve(false); }
    }, 300);
  });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ============ Setup / Teardown ============

let wasRunningBefore = false;

before(() => {
  wasRunningBefore = isRunning();
  console.log(`\n[lifecycle] 🔍 Výchozí stav: ${wasRunningBefore ? "BĚŽÍ" : "STOPNUTO"}`);
});

after(async () => {
  // Čistota — žádné procesy z testů nesmí zůstat
  stopEverything();
  await sleep(1000);
  const nowRunning = isRunning();

  // Obnov původní stav
  if (wasRunningBefore && !nowRunning) {
    console.log("\n[lifecycle] ↩️  Obnovuji: systém běžel → restartuji");
    startBackend();
    await waitFor(backendHealthy, 15000, "backend");
  } else if (!wasRunningBefore && nowRunning) {
    console.log("\n[lifecycle] ↩️  Obnovuji: systém nestál → zajištěno");
  } else {
    console.log("\n[lifecycle] ✅ Stav beze změny");
  }
});

// ============ Testy ============

test("1. STOP: stop.sh zastaví backend + frontend + wrapper", { timeout: 40000 }, async () => {
  // Zajisti běžící backend
  if (!isRunning()) startBackend();
  const started = await waitFor(backendHealthy, 15000, "backend start");
  assert.ok(started, "backend má běžet před stopem");

  const r = sh("bash scripts/stop.sh", { timeout: 20000 });
  assert.strictEqual(r.code, 0, `stop.sh selhal: ${r.stderr}`);
  await sleep(1500);

  // VŠECHNY komponenty musí být mrtvé
  assert.ok(!portListening(BACKEND_PORT), `backend port ${BACKEND_PORT} má být uvolněn`);
  assert.ok(!portListening(FRONTEND_PORT), `frontend port ${FRONTEND_PORT} má být uvolněn`);
  assert.deepStrictEqual(allPids(), [], `žádný proces nemá zůstat: ${allPids()}`);
});

test("2. STOP zastaví ORPHANED vite (regresní test)", { timeout: 50000 }, async () => {
  // Scénář původního bugu: vite běží samostatně, stop.sh ho musí chytit
  stopEverything();
  await sleep(800);

  // Simuluj orphaned vite (jako z dev.sh, kdy backend vzal launchd)
  startFrontend();
  const viteUp = await waitFor(() => portListening(FRONTEND_PORT), 15000, "vite start");
  assert.ok(viteUp, "orphaned vite má běžet (předpoklad)");

  // Přidej backend — ať je systém kompletní
  startBackend();
  const backendUp = await waitFor(() => backendHealthy(), 20000, "backend start");
  assert.ok(backendUp, "backend má běžet");

  // STOP musí chytit i vite
  const r = sh("bash scripts/stop.sh", { timeout: 20000 });
  assert.strictEqual(r.code, 0, `stop.sh selhal: ${r.stderr}`);
  await sleep(1500);

  assert.ok(!portListening(BACKEND_PORT), `backend port ${BACKEND_PORT} uvolněn`);
  assert.ok(!portListening(FRONTEND_PORT), `frontend port ${FRONTEND_PORT} uvolněn (vite chycen!)`);
  assert.deepStrictEqual(allPids(), [], "žádný proces nemá zůstat");
});

test("3. auto-restart: backend se restartuje po crashu", { timeout: 50000 }, async () => {
  // start.sh má while-loop auto-restart — po zabití node se musí vrátit
  startBackend();
  const started = await waitFor(() => backendHealthy(), 20000, "backend start");
  assert.ok(started, "backend má běžet");
  await sleep(800);

  const pids = backendProcs();
  assert.ok(pids.length > 0, "backend proces existuje");
  const oldPid = pids[0];

  // Zabij backend — start.sh ho má restartovat
  sh(`kill -9 ${oldPid} 2>/dev/null || true`);
  const restarted = await waitFor(() => {
    const now = backendProcs();
    return now.length > 0 && now[0] !== oldPid;
  }, 15000, "restart");
  assert.ok(restarted, "backend se měl restartovat (nový PID)");

  const newPids = backendProcs();
  assert.ok(newPids.length > 0, "nový backend běží");
  assert.notStrictEqual(newPids[0], oldPid, "PID se má změnit");
  assert.ok(portListening(BACKEND_PORT), "port znovu naslouchá");
});

test("4. restart cyklus: stop → start → stop → start je čistý", { timeout: 70000 }, async () => {
  for (let i = 1; i <= 2; i++) {
    // start
    startBackend();
    const ok1 = await waitFor(() => backendHealthy(), 15000, `start #${i}`);
    assert.ok(ok1, `start #${i}: backend se má spustit`);

    // stop
    const r = sh("bash scripts/stop.sh", { timeout: 20000 });
    assert.strictEqual(r.code, 0, `stop #${i} selhal`);
    await sleep(1500);
    assert.ok(!portListening(BACKEND_PORT), `stop #${i}: backend uvolněn`);
    const leftover = allPids();
    assert.deepStrictEqual(leftover, [], `stop #${i}: žádný proces nemá zůstat: ${leftover}`);
  }
});
