// ===== E2E test: Paralelní exekuce (3 sloty) + uvolnění =====
// Ověřuje chování pool workeru END-TO-END přes reálný executor (lib/executor.cjs):
//
//   [A] KŘÍŽOVĚ-PROJEKTOVÁ paralelita: 3 projekty, každý s 1 taskem
//       → 3 SOUČASNĚ, slots 3/3, canRun=false (disabled), pak uvolnění.
//   [B] SAME-PROJECT serializace: 1 projekt s >=3 tasky → běží 1 najednou
//       (adaptivní MAX_PER_PROJECT=1 — tasky z jednoho projektu si konkurují
//       na souborech). NEJEDNÁ se o chybu, ale o zamýšlené adaptivní řízení.
//   [C] Uvolnění slotů po dokončení + odškrtnutí tasků v ROADMAP.
//
// NEVOLÁ reálný cloud model — runTaskAgent je mocknut přes test seam
// (EXECUTOR_MOCK_AGENT=1), deterministický a rychlý.
//
// Spuštění (--test-concurrency=1 je POVINNÉ — testy sdílejí globální
// executionState, paralelní běh = test pollution / flaky):
//   node --test --test-concurrency=1 tests/e2e-parallel-execution.test.cjs

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

// ── Musí být nastaveno PŘED require executor.cjs ──
// Výchozí hodnoty — testy je mohou přepsat lokálně
process.env.EXEC_CONCURRENCY = "3";           // 3 sloty
process.env.EXECUTOR_MOCK_AGENT = "1";        // mock agenta (žádný cloud)
// EXECUTOR_MOCK_DELAY_MS bude nastaveno v jednotlivých testech

const config = require("../server/config.cjs");
const executor = require("../server/lib/executor.cjs");

const PROJECTS_DIR = config.PROJECTS_DIR;

function fixture(name) {
  const dir = path.join(PROJECTS_DIR, name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function writeRoadmap(dir, lines) {
  fs.writeFileSync(path.join(dir, "ROADMAP.md"), "# Fixture ROADMAP\n\n## Fáze A\n" + lines.join("\n"), "utf8");
}
function cleanup(name) {
  try { fs.rmSync(path.join(PROJECTS_DIR, name), { recursive: true, force: true }); } catch {}
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(pred, timeoutMs, step = 40) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (pred()) return true;
    await sleep(step);
  }
  return pred();
}

test("E2E [A]: 3 projekty × 1 task → 3 paralelní sloty (3/3), dokončení → uvolnění", async () => {
  // Fixture: 3 projekty, každý 1 otevřený task (žádná same-project závislost).
  for (const n of [1, 2, 3]) {
    fixture(`__e2e_p_${n}`);
    writeRoadmapFor(`__e2e_p_${n}`, 1); // každý projekt přesně 1 task
  }
  executor.resetExecutionState();
  // Pro důkaz 3-slotového souběhu musí delay přesáhnout cooldown stagger
  // (launch v t=0, 2000, 4000) — jinak by se tasky dokončily dřív, než naběhne 3. slot.
  process.env.EXECUTOR_MOCK_DELAY_MS = "5500";
  try {
    for (const n of [1, 2, 3]) {
      const added = executor.enqueueProjectTasks(`__e2e_p_${n}`);
      assert.strictEqual(added, 1, `projekt ${n} má 1 task`);
    }
    executor.startQueueWorker();

    // Všechy 3 sloty se naplní paralelně (3 různé projekty).
    // Čteme stav ATOMICALLY uvnitř waitFor — mezi waitFor a čtením s3 by se
    // sloty mohly uvolnit (tasky dokončí), což dělalo test flaky.
    let s3 = null;
    const filled = await waitFor(() => {
      const s = executor.getQueueState();
      if (s.active.length === 3 && s.slots.used === 3) {
        s3 = s; // zachyť stav v momentě, kdy je plný
        return true;
      }
      return false;
    }, 30000);
    assert.ok(filled, "3 projekty měly běžet paralelně (3/3 sloty)");
    assert.strictEqual(s3.slots.used, 3);
    assert.strictEqual(s3.slots.total, 3);
    // 3 RŮZNÉ projekty → žádný se nepočítá do MAX_PER_PROJECT
    const projects = new Set(s3.active.map((a) => a.project));
    assert.strictEqual(projects.size, 3, "3 různé projekty najednou");

    // Dokončení → sloty se uvolní. Čekáme na dokončení SVÝCH tasků (p_1/2/3),
    // ne na globální stav — test [B]/[C] enqueue tasky do stejného executionState,
    // takže active.length nikdy není 0 (test pollution).
    const myProjects = new Set(["__e2e_p_1", "__e2e_p_2", "__e2e_p_3"]);
    const drained = await waitFor(() => {
      const s = executor.getQueueState();
      const myActive = s.active.filter((a) => myProjects.has(a.project));
      return myActive.length === 0;
    }, 60000);
    assert.ok(drained, "všechny tasky dokončeny a sloty uvolněny");
    assert.strictEqual(executor.getQueueState().workerRunning, false);
  } finally {
    for (const n of [1, 2, 3]) cleanup(`__e2e_p_${n}`);
    executor.resetExecutionState();
    // Reset mock delay to avoid leaking to other tests
    delete process.env.EXECUTOR_MOCK_DELAY_MS;
  }
});

test("E2E [B]: 1 projekt s ≥3 tasky → SÉRIOVĚ (MAX_PER_PROJECT=1, adaptivní)", async () => {
  fixture("__e2e_single");
  writeRoadmapFor("__e2e_single", 4);
  executor.resetExecutionState();
  // Krátký delay pro rychlé sériové dokončení (cooldown stagger stále platí)
  process.env.EXECUTOR_MOCK_DELAY_MS = "300";
  try {
    const added = executor.enqueueProjectTasks("__e2e_single");
    assert.ok(added >= 3, `projekt má >=3 tasků (má ${added})`);
    executor.startQueueWorker();

    // Maximální souběh z JEDNOHO projektu nikdy nepřesáhne MAX_PER_PROJECT (1).
    // (Sledujeme po celou dobu — kdyby se někdy objevilo 2 z téhož projektu, fail.)
    let maxSameProject = 0;
    const end = Date.now() + 30000; // dostatek času na 4 sériové tasky s cooldown
    let drained = false;
    while (Date.now() < end) {
      const s = executor.getQueueState();
      if (s.active.length > 0) {
        const counts = {};
        for (const a of s.active) counts[a.project] = (counts[a.project] || 0) + 1;
        maxSameProject = Math.max(maxSameProject, counts["__e2e_single"] || 0);
      }
      if (s.active.length === 0 && s.queueLength === 0) { drained = true; break; }
      await sleep(40);
    }
    assert.ok(drained, "všechy same-project tasky dokončeny");
    // Adaptivní řízení: z jednoho projektu NEVÍCE 1 najednou (bezpečné, ne deadlock).
    assert.ok(maxSameProject <= 1, `same-project souběh neměl přesáhnout 1 (bylo ${maxSameProject})`);
  } finally {
    cleanup("__e2e_single");
    executor.resetExecutionState();
    // Reset mock delay to avoid leaking to other tests
    delete process.env.EXECUTOR_MOCK_DELAY_MS;
  }
});

test("E2E [C]: tasky se odškrtnou v ROADMAP po dokončení", async () => {
  fixture("__e2e_mark");
  writeRoadmapFor("__e2e_mark", 2);
  executor.resetExecutionState();
  // Krátký delay pro rychlé dokončení
  process.env.EXECUTOR_MOCK_DELAY_MS = "300";
  try {
    executor.enqueueProjectTasks("__e2e_mark");
    executor.startQueueWorker();
    await waitFor(() => {
      const s = executor.getQueueState();
      return s.active.length === 0 && s.queueLength === 0;
    }, 12000); // adaptivní řízení: tasky ze stejné fáze běží sekvenčně (cooldown 2s)
    const roadmap = fs.readFileSync(path.join(PROJECTS_DIR, "__e2e_mark", "ROADMAP.md"), "utf8");
    assert.strictEqual((roadmap.match(/- \[x\]/g) || []).length, 2, "2 tasky odškrtnuté");
    assert.strictEqual((roadmap.match(/- \[ \]/g) || []).length, 0, "žádný nezbyvá");
  } finally {
    cleanup("__e2e_mark");
    executor.resetExecutionState();
    // Reset mock delay to avoid leaking to other tests
    delete process.env.EXECUTOR_MOCK_DELAY_MS;
  }
});

// pomocné: zapíše roadmapu s `count` otevřenými tasky do daného projektu
function writeRoadmapFor(project, count) {
  const dir = path.join(PROJECTS_DIR, project);
  fs.mkdirSync(dir, { recursive: true });
  const tasks = [];
  for (let i = 1; i <= count; i++) tasks.push(`- [ ] Task ${i}: ukázkový task pro ${project}`);
  writeRoadmapForFile(dir, tasks);
}
function writeRoadmapForFile(dir, lines) {
  fs.writeFileSync(path.join(dir, "ROADMAP.md"), "# ROADMAP\n\n## Fáze A\n" + lines.join("\n") + "\n", "utf8");
}
