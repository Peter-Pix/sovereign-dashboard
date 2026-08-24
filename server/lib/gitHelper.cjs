// server/lib/gitHelper.cjs — git utilities
const { execSync } = require("child_process");

/**
 * Vrátí git diff proti HEAD (pracovní adresář vs. poslední commit).
 * Prázdný string = žádné změny nebo chyba.
 */
function getLastDiff(projectPath) {
  try {
    const diff = execSync("git diff HEAD", {
      cwd: projectPath,
      encoding: "utf8",
      timeout: 10000,
      maxBuffer: 2 * 1024 * 1024,
    });
    return diff || "";
  } catch (e) {
    // exit code 1 = žádné změny, to není chyba
    return "";
  }
}

/**
 * Vrátí diff staged souborů (index vs. HEAD).
 */
function getStagedDiff(projectPath) {
  try {
    const diff = execSync("git diff --cached", {
      cwd: projectPath,
      encoding: "utf8",
      timeout: 10000,
    });
    return diff || "";
  } catch {
    return "";
  }
}

/**
 * Vrátí seznam změněných souborů.
 * @returns {string[]} — relativní cesty od rootu projektu
 */
function getChangedFiles(projectPath) {
  try {
    const out = execSync("git diff --name-only HEAD", {
      cwd: projectPath,
      encoding: "utf8",
      timeout: 10000,
    });
    return out.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Vrátí posledních N commitů.
 * @param {number} n
 * @returns {{ hash: string, message: string, date: string }[]}
 */
function getRecentCommits(projectPath, n = 5) {
  try {
    const out = execSync(
      `git log -${n} --format="%H|%s|%ad" --date=iso`,
      { cwd: projectPath, encoding: "utf8", timeout: 10000 }
    );
    return out.split("\n").filter(Boolean).map((line) => {
      const [hash, message, date] = line.split("|");
      return { hash: hash.trim(), message: message.trim(), date: date.trim() };
    });
  } catch {
    return [];
  }
}

module.exports = { getLastDiff, getStagedDiff, getChangedFiles, getRecentCommits };
