// ===== Projekty — Sběr dat a metadata =====
const fs = require("fs");
const path = require("path");
const { run } = require("./runner.cjs");

const SKIP_DIRS = /node_modules|\.git|dist|build|coverage/;

// In-memory cache pro seznam projektů
let projectCache = {
  data: [],
  lastMtime: 0,
};

function isSafeName(name) {
  return typeof name === "string" && /^[A-Za-z0-9._-]+$/.test(name);
}

function listProjectDirs() {
  const { PROJECTS_DIR } = require("../config.cjs");
  try {
    return fs.readdirSync(PROJECTS_DIR).filter((d) => {
      if (SKIP_DIRS.test(d)) return false;
      try {
        return fs.statSync(path.join(PROJECTS_DIR, d)).isDirectory() && fs.existsSync(path.join(PROJECTS_DIR, d, ".git"));
      } catch {
        return false;
      }
    });
  } catch (e) {
    console.error("[Projects] Error listing dirs:", e.message);
    return [];
  }
}

// Pomocná funkce: čti git metadata (commit timestamp, hash, message, branch)
async function getGitMeta(projectDir) {
  // Vše v jednom `git log -1` hovoru pro efektivitu
  const out = await run(
    `git -C "${projectDir}" log -1 --format="%ct|%H|%s" 2>/dev/null`,
    3000
  );
  if (!out) return null;
  const parts = out.split("|");
  if (parts.length < 3) return null;
  const timestamp = parseInt(parts[0], 10);
  const hash = parts[1];
  const message = parts.slice(2).join("|").slice(0, 120);
  if (isNaN(timestamp)) return null;

  // Branch ref
  const branchOut = await run(
    `git -C "${projectDir}" rev-parse --abbrev-ref HEAD 2>/dev/null`,
    3000
  );

  // Dirty check (1 = dirty, 0 = clean)
  const dirtyOut = await run(
    `git -C "${projectDir}" status --porcelain 2>/dev/null | wc -l | tr -d ' '`,
    3000
  );

  return {
    timestamp,
    hashShort: hash.slice(0, 7),
    message,
    branch: branchOut || "main",
    dirty: parseInt(dirtyOut || "0", 10) > 0,
  };
}

// Formátuje relativní čas ("3 days ago", "Recently")
function formatRelativeAge(timestampMs) {
  const now = Date.now();
  const ageMs = now - timestampMs;
  if (ageMs < 0) return "in the future";
  const minutes = Math.floor(ageMs / (1000 * 60));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

async function getProjectInfo(name, options = {}) {
  const { PROJECTS_DIR } = require("../config.cjs");
  const p = path.join(PROJECTS_DIR, name);
  if (!fs.existsSync(p)) return null;

  // Bug 2: Activity z git commit timestamp, ne z mtime adresáře
  const git = await getGitMeta(p);

  // Logs (posledních 10)
  let logs = [];
  if (options.withLog) {
    try {
      const logRaw = fs.readFileSync(path.join(p, "agent.log"), "utf8");
      logs = logRaw.trim().split("\n").filter(Boolean).slice(-10);
    } catch {}
  }

  const hasReadme = fs.existsSync(path.join(p, "README.md"));
  const readmeLines = hasReadme ? fs.readFileSync(path.join(p, "README.md"), "utf8").split("\n").length : 0;

  let todoCount = 0;
  const bugsDir = path.join(p, "bugs");
  try {
    if (fs.existsSync(bugsDir)) {
      todoCount = fs.readdirSync(bugsDir).filter(f => f.endsWith(".json")).length;
    }
  } catch {}

  // Health score: čistý tree + README + bugy + aktivita
  let health = 50;
  if (git && typeof git.timestamp === "number" && !isNaN(git.timestamp)) {
    const ageDays = (Date.now() - git.timestamp * 1000) / (1000 * 60 * 60 * 24);
    health += Math.max(0, 30 - ageDays); // aktivní projekty dostanou +až 30
    if (git.dirty) health -= 15; // dirty penalizace
  } else {
    health = 30; // žádná git metadata → projekt podezřelý
  }
  if (hasReadme) {
    health += readmeLines >= 5 ? 20 : 10;
  }
  if (todoCount === 0) health += 10;
  health = Math.max(0, Math.min(100, health));

  // Bug 2: Activity z git commit age, ne z directory mtime
  let activity = "idle";
  if (git) {
    const ageDays = (Date.now() - git.timestamp * 1000) / (1000 * 60 * 60 * 24);
    if (ageDays < 1) activity = "hot";
    else if (ageDays < 7) activity = "active";
    else if (ageDays < 30) activity = "slow";
  }

  return {
    name,
    health,
    activity,
    lastHash: git?.hashShort || "—",
    lastMsg: git?.message || "No commits",
    lastCommitAgo: git ? formatRelativeAge(git.timestamp * 1000) : "unknown",
    branch: git?.branch || "main",
    hasReadme,
    readmeLines,
    todoCount,
    log: logs,
    dirty: git?.dirty || false,
  };
}

async function collectProjectData(name) {
  return await getProjectInfo(name);
}

function summarizeProjects(projects) {
  const counts = { total: 0, hot: 0, dirty: 0, undocumented: 0, idle: 0 };
  const summary = [];

  projects.forEach(p => {
    counts.total++;
    if (p.activity === "hot") counts.hot++;
    if (p.activity === "idle") counts.idle++;
    if (p.dirty) counts.dirty++;
    if (!p.hasReadme) counts.undocumented++;
  });

  summary.push(`Ekosystém obsahuje ${counts.total} aktivních projektů.`);
  if (counts.hot > 0) summary.push(`${counts.hot} projektů vykazuje vysokou aktivitu (🔥).`);
  if (counts.idle > 0) summary.push(`${counts.idle} projektů je neaktivních (💤).`);
  if (counts.dirty > 0) summary.push(`${counts.dirty} projektů má špinavý working tree.`);
  if (counts.undocumented > 0) summary.push(`${counts.undocumented} projektů postrádá dokumentaci.`);

  return { counts, summary, generatedAt: new Date().toISOString() };
}

async function getProjectsCached() {
  const { PROJECTS_DIR } = require("../config.cjs");
  const rootStats = fs.statSync(PROJECTS_DIR);

  if (projectCache.lastMtime === rootStats.mtimeMs && projectCache.data.length > 0) {
    return projectCache.data;
  }

  const dirs = listProjectDirs();
  const results = await Promise.allSettled(dirs.map(d => getProjectInfo(d)));
  const data = results.filter(r => r.status === "fulfilled" && r.value).map(r => r.value);

  projectCache = { data, lastMtime: rootStats.mtimeMs };
  return data;
}

module.exports = {
  isSafeName,
  listProjectDirs,
  getProjectInfo,
  collectProjectData,
  summarizeProjects,
  getProjectsCached,
  SKIP_DIRS,
};
