# 📋 Roadmap Planner

Tento adresář je **vzor** pro plánovací pipeline. Reálně se `planner/` vytváří v **každém projektu**, který se plánuje (např. `<projekt>/planner/state.md`).

## Workflow (2 fáze + exekuce)

```
Archivist (audit) → Strategist (plán) → Builder (exekuce)
```

### Fáze 1: Archivist — strategický audit
- Projde projekt, zjistí **faktický stav** (co je hotové, co chybí, technický dluh, rizika)
- Zapíše do `<projekt>/planner/state.md`

### Fáze 2: Strategist — strategické plánování
- Přečte `state.md` od Archivista
- Navrhne roadmapu rozdělenou na **malé atomické tasky (~5 min)**
- Zapíše do `<projekt>/ROADMAP.md` (standardní formát)

### Fáze 3: Builder — exekuce
- Čte `ROADMAP.md`
- Bere tasky po jednom, dělá je, odškrtává `[x]`

## Předávací soubor: `state.md`

```markdown
# Stav projektu: <název>

## Co je hotové ✅
- [x] Základní struktura

## Co chybí / je rozbité ⚠️
- [ ] Platby (Stripe)

## Technický dluh 🧹
- [ ] TODO v auth.ts

## Pozorování / rizika 🔍
- Stripe klíč hardcoded
```

## Hlavní soubor: `ROADMAP.md`

```markdown
# Projekt: <název>

## Fáze A: Základ
- [ ] Přidat Stripe klíč do .env (5 min)
- [ ] Vytvořit /api/payments endpoint (5 min)
```

## Spuštění

Planner režim se spouští přes task s klíčovými slovy:
- **"planner audit"** → Archivist (zapíše `state.md`)
- **"planner roadmap"** → Strategist (zapíše `ROADMAP.md`)

Přes API:
```bash
# Spustit audit (Archivist)
curl -X POST "http://localhost:8891/api/executor/run/:project" \
  -H "x-auth-token: $TOKEN" \
  -d '{"task": "planner audit pro projekt X"}'

# Spustit plánování (Strategist)
curl -X POST "http://localhost:8891/api/executor/run/:project" \
  -H "x-auth-token: $TOKEN" \
  -d '{"task": "planner roadmap pro projekt X"}'
```
