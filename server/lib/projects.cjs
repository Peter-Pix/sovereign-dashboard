// ===== Projekty — Sběr dat a metadata =====
const fs = require("fs");
const path = require("path");

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

async function getProjectInfo(name, options = {}) {
  const { PROJECTS_DIR } = require("../config.cjs");
  const p = path.join(PROJECTS_DIR, name);
  try {
    const stats = fs.statSync(p);
    const lastCommit = fs.readFileSync(path.join(p, ".git/HEAD"), "utf8").trim();
    const hash = lastCommit.startsWith("ref:") ? lastCommit.split(" ")[1] : lastCommit;
    const hashShort = hash.slice(0, 7);

    // Zjednodušený sběr logů (posledních 10)
    let logs = [];
    if (options.withLog) {
      try {
        const logRaw = fs.readFileSync(path.join(p, "agent.log"), "utf8");
        logs = logRaw.trim().split("\n").filter(Boolean).slice(-10);
      } catch {}
    }

    // Health score (simulace na základě existence README a počtu TODO)
    const hasReadme = fs.existsSync(path.join(p, "README.md"));
    const readmeLines = hasReadme ? fs.readFileSync(path.join(p, "README.md"), "utf8").split("\n").length : 0;
    
    let todoCount = 0;
    const bugsDir = path.join(p, "bugs");
    if (fs.existsSync(bugsDir)) {
      todoCount = fs.readdirSync(bugsDir).filter(f => f.endsWith(".json")).length;
    }

    const health = Math.max(0, Math.min(100, 100 - (todoCount * 10) + (hasReadme ? 10 : 0)));

    // Aktivita (simulace z mtime)
    const now = Date.now();
    const age = now - stats.mtimeMs;
    let activity = "idle";
    if (age < 1000 * 60 * 60 * 24) activity = "hot"; // 1 den
    else if (age < 1000 * 60 * 60 * 24 * 7) activity = "active"; // 1 týden
    else if (age < 1000 * 60 * 60 * 24 * 30) activity = "slow"; // 1 měsíc

    return {
      name,
      health,
      activity,
      lastHash: hashShort,
      lastMsg: "Last commit updated", // Zjednodušeno proL speed
      lastCommitAgo: "Recently",
      branch: "main",
      hasReadme,
      readmeLines,
      todoCount,
      log: logs,
      dirty: false,
    };
  } catch (e) {
    return null;
  }
}

async function collectProjectData(name) {
  return await getProjectInfo(name);
}

function summarizeProjects(projects) {
  const counts = { total: 0, hot: 0, dirty: 0, undocumented: 0 };
  const summary = [];
  
  projects.forEach(p => {
    counts.total++;
    if (p.activity === "hot") counts.hot++;
    if (p.dirty) counts.dirty++;
    if (!p.hasReadme) counts.undocumented++;
  });

  summary.push(`Ekosystém obsahuje ${counts.total} aktivních projektů.`);
  if (counts.hot > 0) summary.push(`${counts.hot} projektů vykazují vysokou aktivitu (🔥).`);
  if (counts.undocumented > 0) summary.push(`${counts.undocumented} projektů postrádá dokumentaci.`);

  return { counts, summary, generatedAt: new Date().toISOString() };
}

// --- Inkrementální Cache wrapper ---
async function getProjectsCached() {
  const { PROJECTS_DIR } = require("../config.cjs");
  const rootStats = fs.statSync(PROJECTS_DIR);
  
  if (projectCache.lastMtime === rootStats.mtimeMs) {
    return projectCache.data;
  }

  const dirs = listProjectDirs();
  const results = await Promise.allSettled(dirs.map(d => getProjectInfo(d)));
  const data = results.filter(r => r.status === "fulfilled" && r.value).map(r => r.value);
  
  projectCache = {
    data,
    lastMtime: rootStats.mtimeMs,
  };
  
  return data;
}

module.exports = {
  isSafeName,
  listProjectDirs,
  getProjectInfo,
  collectProjectData,
  summarizeProjects,
  getProjectsCached, // nový export
  SKIP_DIRS,
};
