// ===== Context-Aware Prompting =====
// Sestavuje relevantní kontext pro agenta z projektových souborů.
// Cíl: agent dostane jen ty soubory, které potřebuje pro daný task.

const fs = require("fs");
const path = require("path");
const config = require("../config.cjs");

// Max tokens approximation: 1 token ≈ 4 chars for code (rough heuristic)
const CHARS_PER_TOKEN = 4;
const DEFAULT_BUDGET_CHARS = 8000 * CHARS_PER_TOKEN; // ~8k tokens

// Soubory, které nikdy nechceme v kontextu
const SKIP_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".gif", ".svg", ".ico", ".webp",
  ".mp3", ".mp4", ".wav", ".ogg", ".mov", ".avi",
  ".zip", ".tar", ".gz", ".rar", ".7z",
  ".lock", ".log", ".tmp", ".cache",
  ".env", ".env.local", ".env.production", // secrets
]);

const SKIP_NAMES = new Set([
  "node_modules", ".git", ".next", "dist", "build", "coverage",
  ".vercel", ".turbo", ".cache", "out",
]);

const IMPORTANT_NAMES = new Set([
  "package.json", "tsconfig.json", "vite.config.js", "vite.config.ts",
  "next.config.js", "next.config.mjs", "README.md", "AGENTS.md",
  "SOUL.md", "MEMORY.md", "USER.md", ".content-cache",
]);

function isSkippable(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (SKIP_EXTENSIONS.has(ext)) return true;
  const parts = filePath.split(path.sep);
  return parts.some((p) => SKIP_NAMES.has(p));
}

function isImportant(filePath) {
  const base = path.basename(filePath);
  return IMPORTANT_NAMES.has(base);
}

/**
 * Vrátí všechny relevantní soubory v projektu.
 */
function walkProject(projectPath, maxFiles = 50) {
  const files = [];

  function walk(dir) {
    if (files.length >= maxFiles) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }

    for (const entry of entries) {
      if (files.length >= maxFiles) return;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_NAMES.has(entry.name)) walk(fullPath);
        continue;
      }
      if (isSkippable(fullPath)) continue;
      files.push(fullPath);
    }
  }

  walk(projectPath);
  return files;
}

/**
 * Spočítá relevance skóre mezi task a souborem.
 */
function scoreFile(filePath, taskLower, fileContent) {
  let score = 0;
  const base = path.basename(filePath).toLowerCase();
  const relative = path.relative(config.PROJECTS_DIR, filePath).toLowerCase();

  // Důležité config/readme soubory dostanou základní bod
  if (isImportant(filePath)) score += 10;

  // Název souboru obsahuje slovo z tasku
  const taskWords = taskLower.split(/\W+/).filter((w) => w.length > 2);
  for (const word of taskWords) {
    if (base.includes(word)) score += 5;
    if (relative.includes(word)) score += 3;
    if (fileContent.toLowerCase().includes(word)) score += 2;
  }

  // Roadmapy a dokumentace jsou vždy relevantní
  if (base.endsWith(".md") || base.endsWith(".mdx")) score += 3;

  // Zdrojové soubory před daty
  if ([".js", ".jsx", ".ts", ".tsx", ".cjs", ".mjs"].some((e) => base.endsWith(e))) score += 2;

  return score;
}

/**
 * Přečte soubor s limitem.
 */
function readFileChunk(filePath, maxChars = 4000) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    if (content.length <= maxChars) return content;
    return content.slice(0, maxChars) + "\n\n[... truncated]";
  } catch {
    return "";
  }
}

/**
 * Sestaví kontextový string pro daný task a projekt.
 * @param {string} projectName
 * @param {string} taskText — např. "opravit bug v executoru"
 * @param {object} options
 * @returns {{ context: string, files: string[], usedTokens: number }}
 */
function buildContext(projectName, taskText, options = {}) {
  const {
    maxFiles = 10,
    maxCharsPerFile = 4000,
    maxTotalChars = DEFAULT_BUDGET_CHARS,
  } = options;

  if (!config.SAFE_NAME_RE.test(projectName)) {
    throw new Error("Invalid project name");
  }

  const projectPath = path.resolve(config.PROJECTS_DIR, projectName);
  if (!projectPath.startsWith(path.resolve(config.PROJECTS_DIR))) {
    throw new Error("Path outside allowed root");
  }
  if (!fs.existsSync(projectPath)) {
    throw new Error("Project not found");
  }

  const taskLower = (taskText || "").toLowerCase();
  const allFiles = walkProject(projectPath, 50);

  // Score a seřazení
  const scored = allFiles
    .map((f) => ({
      path: f,
      relative: path.relative(config.PROJECTS_DIR, f),
      score: scoreFile(f, taskLower, fs.readFileSync(f, "utf8").slice(0, 2000)),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxFiles);

  // Build context string s respektem k budgetu
  let context = `## Kontext projektu: ${projectName}\n\n`;
  context += `Task: ${taskText}\n\n`;
  context += `---\n\n`;

  let usedChars = context.length;
  const includedFiles = [];

  for (const f of scored) {
    const header = `### ${f.relative}\n\n`;
    const chunk = readFileChunk(f.path, maxCharsPerFile);
    const section = `${header}\`\`\`\n${chunk}\n\`\`\`\n\n`;

    if (usedChars + section.length > maxTotalChars) {
      if (includedFiles.length === 0) {
        // Alespoň jeden soubor vždy přidej, i když překročíme budget
        context += section;
        includedFiles.push(f.relative);
      }
      break;
    }

    context += section;
    usedChars += section.length;
    includedFiles.push(f.relative);
  }

  if (includedFiles.length === 0) {
    context += "_Žádné relevantní soubory nenalezeny._\n";
  }

  return {
    context,
    files: includedFiles,
    usedTokens: Math.ceil(usedChars / CHARS_PER_TOKEN),
  };
}

/**
 * Sestaví kontext pro agenty bez konkrétního projektu
 * (např. archivist volá na projekt).
 */
function buildProjectPrompt(projectName, taskText, options) {
  const ctx = buildContext(projectName, taskText, options);
  return {
    prompt: `${taskText}\n\n${ctx.context}`,
    ...ctx,
  };
}

module.exports = {
  buildContext,
  buildProjectPrompt,
  walkProject,
  scoreFile,
  readFileChunk,
  isImportant,
  isSkippable,
};
