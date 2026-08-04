# Sovereign Command Center

A dark, minimal operational dashboard for the Sovereign OS. It gives a real-time pulse over local Git projects, an agent pipeline, logs, and Paparazzi captures.

## What this project is

Sovereign Dashboard is the central nervous system of the Sovereign OS workspace. It replaces scattered terminal checks with a single command center where you can:

- **Pulse** — see every Git project under `~/projects`, its last commit, branch, dirty state, and latest message.
- **Pipeline** — view queued tasks and priorities.
- **Agents** — inspect manifest and log output from each Sovereign workspace agent.
- **Log** — read the running operational log of milestones, victories, and struggles.
- **Project detail** — drill into a single project for its recent Git history and stored bug tickets.

The frontend is a React + Vite + Tailwind CSS single-page app. The backend is a small Express API that reads the local filesystem and Git state.

## How to run it

Install dependencies once:

```bash
npm install
```

Start the frontend dev server:

```bash
npm run dev
```

The UI will be available at http://localhost:8890.

Start the API server (in a separate terminal):

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
    ├── components/
    │   ├── Pulse.jsx       # Live Git project grid (calls /api/projects)
    │   ├── Pipeline.jsx    # Static task pipeline view
    │   ├── Agents.jsx      # Agent workspace viewer
    │   ├── Log.jsx         # Sovereign log view
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
| GET | `/api/paparazzi` | List Paparazzi captures from iCloud |
| POST | `/api/bugs` | Create a bug ticket in a project |
| PATCH | `/api/bugs/:project/:id` | Update bug status |

### Notes

- The frontend expects the API at `http://localhost:8891`. CORS is enabled.
- Project status is derived from `git status --short` (`ok` = clean, `warn` = dirty).
- Bug tickets are stored as JSON files under each project's `bugs/` directory.
- Paparazzi captures are read from `~/Library/Mobile Documents/com~apple~CloudDocs/Paparazzi`.
