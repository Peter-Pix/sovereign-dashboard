# Sovereign Dashboard — API Reference

Base URL: `http://localhost:8891`

## Autentizace

Mutační endpointy (`POST`, `PATCH`) vyžadují auth token v hlavičce:

```
x-auth-token: <SOVEREIGN_AUTH_TOKEN>
```

Token se konfiguruje v `.env` (`SOVEREIGN_AUTH_TOKEN`). Bez tokenu vrací `401 Unauthorized`.

---

## Endpointy

### Health

#### `GET /health`
Vrací stav serveru.

**Response:**
```json
{ "status": "ok", "uptime": 123.45, "timestamp": "2026-08-24T00:00:00.000Z" }
```

---

### Projekty

#### `GET /api/projects`
Seznam všech Git projektů (s inkrementální cache).

**Response:** pole objektů:
```json
[
  {
    "name": "sovereign-dashboard",
    "health": 80,
    "activity": "hot",
    "lastHash": "abc1234",
    "lastMsg": "feat: ...",
    "lastCommitAgo": "2h",
    "branch": "main",
    "hasReadme": true,
    "readmeLines": 146,
    "todoCount": 3
  }
]
```

#### `GET /api/projects/:name`
Detail projektu + bug tickety.

**Response:** objekt projektu + `bugs` pole.

**Errors:** `400` (invalid name), `404` (project not found)

---

### Agenti

#### `GET /api/agents`
Seznam agentů s manifesty a logy.

**Response:** pole `{ name, manifest, log, workspacePath }`

#### `POST /api/agents/:name/run` 🔒
Spustí agenta (rate limited, max 2 paralelní).

**Body:** `{}` (volitelné)

**Response:** `{ success: true, text, tokens, agent }`

**Errors:** `401` (no auth), `404` (unknown agent), `429` (rate limit)

#### `POST /api/projects/:name/run-agent` 🔒
Spustí agenta na konkrétním projektu (Action Center).

**Body:** `{ "agent": "archivist" }` (default `archivist`)

**Response:** `{ success: true, text, agent, project }`

---

### Bugy

#### `POST /api/bugs` 🔒
Vytvoří bug ticket.

**Body:**
```json
{ "project": "my-project", "title": "Bug title", "description": "...", "severity": "medium" }
```

**Response:** bug objekt s `id`, `status: "open"`, `created`

#### `PATCH /api/bugs/:project/:id` 🔒
Aktualizuje bug (status, resolved).

**Body:** `{ "status": "resolved" }`

---

### Leady

#### `GET /api/leads`
Seznam leadů (deduplikovaných).

**Response:** pole lead objektů.

---

### Alerty

#### `GET /api/alerts`
Seznam alertů se souhrnem.

**Response:** `{ total, critical, warning, info, alerts: [...] }`

#### `POST /api/alerts/:id/ack` 🔒
Potvrdit alert (acknowledge).

#### `POST /api/alerts/:id/dismiss` 🔒
Zamítnout/odstranit alert.

#### `POST /api/alerts/run-check` 🔒
Spustit ruční kontrolu alertů.

---

### Konfigurace modelů

#### `GET /api/config/model`
Vrátí aktuálně nakonfigurovaný LLM model.

**Response:** `{ execModel, ollamaModel }`

#### `PUT /api/config/model` 🔒
Nastaví LLM modely.

**Body:** `{ "execModel": "ollama/minimax-m3:cloud", "ollamaModel": "..." }`

#### `POST /api/config/model/reset` 🔒
Resetuje model na default.

---

### MCP servery

#### `GET /api/mcp`
Seznam MCP serverů.

#### `POST /api/mcp` 🔒
Přidá MCP server.

#### `GET /api/mcp/:name`
Detail MCP serveru.

#### `PUT /api/mcp/:name` 🔒
Aktualizuje MCP server.

#### `DELETE /api/mcp/:name` 🔒
Odstraní MCP server.

#### `GET /api/mcp/:name/status`
Status připojení MCP serveru.

#### `POST /api/mcp/:name/probe` 🔒
Otestuje připojení (probe) MCP serveru.

#### `POST /api/mcp/probe-all` 🔒
Otestuje připojení všech MCP serverů.

---

### Admin — Rate limits

#### `GET /api/admin/rate-limits`
Vrátí stav rate limitů.

#### `PUT /api/admin/rate-limits` 🔒
Nastaví rate limity.

#### `POST /api/admin/rate-limits/reset-usage` 🔒
Resetuje využité kvóty rate limitů.

---

### Webhooks

#### `POST /api/webhooks/github` 🔒
Přijme GitHub webhook (push, PR, issues) a zpracuje ho.

---

### Soubory

#### `GET /api/files?p=<path>`
Čtení souboru nebo výpis adresáře (omezeno na allowed roots).

**Query:** `p` — absolutní cesta

**Response:**
- Adresář: `{ path, type: "directory", entries: [...] }`
- Soubor: raw content

**Errors:** `400` (missing p), `403` (path outside allowed roots), `404` (not found)

---

### Paparazzi

#### `GET /api/paparazzi`
Seznam captures (screenshoty).

**Response:** pole `{ filename, timestamp, tag, title }`

#### `GET /api/paparazzi/data`
Data collection (cache 5 min).

**Query:** `?refresh=1` vynutí nový sběr

**Response:** `{ projects, summary, system, cached }`

#### `GET /api/paparazzi/report`
Manažer Report — **SSE stream** (ne JSON).

**Query:** `?refresh=1` vynutí nové generování

**Response:** `text/event-stream` s eventy:
```
data: {"type":"metadata","summary":{...},"system":{...}}
data: {"type":"token","content":"Yo"}
data: {"type":"token","content":" Peter..."}
data: {"type":"done"}
```

#### `GET /api/paparazzi/history`
Historie reportů.

**Response:** pole `{ generatedAt, report, summary }`

#### `POST /api/paparazzi/capture` 🔒
Trigger capture request.

**Body:** `{ "url": "https://...", "project": "...", "tag": "AUTO", "title": "..." }`

---

### Roadmapy

#### `GET /api/roadmaps`
Seznam všech roadmap napříč projekty.

**Response:** pole:
```json
[
  {
    "project": "okeye",
    "file": "ROADMAP.md",
    "phases": [...],
    "totalCheckboxes": 12,
    "doneCheckboxes": 3,
    "progress": 25,
    "updatedAt": "2026-08-24T00:00:00.000Z"
  }
]
```

#### `GET /api/roadmaps/:project`
Detail roadmapy projektu (raw markdown + parsed).

**Response:** `{ project, roadmaps: [{ file, content, parsed }] }`

**Errors:** `400` (invalid name), `404` (no roadmap)

---

### Executor (autonomní exekuce)

#### `GET /api/executor/next/:project`
Další nehotový task v roadmapě projektu.

**Response:**
```json
{ "done": false, "project": "okeye", "task": "...", "agent": "archivist", "phase": "Fáze 1", "attempts": 0 }
```
nebo `{ "done": true, "message": "Všechny tasky hotové" }`

#### `GET /api/executor/state`
Stav exekuce (monitoring).

**Response:** `{ totalExecutions, maxTotal, stuckTasks, activeAttempts }`

#### `GET /api/executor/queue`
Stav fronty exekuce.

**Response:** `{ queueLength, current, active, slots, log, workerRunning, paused, budgetExhausted }`

#### `POST /api/executor/queue/:project` 🔒
Zařadí otevřené tasky projektu do fronty exekuce.

#### `POST /api/executor/queue/pause` 🔒
Pozastaví frontu exekuce (worker se zastaví).

#### `POST /api/executor/queue/resume` 🔒
Obnoví pozastavenou frontu exekuce.

#### `POST /api/executor/process/pause` 🔒
Pozastaví jeden task/agenta (per-process kill).

**Body:** `{ "key": "..." }` — key tasku

#### `POST /api/executor/process/resume` 🔒
Obnoví pozastavený task.

**Body:** `{ "key": "..." }`

#### `POST /api/executor/project/pause` 🔒
Pozastaví všechny tasky daného projektu.

**Body:** `{ "project": "..." }`

#### `POST /api/executor/run/:project` 🔒
Spustí dokončení jednoho tasku.

**Response:** `{ success, task, agent, marked, result }`

#### `POST /api/executor/reset` 🔒
Resetuje exekuční stav (nová session).

---

## Loop Protection (Executor)

Executor má 4 vrstvy ochrany proti zacyklení:

| Limit | Hodnota | Popis |
|-------|---------|-------|
| `MAX_TASKS_PER_RUN` | 5 | Max tasků v jedné dávkové exekuci projektu |
| `MAX_RETRIES_PER_TASK` | 1 | Max pokusů na jeden task |
| `MAX_TOTAL_EXECUTIONS` | 20 | Globální budget za session |
| `COOLDOWN_MS` | 2000 | Min interval mezi exekucemi |

Tasky, které se nepodaří odškrtnout, se označí jako "stuck" a přeskočí se (žádný nekonečný loop).

---

## Chybové kódy

| Kód | Význam |
|-----|--------|
| `400` | Invalid input (name, path) |
| `401` | Chybí auth token |
| `403` | Path outside allowed roots |
| `404` | Not found (project, agent, roadmap) |
| `429` | Rate limit (paralelní exekuce) |
| `500` | Server error |
| `503` | Auth token není nakonfigurován |
