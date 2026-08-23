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
│   │   ├── projects.cjs    # Sběr dat o Git projektech + cache
│   │   ├── system.cjs      # Systémový monitoring (CPU/RAM/disk)
│   │   ├── paparazzi.cjs   # LLM integrace + sběr dat + prompt
│   │   ├── agents.cjs      # Definice agentů + exekuce přes OpenClaw
│   │   ├── roadmaps.cjs    # Parsování ROADMAP.md/PLAN.md
│   │   ├── executor.cjs    # Autonomní dokončování tasků + loop protection
│   │   └── runner.cjs      # (legacy) runner
│   └── routes/             # Express routes (register(app, deps) vzor)
│       ├── projects.cjs    # /api/projects
│       ├── agents.cjs      # /api/agents + run-agent
│       ├── bugs.cjs        # /api/bugs
│       ├── files.cjs       # /api/files (dir listing)
│       ├── leads.cjs       # /api/leads
│       ├── paparazzi.cjs   # /api/paparazzi/*
│       ├── roadmaps.cjs    # /api/roadmaps
│       ├── executor.cjs    # /api/executor/*
│       └── health.cjs      # /health
├── src/
│   ├── App.jsx             # Tab shell + routing + clock
│   ├── config.js           # API base URL + auth + client cache
│   └── components/
│       ├── Pulse.jsx       # Git projekt grid
│       ├── Pipeline.jsx    # Task pipeline + exekuce
│       ├── Leads.jsx       # Scout leady
│       ├── Agents.jsx      # Agent workspace viewer
│       ├── Paparazzi.jsx   # Orchestrátor (96 řádků)
│       ├── Roadmaps.jsx    # Roadmapy + autonomní exekuce
│       ├── Log.jsx         # Operační log
│       ├── ProjectDetail.jsx
│       └── paparazzi/      # Subkomponenty Paparazzi
│           ├── Overview.jsx    # Report + summary + systém + karty
│           ├── Captures.jsx    # Foto view + filtr
│           ├── ProjectCard.jsx # Karta projektu + Action Center
│           ├── History.jsx     # Historie reportů
│           ├── SystemGauge.jsx # CPU/RAM/disk gauge
│           ├── Stat.jsx        # Stat + MiniStat
│           └── constants.js    # Sdílené konstanty
├── tests/                  # Unit + integration testy (node:test)
│   ├── unit.test.cjs       # 12 testů čistých funkcí
│   └── integration.test.cjs # 17 testů API endpointů
└── e2e/                    # Playwright e2e testy (25 testů)
```

## Testy

```bash
npm run test:unit         # 12 unit testů (čisté funkce)
npm run test:integration  # 17 integration testů (API endpointy)
npm run test:all          # unit + integration dohromady
npm run test:e2e          # 24 e2e testů (Playwright, bez @slow)
npm run test:e2e:slow     # pomalé testy (reálná exekuce agenta)
```

**Celkem 54 testů** na 3 vrstvách (unit → integration → e2e).

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
