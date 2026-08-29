# Sovereign Command

Dark, minimalistický operační dashboard pro **Sovereign OS** — centrální rozhraní pro správu projektů, agentní exekuce a real-time monitoring.

## Co to je

Sovereign Command poskytuje real-time přehled nad lokálními projekty, autonomní exekucí tasků, agentní pipeline a daty z Paparazzi captures. Je to kontrolní vrstva nad celým Sovereign OS:

```
ROADMAP.md (task [ ])  →  Executor vybere agenta  →  Agent dokončí task  →  [x] odškrtnuto
```

## Záložky

| Záložka | Popis |
|---------|-------|
| **Projekty** | Srdce dashboardu: grid projektů, captures (screenshoty), Manažer Report (LLM) a detailní pohled do projektů |
| **Roadmapy** | Centrální pohled na tasky všech projektů + spouštění autonomní exekuce agentů |
| **Leady** | Sběr a analýza leadů z anotačních dat (Scout agent) |
| **Agenti** | Přehled manifestů, aktuálního stavu a logů jednotlivých Sovereign agentů |

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
| `OLLAMA_API_KEY` | Bearer token z ollama.com (cloud modely) | — |
| `EXEC_CONCURRENCY` | Max souběžných exekučních slotů | `3` |
| `EXEC_MEMORY_GUARD` | Paměťový guard proti OOM (1=aktivní, 0=vypnutý) | `1` |
| `EXEC_MIN_FREE_MB` | Min volná RAM pro spuštění dalšího agenta (MB) | `1500` |
| `EXEC_AGENT_MEM_MB` | Odhad paměti na 1 agenta (MB) | `250` |
| `SOVEREIGN_EXEC_MODEL` | Model pro exekuci | `ollama/deepseek-v4-flash:cloud` |
| `SOVEREIGN_SKIP_PROJECTS` | Projekty vyřazené z exekuce (čárkou) | — |

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
│   │   ├── mcpContext.cjs  # Sestavování MCP kontext sekce pro agenty (best-effort)
│   │   ├── mcpManager.cjs  # MCP server integrace — připojení externích databází pro agenty
│   │   ├── modelStore.cjs  # Správa LLM modelů + routing (deepseek, minimax, kimi, gemma)
│   │   ├── paparazzi.cjs   # LLM integrace + sběr dat + prompt (Archivist, KimiFix)
│   │   ├── projects.cjs    # Sběr dat o Git projektech + cache (mtime-based)
│   │   ├── rateLimitMiddleware.cjs # Rate limiting middleware (Express)
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
│       ├── models.cjs      # /api/config/model
│       ├── paparazzi.cjs   # /api/paparazzi/*
│       ├── projects.cjs    # /api/projects
│       ├── rateLimits.cjs  # /api/admin/rate-limits
│       └── roadmaps.cjs    # /api/roadmaps
├── src/
│   ├── main.jsx            # Entry point (React root)
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
│       ├── ModelSwitcher.jsx # Přepínač LLM modelů (deepseek, minimax, kimi, gemma)
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
├── tests/                  # Unit + integration testy (node:test)
│   ├── alerts.test.cjs       # Alerty: detekce, správa, stream
│   ├── commandPalette.test.cjs # Command palette: vyhledávání, historie, akce
│   ├── contextBuilder.test.cjs # Kontext pro agenty: task + environment
│   ├── e2e-parallel-execution.test.cjs # Paralelní exekuce (3 sloty) + adaptivní řízení (node:test, --test-concurrency=1)
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
│   └── unit.test.cjs         # Čisté funkce: normalizaci, parsing, validaci
└── e2e/                      # Playwright e2e testy (testDir dle playwright.config.mjs)
    ├── agent-execution.spec.mjs     # Exekuce agenta (stream, timeout, error states)
    ├── dashboard.spec.mjs           # UI: navigace, projekt grid, základní akce
    ├── error-states.spec.mjs        # UI: chybové stavy a fallbacky
    ├── paparazzi-api.spec.mjs       # Paparazzi API endpointy
    └── roadmaps-executor.spec.mjs   # UI/API: roadmapy, autonomní exekuce, sloty, tlačítka
planner/                   # Roadmap Planner — vzor pro plánovací pipeline
    └── README.md           # Workflow: Archivist (audit) → Strategist (plán) → Builder (exekuce)
```

## Testy

```bash
npm run test:unit         # Čisté funkce (normalizaci, parsing, validaci)
npm run test:integration  # API endpointy: projekty, agents, executor, health, atd.
npm run test:all          # unit + integration dohromady
npm run test:e2e          # Playwright e2e testy (bez @slow)
npm run test:e2e:slow     # pomalé testy (reálná exekuce agenta)
npm run test:lifecycle    # Životní cyklus tasků: enqueue, start, pause, resume, done
npm run test              # jen unit.test.cjs (node --test tests/unit.test.cjs)
```

**Celkem 198 testů** v 18 souborech `node:test` (`tests/*.test.cjs`):
  - alerts, commandPalette, contextBuilder, e2e-parallel-execution, executor, githubWebhook, integration, lifecycle, logger, mcpManager, modelStore, rateLimiter, roadmapMerge, roadmapState, routes, selfCorrector, sse, unit

**Plus 24 Playwright e2e testů** ve 4 souborech v `./e2e/` (testDir dle `playwright.config.mjs`):
  - agent-execution, dashboard, error-states, paparazzi-api, roadmaps-executor
  - spouští se přes `npm run test:e2e` (vylučuje `@slow` testy)

Z toho **`tests/e2e-parallel-execution.test.cjs`** (node:test) je automatický E2E test paralelní exekuce (3 testy: paralelita, adaptivní řízení, odškrtnutí) — běží s `--test-concurrency=1` (sdílený globální stav).

```bash
# Spustit jen konkrétní test soubor
npm run test:unit           # jen unit.test.cjs
npm run test -- tests/executor.test.cjs   # jen executor testy
npx playwright test roadmaps.spec.js     # jen roadmaps e2e (pokud soubor existuje)

# Spustit skupiny testů
npm run test:lifecycle      # lifecycle.test.cjs
npm run test -- tests/*.test.cjs | grep -E "pass|fail"  # shrnutí
npx playwright test agent-execution  # jen jeden e2e soubor
```

## Klíčové vlastnosti

- **Inkrementální cache** — `/api/projects` <1ms (mtime-based)
- **SSE streaming** — Manažer Report se vypisuje token po tokenu
- **Loop protection** — Executor má retry limit, stuck detection, budget a cooldown
- **Paměťový guard** — dynamicky omezí počet běžících agentů podle volné RAM (prevence OOM na 8GB mašině), přepínatelný přes `EXEC_MEMORY_GUARD`
- **Optimistické UI** — bugy se přidávají instantně
- **Action Center** — spuštění agenta + VS Code deep link přímo z karty projektu
- **Roadmap Planner** — Archivist + Strategist spolupracují na strategickém plánování: rozdělí cíl na malé atomické tasky (~5 min), které Builder čte a odškrtává

## Dokumentace

- **API reference:** viz [API.md](./API.md)
- **Paparazzi:** viz [PAPARAZZI.md](./PAPARAZZI.md)
- **Uživatelská příručka:** viz [USER_GUIDE.md](./USER_GUIDE.md)

## Poznámky

- Frontend očekává API na `http://localhost:8891` (override přes `VITE_API_URL`)
- Bug tickety se ukládají jako JSON do `bugs/` adresáře projektu
- Roadmapy se čtou přímo z `ROADMAP.md`/`PLAN.md` v každém repu (single source of truth)
- Paparazzi captures se čtou z `~/Library/Mobile Documents/com~apple~CloudDocs/Paparazzi`
