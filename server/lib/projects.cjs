// ===== Projektová data (git + filesystem) =====
const fs = require("fs");
const path = require("path");
const { run } = require("./runner.cjs");
const config = require("../config.cjs");

function isSafeName(name) {
  return typeof name === "string" && name.length > 0 && name.length <= config.MAX_NAME_LEN && config.SAFE_NAME_RE.test(name);
}

function listProjectDirs() {
  return fs.readdirSync(config.PROJECTS_DIR).filter((d) => {
    if (!isSafeName(d)) return false;
    try {
      return fs.statSync(path.join(config.PROJECTS_DIR, d)).isDirectory() && fs.existsSync(path.join(config.PROJECTS_DIR, d, ".git"));
    } catch { return false; }
  });
}

async function getProjectInfo(name, { withLog = false } = {}) {
  const p = path.join(config.PROJECTS_DIR, name);
  const git = (cmd) => run(`cd "${p}" && ${cmd} 2>/dev/null`, 4000);

  const [lastCommit, branch, status, lastHash, lastMsg, log] = await Promise.allSettled([
    git("git log -1 --format=%cd --date=relative"),
    git("git branch --show-current"),
    git("git status --short"),
    git("git log -1 --format=%h"),
    git("git log -1 --format=%s"),
    withLog ? git("git log --oneline -10") : Promise.resolve(""),
  ]);
  const val = (r) => (r.status === "fulfilled" ? r.value : "");

  const dirty = val(status).length > 0;

  const info = {
    name,
    lastCommit: val(lastCommit) || "unknown",
    branch: val(branch) || "unknown",
    dirty,
    lastHash: val(lastHash) || "unknown",
    lastMsg: val(lastMsg) || "unknown",
    status: dirty ? "warn" : "ok",
  };
  if (withLog) info.log = val(log).split("\n").filter(Boolean);
  return info;
}

const SKIP_DIRS = /^(old_|openclaw-backup|.*\.bak|.*backup|node_modules|dist|\.next|\.cache|\.content-cache)/i;
const EXCLUDE_DIRS = [
  "--exclude-dir=node_modules",
  "--exclude-dir=.git",
  "--exclude-dir=.next",
  "--exclude-dir=dist",
  "--exclude-dir=.cache",
  "--exclude-dir=.content-cache",
  "--exclude-dir=build",
  "--exclude-dir=.turbo",
].join(" ");

async function countSourceFiles(p) {
  const out = await run(
    `find "${p}" -type f \\( -name '*.js' -o -name '*.jsx' -o -name '*.ts' -o -name '*.tsx' -o -name '*.cjs' -o -name '*.md' \\) -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/.next/*' -not -path '*/dist/*' 2>/dev/null | wc -l`,
    2500,
  );
  return parseInt(out, 10) || 0;
}

async function collectProjectData(name) {
  const p = path.join(config.PROJECTS_DIR, name);
  const git = (cmd) => run(`cd "${p}" && ${cmd} 2>/dev/null`, 4000);

  const [status, lastCommitAgo, lastCommitDate, lastHash, lastMsg, branch, commits7d, commits30d, authors, grepOut, srcCount] = await Promise.allSettled([
    git("git status --short"),
    git("git log -1 --format=%cd --date=relative"),
    git("git log -1 --format=%cd --date=iso"),
    git("git log -1 --format=%h"),
    git("git log -1 --format=%s"),
    git("git branch --show-current"),
    git("git log --oneline --since='7 days ago' 2>/dev/null | wc -l | tr -d ' '"),
    git("git log --oneline --since='30 days ago' 2>/dev/null | wc -l | tr -d ' '"),
    git("git log --format='%an' -5 2>/dev/null | sort -u | tr '\\n' ', "),
    run(`grep -rInE "TODO|FIXME|HACK|XXX" "${p}" ${EXCLUDE_DIRS} --include='*.js' --include='*.jsx' --include='*.ts' --include='*.tsx' --include='*.md' --include='*.cjs' 2>/dev/null | head -8`, 2500),
    countSourceFiles(p),
  ]);
  const val = (r) => (r.status === "fulfilled" ? r.value : "");

  const dirty = val(status).length > 0;

  let todos = [];
  if (val(grepOut)) {
    todos = val(grepOut)
      .split("\n")
      .filter(Boolean)
      .slice(0, 8)
      .map((l) => {
        const m = l.match(/([^:]+):(\d+):(.*)/);
        return m ? { file: m[1].replace(p + "/", ""), line: m[2], text: m[3].trim().slice(0, 80) } : null;
      })
      .filter(Boolean);
  }

  const hasReadme = ["README.md", "readme.md", "README"].some((f) => fs.existsSync(path.join(p, f)));
  const readmeLines = (() => {
    const f = ["README.md", "readme.md", "README"].find((f) => fs.existsSync(path.join(p, f)));
    if (!f) return 0;
    try { return fs.readFileSync(path.join(p, f), "utf8").split("\n").filter((l) => l.trim().length > 0).length; } catch { return 0; }
  })();

  let deps = 0, devDeps = 0, pkgName = "";
  const pkgPath = path.join(p, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      pkgName = pkg.name || "";
      deps = Object.keys(pkg.dependencies || {}).length;
      devDeps = Object.keys(pkg.devDependencies || {}).length;
    } catch {}
  }

  const srcFiles = parseInt(val(srcCount), 10) || 0;
  const activity = parseInt(val(commits30d), 10) || 0;
  const activityLabel = activity >= 10 ? "hot" : activity >= 3 ? "active" : activity >= 1 ? "slow" : "idle";

  const hasRecent = activity >= 1;
  const clean = !dirty;
  const documented = hasReadme && readmeLines >= 5;
  let health = 0;
  health += hasRecent ? 30 : 0;
  health += clean ? 25 : 0;
  health += documented ? 20 : 0;
  health += hasReadme ? 5 : 0;
  health += activity >= 3 ? 10 : activity >= 1 ? 5 : 0;
  health += todos.length === 0 ? 10 : Math.max(0, 10 - todos.length);
  health = Math.min(100, health);

  return {
    name,
    lastCommitAgo: val(lastCommitAgo),
    lastCommitDate: val(lastCommitDate),
    lastHash: val(lastHash),
    lastMsg: val(lastMsg),
    branch: val(branch),
    dirty,
    status: dirty ? "warn" : "ok",
    commits7d: parseInt(val(commits7d), 10) || 0,
    commits30d: activity,
    authors: val(authors).replace(/,\s*$/, ""),
    todos,
    todoCount: todos.length,
    hasReadme,
    readmeLines,
    pkgName,
    deps,
    devDeps,
    srcFiles,
    activity: activityLabel,
    health,
  };
}

function summarizeProjects(projects) {
  const total = projects.length;
  const hot = projects.filter((p) => p.activity === "hot");
  const active = projects.filter((p) => p.activity === "active");
  const slow = projects.filter((p) => p.activity === "slow");
  const idle = projects.filter((p) => p.activity === "idle");
  const dirty = projects.filter((p) => p.dirty);
  const undocumented = projects.filter((p) => !p.hasReadme);
  const highTodo = projects.filter((p) => p.todoCount >= 5);

  const lines = [];
  lines.push(`Sleduji ${total} projektů. ${hot.length} žhavých, ${active.length} aktivních, ${slow.length} pomalejších, ${idle.length} idle.`);
  if (hot.length) lines.push(`🔥 Žhavé: ${hot.map((p) => p.name).join(", ")}.`);
  if (dirty.length) lines.push(`⚠️ Dirty working tree: ${dirty.map((p) => p.name).join(", ")}.`);
  if (undocumented.length) lines.push(`📄 Bez README: ${undocumented.map((p) => p.name).join(", ")}.`);
  if (highTodo.length) lines.push(`🧹 Naskládáno TODO: ${highTodo.map((p) => `${p.name} (${p.todoCount})`).join(", ")}.`);
  if (slow.length) lines.push(`🕸️ Pomalu aktivní: ${slow.map((p) => p.name).join(", ")}.`);

  if (lines.length === 1) lines.push("Všechny projekty jsou čisté a aktivní. Nic urgentního.");

  return {
    generatedAt: new Date().toISOString(),
    counts: { total, hot: hot.length, active: active.length, slow: slow.length, idle: idle.length, dirty: dirty.length, undocumented: undocumented.length },
    summary: lines,
  };
}

module.exports = {
  isSafeName,
  listProjectDirs,
  getProjectInfo,
  collectProjectData,
  summarizeProjects,
  SKIP_DIRS,
};
