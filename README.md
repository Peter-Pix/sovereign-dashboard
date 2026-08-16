# Sovereign Command Center

A dark, minimal operational dashboard for the Sovereign OS. It gives a real-time pulse over local Git projects, an agent pipeline, logs, and Paparazzi captures.

## What this project is

Sovereign Dashboard is the central nervous system of the Sovereign OS workspace. It replaces scattered terminal checks with a single command center where you can:

- **Pulse** — see every Git project under `~/projects`, its last commit, branch, dirty state, and latest message.
- **Pipeline** — view queued tasks and priorities, and trigger real agent execution.
- **Leady** — browse leads collected by the Scout agent (sector stats + filtering).
- **Agents** — inspect manifest and log output from each Sovereign workspace agent.
- **Log** — read the running operational log of milestones, victories, and struggles.
- **Paparazzi** — data collector: prohlíží captures (fotky) + sbírá reálná data o projektech (git, aktivita, health, TODO) a sumarizuje je. Podrobnosti: `PAPARAZZI.md`.
- **Project detail** — drill into a single project for its recent Git history and stored bug tickets.

The frontend is a React + Vite + Tailwind CSS single-page app. The backend is a small Express API that reads the local filesystem and Git state.

## How to run it

Install dependencies once:

```bash
npm install
```

Start the frontend dev server and API together:

```bash
npm run dev
```

The UI will be available at http://localhost:3205.

The API server (started by `npm run dev`, or standalone):

```bash
node server/index.cjs
```

The API listens on http://localhost:8891.

## Architecture

```
sovereign-dashboard/
├── index.html              # Vite entry point
├── vite.config.js          # React + Tailwind Vite plugins
├── package.json            # Vite dev/build scripts, React 19, Express, Tailwind 4
├── server/
│   └── index.cjs           # Express API on port 8891
└── src/
    ├── App.jsx             # Tab shell, project detail routing, clock, header/footer
    ├── main.jsx            # React root
    ├── config.js           # Single source of truth for the API base URL
    ├── components/
    │   ├── Pulse.jsx       # Live Git project grid (calls /api/projects)
    │   ├── Pipeline.jsx    # Task pipeline + real agent execution
    │   ├── Leads.jsx       # Scout leads browser (sector stats + filter)
    │   ├── Agents.jsx      # Agent workspace viewer
    │   ├── Log.jsx         # Sovereign log view
    │   ├── Paparazzi.jsx   # Data collector overview + captures
    │   └── ProjectDetail.jsx # Project detail + bugs
    ├── data/
    │   └── sovereign-data.js # Static seed data for Pipeline and Log
    └── assets/             # Images and icons
```

### API surface

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projects` | List all Git projects under `~/projects` |
| GET | `/api/projects/:name` | Project detail with last 10 commits and bugs |
| GET | `/api/agents` | List Sovereign agent workspaces and logs |
| GET | `/api/leads` | List Scout leads (deduplicated across source files) |
| GET | `/api/paparazzi` | List Paparazzi captures from iCloud |
| GET | `/api/paparazzi/data` | Data collection: reálná data o projektech + shrnutí (cache 60s, `?refresh=1` vynutí) |
| POST | `/api/paparazzi/capture` | Trigger a Paparazzi snapshot request |
| POST | `/api/agents/:name/run` | Execute a Sovereign agent via OpenClaw |
| POST | `/api/bugs` | Create a bug ticket in a project |
| PATCH | `/api/bugs/:project/:id` | Update bug status |

### Notes

- The frontend expects the API at `http://localhost:8891` (configurable via `VITE_API_URL` in `src/config.js`). CORS is enabled.
- Project status is derived from `git status --short` (`ok` = clean, `warn` = dirty).
- Bug tickets are stored as JSON files under each project's `bugs/` directory.
- Paparazzi captures are read from `~/Library/Mobile Documents/com~apple~CloudDocs/Paparazzi`.
