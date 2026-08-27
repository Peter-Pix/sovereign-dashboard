# Sovereign Command Center

Dark, minimalistický operační dashboard pro **Sovereign OS** — centrální nervový systém, který nahrazuje roztroušené terminálové kontroly jediným command centerem.

## Co to je

Sovereign Dashboard dává real-time přehled nad lokálními Git projekty, agentním pipeline, logy, Paparazzi captures, roadmapami a **autonomní exekucí tasků**. Uzavírá kruh autonomního systému:

```
ROADMAP.md (task [ ])  →  Executor vybere agenta  →  Agent dokončí task  →  [x] odškrtnuto
```

## Záložky

| Záložka | Popis |
|---------|-------|
| **Pulse** | Všechny Git projekty pod `~/projects` — poslední commit, branch, dirty stav, health |
| **Pipeline** | Fronta tasků a priority + spouštění reálné agentní exekuce |
| **Leady** | Leady sesbírané Scout agentem (sektorové statistiky + filtrování) |
| **Agenti** | Manifesty a logy jednotlivých Sovereign agentů |
| **Paparazzi** | Data collector: captures (fotky) + reálná data o projektech + Manažer Report (LLM) |
| **Roadmapy** | Roadmapy projektů (čtené z `ROADMAP.md`/`PLAN.md`) + autonomní exekuce tasků |
| **Log** | Operační log milníků, vítězství a zápasů |

## Stack

- **Frontend:** React 19 + Vite + Tailwind CSS 4 (SPA)
- **Backend:** Express 5 (Node.js, CommonJS `.cjs`)
- **LLM:** Ollama (cloud modely, default `minimax-m3:cloud`)
- **Testy:** Node built-in `node:test` (unit + integration) + Playwright (e2e)

## Jak to spustit

```bash
npm install          # jednou
npm run dev          # frontend (3205) + backend (8891) dohromady
```

- **UI:** http://localhost:3205
- **API:** http://localhost:8891

Samostatně:

```bash
npm run server       # jen backend (node server/index.cjs)
npm run dev:frontend # jen frontend (vite --port 3205)
```

## Konfigurace

Vytvoř `.env` ze šablony (NIKDY necommitovat `.env`):

```bash
cp .env.example .env
# vygeneruj token: openssl rand -hex 32
```

| Proměnná | Popis | Default |
|----------|-------|---------|
| `SOVEREIGN_AUTH_TOKEN` | Auth token pro mutační endpointy | — (povinné) |
| `VITE_AUTH_TOKEN` | Stejný token pro frontend | — |
| `OLLAMA_URL` | Ollama API URL | `http://localhost:11434` |
| `OLLAMA_MODEL` | LLM model pro reporty | `minimax-m3:cloud` |

## Architektura

```
sovereign-dashboard/
├── server/
│   ├── index.cjs           # Bootstrap (126 řádků) — lepidlo, žádná logika
│   ├── config.cjs          # Konfigurace (porty, cesty, limity, LLM)
│   ├── lib/                # Business logika (čisté funkce + orchestrace)
│   │   ├── alerts.cjs      # Detekce a správa alertů (diskuse, chyby, systém)
│   │   ├── agents.cjs      # Definice agentů + exekuce přes OpenClaw
│   │   ├── contextBuilder.cjs # Sestavování kontextu pro agenty (task + environment)
│   │   ├── executor.cjs    # Autonomní dokončování tasků + loop protection
│   │   ├── githubWebhook.cjs # Příjem a zpracování GitHub webhooků
│   │   ├── gitHelper.cjs   # Git operace (clone, fetch, status) + cache
│   │   ├── logger.cjs      # Jednoduchý logger pro backend
│   │   ├── mcpManager.cjs  # MCP server integrace — připojení externích databází pro agenty
│   │   ├── modelStore.cjs  # Správa LLM modelů + routing (deepseek, minimax, nemotron)
│   │   ├── paparazzi.cjs   # LLM integrace + sběr dat + prompt (Archivist, KimiFix)
│   │   ├── projects.cjs    # Sběr dat o Git projektech + cache (mtime-based)
│   │   ├── rateLimiter.cjs # Rate limiting pro externí API (Ollama, GitHub)
│   │   ├── roadmapMerge.cjs # Dedup více .md roadmap souborů (neplýtvá tokeny)
│   │   ├── roadmapState.cjs # One source of truth pro roadmapy — stav, sloty, aktivní tasky
│   │   ├── roadmaps.cjs    # Parsování ROADMAP.md/PLAN.md na strukturovaná data
│   │   ├── selfCorrector.cjs # Sebekorekce agentů — detekce stuck tasků + retry
│   │   ├── streamUtils.cjs # Utility pro SSE streams (keep-alive, parsing)
│   │   ├── system.cjs      # Systémový monitoring (CPU/RAM/disk)
│   │   └── runner.cjs      # (legacy) runner
│   └── routes/             # Express routes (register(app, deps) vzor)
│       ├── alerts.cjs      # /api/alerts
│       ├── agents.cjs      # /api/agents + run-agent
│       ├── bugs.cjs        # /api/bugs
│       ├── executor.cjs    # /api/executor/*
│       ├── files.cjs       # /api/files (dir listing)
│       ├── githubWebhook.cjs # /api/github-webhook
│       ├── health.cjs      # /health
│       ├── leads.cjs       # /api/leads
│       ├── mcp.cjs         # /api/mcp
│       ├── models.cjs      # /api/models
│       ├── paparazzi.cjs   # /api/paparazzi/*
│       ├── projects.cjs    # /api/projects
│       ├── rateLimits.cjs  # /api/rate-limits
│       ├── roadmaps.cjs    # /api/roadmaps
│       └── selfCorrector.cjs # /api/self-corrector
├── src/
│   ├── App.jsx             # Tab shell + routing + clock
│   ├── config.js           # API base URL + auth + client cache
│   └── components/
│       ├── AgentStream.jsx # Komponenta pro zobrazování streamu agentova výstupu
│       ├── Agents.jsx      # Agent workspace viewer
│       ├── AlertBell.jsx   # Ikona se zvukem pro nové alerty
│       ├── AlertFeed.jsx   # Seznam posledních alertů
│       ├── CommandPalette.jsx # Vyhledávání a spouštění akcí (Cmd+K)
│       ├── ErrorBoundary.jsx # Zachytává chyby v komponentách a zobrazuje fallback UI
│       ├── ExecutionPanel.jsx # Panel zobrazující stav exekuce (aktivní/ukončené tasky)
│       ├── Leads.jsx       # Scout leady
│       ├── Markdown.jsx    # Bezpečné renderování Markdownu
│       ├── McpManager.jsx  # UI pro správu MCP serverů (připojení/odpojení)
│       ├── ModelSwitcher.jsx # Přepínač LLM modelů (deepseek, minimax, nemotron)
│       ├── Paparazzi.jsx   # Orchestrátor (96 řádků)
│       ├── ProjectDetail.jsx # Detail projektu + bug tickety + aktivní exekuce
│       ├── Roadmaps.jsx    # Roadmapy + autonomní exekuze (hlavní UI)
│       ├── Spinner.jsx     # Jednoduchý spinner pro načítání
│       ├── WebhookSettings.jsx # UI pro konfiguraci GitHub webhooků
│       └── paparazzi/      # Subkomponenty Paparazzi
│           ├── Overview.jsx    # Report + summary + systém + karty
│           ├── Captures.jsx    # Foto view + filtr
│           ├── ProjectCard.jsx # Karta projektu + Action Center
│           ├── History.jsx     # Historie reportů
│           ├── SystemGauge.jsx # CPU/RAM/disk gauge
│           ├── Stat.jsx        # Stat + MiniStat
│           └── constants.js    # Sdílené konstanty
├── tests/                  # Unit + integration + e2e testy (node:test + Playwright)
│   ├── alerts.test.cjs       # Alerty: detekce, správa, stream
│   ├── commandPalette.test.cjs # Command palette: vyhledávání, historie, akce
│   ├── contextBuilder.test.cjs # Kontext pro agenty: task + environment
│   ├── executor.test.cjs     # Executor: pool worker, adaptivní řízení, model routing
│   ├── githubWebhook.test.cjs # GitHub webhook: parsování, validace, akce
│   ├── integration.test.cjs  # API endpointy: projekty, agents, executor, health
│   ├── lifecycle.test.cjs    # Životní cyklus tasků: enqueue, start, pause, resume, done
│   ├── logger.test.cjs       # Logger: úrovně, formát, stream
│   ├── mcpManager.test.cjs   # MCP manager: připojení, konfigurace, zdroje
│   ├── modelStore.test.cjs   # Model store: routing, fallback, cache
│   ├── rateLimiter.test.cjs  # Rate limiter: token bucket, obnovení, blokování
│   ├── roadmapMerge.test.cjs # Dedup více .md souborů — exact + fuzzy shoda
│   ├── roadmapState.test.cjs # Roadmap state: aktivní tasky, sloty, per-project limity
│   ├── routes.test.cjs       # Route registrace, middleware, error handling
│   ├── selfCorrector.test.cjs # Sebekorekce: detekce stuck tasků, retry, cooldown
│   ├── sse.test.cjs          # SSE streamy: připojení, zprávy, restart
│   ├── unit.test.cjs         # Čisté funkce: normalizaci, parsing, validaci
│   ├── e2e-parallel-execution.test.cjs # Paralelní exekuce (3 sloty) + adaptivní řízení
│   └── e2e/                  # Playwright e2e testy (UI + API)
│       ├── homepage.spec.js          # UI: navigace, projekt grid, základní akce
│       ├── project-detail.spec.js    # UI: detail projektu, aktivní exekuce, bug tickety
│       └── roadmaps.spec.js          # UI: roadmapy, autonomní exekuze, sloty, tlačítka
```

## Testy

```bash
npm run test:unit         # Čisté funkce (normalizaci, parsing, validaci)
npm run test:integration  # API endpointy: projekty, agents, executor, health, atd.
npm run test:all          # unit + integration dohromady
npm run test:e2e          # Playwright e2e testy (bez @slow)
npm run test:e2e:slow     # pomalé testy (reálná exekuce agenta)
npm run test:lifecycle    # Životní cyklus tasků: enqueue, start, pause, resume, done
npm run test              # alias pro test:all
```

**Celkem 198 testů** na 3 vrstvách (unit + integration + e2e) ve 18 test souborech:
- **Unit + integration** (node:test): 16 souborů, 174 testů
  - alerts, commandPalette, contextBuilder, executor, githubWebhook, integration, lifecycle, logger, mcpManager, modelStore, rateLimiter, roadmapMerge, roadmapState, routes, selfCorrector, sse, unit
- **E2E** (Playwright): 2 soubory, 24 testů
  - e2e-parallel-execution (3 testy: paralelita, adaptivní řízení, odškrtnutí)
  - e2e/ (21 testů: UI navigace, projekt grid, detail projektu, roadmapy, autonomní exekuze)

```bash
# Spustit jen konkrétní test soubor
npm run test:unit           # jen unit.test.cjs
npm run test -- tests/executor.test.cjs   # jen executor testy
npm run test:e2e -- e2e/roadmaps.spec.js  # jen roadmaps e2e

# Spustit skupiny testů
npm run test:lifecycle      # lifecycle.test.cjs
npm run test -- tests/*.test.cjs | grep -E "pass|fail"  # shrnutí
```

## Klíčové vlastnosti

- **Inkrementální cache** — `/api/projects` <1ms (mtime-based)
- **SSE streaming** — Manažer Report se vypisuje token po tokenu
- **Loop protection** — Executor má retry limit, stuck detection, budget a cooldown
- **Optimistické UI** — bugy se přidávají instantně
- **Action Center** — spuštění agenta + VS Code deep link přímo z karty projektu

## Dokumentace

- **API reference:** viz [API.md](./API.md)
- **Paparazzi:** viz `PAPARAZZI.md` (pokud existuje)

## Poznámky

- Frontend očekává API na `http://localhost:8891` (override přes `VITE_API_URL`)
- Bug tickety se ukládají jako JSON do `bugs/` adresáře projektu
- Roadmapy se čtou přímo z `ROADMAP.md`/`PLAN.md` v každém repu (single source of truth)
- Paparazzi captures se čtou z `~/Library/Mobile Documents/com~apple~CloudDocs/Paparazzi`
