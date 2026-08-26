# Roadmap — Paralelní exekuce roadmap (3 sloty) + UI signalizace

**Cíl:** Umožnit až 3 paralelní exekuční sloty (agenti) v queue workeru.
Vše na jednom modelu (deepseek) — žádné kombinování modelů. UI konfigurovatelné.

**Status:** Phase 1-4 hotové ✅ (validováno live API + E2E testem).

## Koncept
Fronta tasků zůstává. Worker pool bere až `MAX_CONCURRENT` (3) tasků najednou
místo jednoho. Stav: `active[]` (všichni běžící) místo jediného `current`.
`canRun` = `slots.used < slots.total` → když `used === total`, UI tlačítka disabled.

## Phase 1 — Backend: paralelní pool (backend)
- [x] `executor.cjs`: pool worker (max 3 souběžné `runTaskAgent`), `active: []`, `modelForAgent` (vše = deepseek), `runTaskAgent(..., model)`
- [x] `config.cjs`: `EXEC_CONCURRENCY`, default exec model = deepseek
- [x] `/api/executor/state`: `slots{total,used}`, `active[]`, `perProject{running}` — ověřeno live (3/3 sloty)
- [x] Testy: 21 executor testů pass (pool + model mapping)

## Phase 2 — Frontend: Roadmap hlavní stránka
- [x] `Roadmaps.jsx`: badge "N běží" na kartě; detail panel ukazuje VŠECHNY aktivní tasky, `used/total` sloty, disabled tlačítko při `used===total`

## Phase 3 — ProjectDetail + Pulse
- [x] `ProjectDetail.jsx`: blok "Aktivní exekuce" — tasky + sloty + tlačítko (disabled když všechny sloty)
- [x] `Pulse.jsx`: badge "N agent běží" na kartách; disabled řízen globální obsazeností

## Phase 4 — validace + commit
- [x] E2E manuální test: run-all na projektu s ≥3 tasky → 3 paralelní, sloty 3/3, disabled; dokončení → uvolnění
  - **Výsledek (live API + automatický E2E test `tests/e2e-parallel-execution.test.cjs`):**
  - ✅ **3-slotový pool funguje KŘÍŽOVĚ-PROJEKTOVĚ**: 3 projekty × 1 task → 3/3 sloty, `canRun=false` (disabled), dokončení → uvolnění (0/3).
  - ⚠️ **Adaptivní řízení (záměrné)**: run-all na JEDNOM projektu s ≥3 tasky NEJDE do 3/3 — tasky z jednoho projektu běží sériově (`MAX_PER_PROJECT=1`, konkurují si na souborech). Slots 2/3 max (1/projekt), nikdy 3 z jednoho projektu.
  - ✅ Dokončení odškrtne task v ROADMAP (`[x]`).
  - Automatický E2E test: 3/3 pass (A: cross-project paralelita, B: same-project serializace, C: odškrtnutí). Commit `cc75e8f`.
- [x] Commit logické celky (adaptivní scheduler `b6ec476`, UI `fdb3522`, unit testy `0a93048`, E2E test `cc75e8f`)

## Odhad
- Phase 1: ~2-3 h
- Phase 2: ~1.5 h
- Phase 3: ~1.5 h
- Phase 4: ~1 h
- Celkem: ~6-8 h
