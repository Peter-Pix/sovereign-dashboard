// ===== Unit testy pro Executor (lib/executor.cjs) =====
// Testuje: findTaskLine, normalizeTaskText, routeTaskToAgent, AGENT_ROUTING, LIMITS

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const {
  findTaskLine,
  normalizeTaskText,
  routeTaskToAgent,
  AGENT_ROUTING,
  LIMITS,
} = require("../server/lib/executor.cjs");

// ===== normalizeTaskText =====

test("normalizeTaskText: odstraní markdown formátování", () => {
  assert.strictEqual(
    normalizeTaskText("**Config** decoupling → `config/perspectives.json`"),
    "config decoupling → config/perspectives.json"
  );
});

test("normalizeTaskText: srazí mezery a lowercases", () => {
  assert.strictEqual(
    normalizeTaskText("  AHOJ   Světe  "),
    "ahoj světe"
  );
});

test("normalizeTaskText: prázdný text", () => {
  assert.strictEqual(normalizeTaskText(""), "");
  assert.strictEqual(normalizeTaskText("   "), "");
});

// ===== findTaskLine =====

test("findTaskLine: přesná shoda po normalizaci", () => {
  const lines = [
    "- [ ] Refactor authentication module",
    "- [ ] Add tests",
    "- [x] Done item",
  ];
  const idx = findTaskLine(lines, "Refactor authentication module");
  assert.strictEqual(idx, 0);
});

test("findTaskLine: case-insensitive", () => {
  const lines = ["- [ ] Audit API endpoint"];
  assert.strictEqual(findTaskLine(lines, "AUDIT api ENDPOINT"), 0);
});

test("findTaskLine: matchuje i hotové (x) checkboxes (bug fix)", () => {
  // Dřív se [x] skipovaly → pokud agent sám odškrtl task, markTaskDone vrátil
  // "stuck" i když byla práce hotová. Teď [x] matchuje (odškrtnutý = splněný).
  const lines = ["- [x] Hotový task", "- [ ] Teprve udělat"];
  assert.strictEqual(findTaskLine(lines, "Hotový task"), 0, "Měl by matchnout hotový");
  assert.strictEqual(findTaskLine(lines, "Teprve udělat"), 1);
});

test("findTaskLine: word-boundary match — krátké slovo matchne první výskyt (Bug A fix)", () => {
  const lines = [
    "- [ ] Ověřit, že `app.py` běží a čte ollama_logs.db",
    "- [ ] Spustit `app.py` v produkci",
    "- [ ] Refactor `app.py` na async",
  ];
  // Slovo "app.py" je v každém řádku — word-boundary matchne všechny.
  // Chování: vrátí PRVNÍ výskyt (deterministické). Důležité je, že se NEpoužívá
  // loose contains, takže "app" by matchnul každý řádek se slovem obsahujícím "app",
  // ale "app.py" matchne jen řádky s přesně tímto tokenem.
  const idx = findTaskLine(lines, "app.py");
  assert.strictEqual(idx, 0, "first exact word-boundary match");
});

test("findTaskLine: word-boundary chrání před false-positive na substringu", () => {
  const lines = [
    "- [ ] apple pie recipe",
    "- [ ] banana",
  ];
  // Hledám "app" — starý includes() matchnul "apple".
  // Word-boundary NEmatchne "apple" (protože "app" není celé slovo v "apple").
  assert.strictEqual(findTaskLine(lines, "app"), -1, "substring v jiném slově nesmí matchnout");
});

test("findTaskLine: vrátí -1 pro prázdný taskText", () => {
  assert.strictEqual(findTaskLine(["- [ ] foo"], ""), -1);
  assert.strictEqual(findTaskLine(["- [ ] foo"], null), -1);
});

test("findTaskLine: zvládne české znaky a backticks", () => {
  const lines = ["- [ ] Ověřit, že `app.py` běží a čte `ollama_logs.db`"];
  assert.strictEqual(findTaskLine(lines, "Ověřit, že `app.py` běží a čte `ollama_logs.db`"), 0);
});

test("findTaskLine: preferuje přesnou shodu před fallbackem", () => {
  const lines = [
    "- [ ] Refactor something", // fallback by matchnul
    "- [ ] Refactor authentication module", // přesná shoda
  ];
  const idx = findTaskLine(lines, "Refactor authentication module");
  assert.strictEqual(idx, 1);
});

// ===== routeTaskToAgent =====

test("routeTaskToAgent: klíčová slova", () => {
  assert.strictEqual(routeTaskToAgent("Najdi nové leady"), "scout");
  assert.strictEqual(routeTaskToAgent("Vytvoř pitch pro ADAR"), "strategist");
  assert.strictEqual(routeTaskToAgent("Opravit README"), "archivist");
  assert.strictEqual(routeTaskToAgent("Kontrola stavu systému"), "spine");
});

test("routeTaskToAgent: zvládá diakritiku (Bug F)", () => {
  // "Ověřit" bez diakritiky = "overit" — starý routing by hledal "kontrol", což tam není.
  // Nový routing normalizuje: "ověřit" → "overit" a "kontrol" je keyword, ale
  // "přehled" a "status" a "monitor" jsou spine keywordy.
  assert.strictEqual(routeTaskToAgent("Ověřit konzistenci CSV a DB"), "spine");
  assert.strictEqual(routeTaskToAgent("Zkontroluj logy"), "spine");
  assert.strictEqual(routeTaskToAgent("Přehled projektů"), "spine");
});

test("routeTaskToAgent: fallback na archivist", () => {
  assert.strictEqual(routeTaskToAgent("Nějaký random task"), "archivist");
  assert.strictEqual(routeTaskToAgent(""), "archivist");
});

// ===== AGENT_ROUTING konzistence =====

test("AGENT_ROUTING: všechna klíčová slova jsou lowercase bez diakritiky", () => {
  for (const route of AGENT_ROUTING) {
    for (const kw of route.keywords) {
      assert.strictEqual(kw, kw.toLowerCase(), `${kw} by mělo být lowercase`);
      // žádná diakritika
      assert.strictEqual(
        kw.normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
        kw,
        `${kw} by nemělo mít diakritiku (normalizuj předem)`
      );
    }
  }
});

// ===== LIMITS =====

test("LIMITS: obsahuje všechny potřebné konstanty", () => {
  assert.ok(typeof LIMITS.MAX_TASKS_PER_RUN === "number");
  assert.ok(typeof LIMITS.MAX_RETRIES_PER_TASK === "number");
  assert.ok(typeof LIMITS.MAX_TOTAL_EXECUTIONS === "number");
  assert.ok(typeof LIMITS.COOLDOWN_MS === "number");
  assert.ok(typeof LIMITS.AGENT_TIMEOUT_MS === "number");
  assert.ok(typeof LIMITS.MAX_LOG_ENTRIES === "number");
  assert.ok(typeof LIMITS.MAX_TASK_ATTEMPTS_MAP === "number");
  assert.ok(typeof LIMITS.MAX_STUCK_TASKS_SET === "number");
});

test("LIMITS: konzistentní logika MAX_RETRIES_PER_TASK (Bug J)", () => {
  // Logika v kódu: if (attempts > LIMITS.MAX_RETRIES_PER_TASK) continue;
  // Tedy MAX_RETRIES_PER_TASK = 1 znamená max 1 pokus (pokus #1: attempts=1, 1 > 1 = false → OK)
  // MAX_RETRIES_PER_TASK = 0 znamená žádný pokus (0 > 0 = false → OK, ALE pak se to opakuje)
  // Doporučení: v dokumentaci
  assert.ok(LIMITS.MAX_RETRIES_PER_TASK >= 0);
});

// ===== Phase 1: paralelní pool + model mapping =====
const {
  modelForAgent,
  getExecutionState,
  getQueueState,
} = require("../server/lib/executor.cjs");

test("Phase1: modelForAgent vrací EXEC_MODEL (vše na jednom modelu)", () => {
  const m = modelForAgent("archivist");
  assert.strictEqual(typeof m, "string");
  assert.ok(m.length > 0, "model name nesmí být prázdný");
});

test("Phase1: LIMITS.MAX_CONCURRENT je konfigurovatelné číslo", () => {
  assert.strictEqual(typeof LIMITS.MAX_CONCURRENT, "number");
  assert.ok(LIMITS.MAX_CONCURRENT >= 1);
});

test("Phase1: getExecutionState má slots + active + perProject", () => {
  const s = getExecutionState();
  assert.ok(s.slots, "slots chybí");
  assert.strictEqual(s.slots.total, LIMITS.MAX_CONCURRENT);
  assert.ok(Array.isArray(s.active), "active musí být pole");
  assert.ok(s.perProject && typeof s.perProject === "object", "perProject chybí");
  assert.strictEqual(typeof s.runningAgents, "number");
});

test("Phase1: getQueueState má slots + active", () => {
  const s = getQueueState();
  assert.ok(s.slots, "slots chybí");
  assert.strictEqual(s.slots.total, LIMITS.MAX_CONCURRENT);
  assert.ok(Array.isArray(s.active), "active musí být pole");
  assert.strictEqual(s.slots.used, s.active.length);
});
