# Roadmap — Paralelní exekuce roadmap (3 sloty) + UI signalizace

**Cíl:** Umožnit až 3 paralelní exekuční sloty (agenti) v queue workeru.
Vše na jednom modelu (deepseek) — žádné kombinování modelů. UI konfigurovatelné.

**Status:** Phase 1-3 hotové, Phase 4 (validace + commit) v běhu.

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
- [ ] E2E manuální test: run-all na projektu s ≥3 tasky → 3 paralelní, sloty 3/3, disabled; dokončení → uvolnění
- [ ] Commit logické celky

## Odhad
- Phase 1: ~2-3 h
- Phase 2: ~1.5 h
- Phase 3: ~1.5 h
- Phase 4: ~1 h
- Celkem: ~6-8 h
