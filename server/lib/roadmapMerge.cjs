// ===== Roadmap Merge — dedup + sjednocení více .md roadmap souborů =====
// Pro projekt s VÍCE roadmap souborů (ROADMAP.md, MASTER-PLAN.md, ...) vytvoří
// JEDEN kanonický model bez duplicit. Cíl: neplýtvat tokeny exekuováním
// stejného tasku víckrát (každý soubor ho má jinak formulovaný).
//
// Princip:
//   1. Přesná shoda (normalizovaný text) → dedup (0 tokenů).
//   2. Fuzzy shoda (overlap skóre >= SIMILARITY_THRESHOLD) → dedup.
//   3. Vše VIRTUÁLNĚ (v paměti) — uživatelské .md soubory se nemodifikují.
//   4. Task má `sources[]` → markTaskDone odškrtne ve VŠECH zdrojích.
//
// Priority souborů (canonical = nejvyšší): ROADMAP > MASTER-PLAN > PRODUCT-PLAN > BUILD-PLAN > PLAN > ostatní.

const fs = require("fs");
const path = require("path");
const { findRoadmapFiles, parseRoadmap } = require("./roadmaps.cjs");
const config = require("../config.cjs");

// Podobnostní práh pro fuzzy dedup (konzervativní — nespojuje různé tasky)
const SIMILARITY_THRESHOLD = 0.7;
// Min délka slova pro fuzzy scoring (kratší slova = šum)
const MIN_WORD_LEN = 4;

// Priority souborů — canonical má nejvyšší prioritu (0)
const FILE_PRIORITY = [
  /^roadmap\.md$/i,
  /^master[-_]plan\.md$/i,
  /^product[-_]plan\.md$/i,
  /^build[-_]plan\.md$/i,
  /^launch[-_]plan\.md$/i,
  /^project[-_]completion[-_]plan\.md$/i,
  /^plan\.md$/i,
];
const DEFAULT_PRIORITY = 99;

function filePriority(filename) {
  for (let i = 0; i < FILE_PRIORITY.length; i++) {
    if (FILE_PRIORITY[i].test(filename)) return i;
  }
  return DEFAULT_PRIORITY;
}

// Normalizuje task text pro porovnání (bez markdown, diakritiky, whitespace)
function normalizeTask(text) {
  return String(text || "")
    .replace(/[#*_~`]/g, "")
    .normalize("NFD")                // rozlož precomposed znaky (ě → e + combining mark)
    .replace(/[\u0300-\u036f]/g, "") // odstraní diakritiku
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Rozdělí text na "významná" slova (>= MIN_WORD_LEN)
function significantWords(text) {
  return text.split(/[^a-z0-9]+/).filter((w) => w.length >= MIN_WORD_LEN);
}

// Podobnostní skóre (0..1) — kombinace Jaccard overlap + containment.
// Containment zachytí tasky, kde je jeden prefix/rozšíření druhého
// (např. "Fallback model" vs "Přidat fallback model (pokud selže)").
// Používáme MAX(overlap, containment) — chytré, neplýtvá tokeny.
function similarityScore(a, b) {
  const wa = significantWords(normalizeTask(a));
  const wb = significantWords(normalizeTask(b));
  if (wa.length === 0 || wb.length === 0) return 0;
  const setA = new Set(wa);
  const setB = new Set(wb);

  // Jaccard overlap
  let inter = 0;
  for (const w of setA) if (setB.has(w)) inter++;
  const union = new Set([...setA, ...setB]).size;
  const overlap = inter / union;

  // Containment — kolik slov kratšího textu je v delším
  const smaller = setA.size <= setB.size ? setA : setB;
  const larger = setA.size <= setB.size ? setB : setA;
  let contained = 0;
  for (const w of smaller) if (larger.has(w)) contained++;
  const containment = contained / smaller.size;

  return Math.max(overlap, containment);
}

// Vrátí "klíč" tasku pro dedup — normalizovaný text (exact match)
function exactKey(taskText) {
  return normalizeTask(taskText);
}

/**
 * Merge více roadmap souborů projektu do jednoho deduplikovaného modelu.
 * @returns {Array<{text, done, sources: string[], canonicalFile}>} tasky (dedup)
 */
function mergeProjectRoadmaps(projectName) {
  const projectDir = path.join(config.PROJECTS_DIR, projectName);
  const files = findRoadmapFiles(projectDir);
  if (files.length === 0) return [];

  // Načti všechny soubory + parsuj
  const parsedFiles = [];
  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(projectDir, file), "utf8");
      const parsed = parseRoadmap(content);
      if (parsed.totalCheckboxes === 0) continue;
      parsedFiles.push({
        file,
        priority: filePriority(file),
        phases: parsed.phases,
      });
    } catch {
      // přeskoč nečitelný
    }
  }

  if (parsedFiles.length === 0) return [];

  // Seřaď podle priority (canonical první)
  parsedFiles.sort((a, b) => a.priority - b.priority);

  // Dedup: projdi tasky v pořadí priority, přidej jen nové (exact + fuzzy)
  const merged = [];
  const seen = []; // uložené normalizované texty + tasky

  for (const pf of parsedFiles) {
    for (const phase of pf.phases) {
      for (const item of phase.items) {
        // Exact match — už máme identický task
        const norm = normalizeTask(item.text);
        if (norm.length === 0) continue;

        const exact = seen.find((s) => s.key === exactKey(item.text));
        if (exact) {
          // Přidej zdroj k existujícímu tasku (ať se odškrtne v obou)
          if (!exact.sources.includes(pf.file)) exact.sources.push(pf.file);
          continue;
        }

        // Fuzzy match — podobný task už máme
        let fuzzyMatch = null;
        for (const s of seen) {
          if (similarityScore(item.text, s.text) >= SIMILARITY_THRESHOLD) {
            fuzzyMatch = s;
            break;
          }
        }
        if (fuzzyMatch) {
          if (!fuzzyMatch.sources.includes(pf.file)) fuzzyMatch.sources.push(pf.file);
          continue;
        }

        // Nový task
        const task = {
          text: item.text,
          done: item.done,
          sources: [pf.file],
          canonicalFile: pf.file,
          phase: phase.title,
        };
        merged.push(task);
        seen.push({ key: exactKey(item.text), text: item.text, sources: task.sources });
      }
    }
  }

  return merged;
}

// Kolik deduplikovaných tasků (pro report)
function dedupStats(projectName) {
  const merged = mergeProjectRoadmaps(projectName);
  let totalRaw = 0;
  const files = findRoadmapFiles(path.join(config.PROJECTS_DIR, projectName));
  for (const f of files) {
    try {
      const p = parseRoadmap(fs.readFileSync(path.join(config.PROJECTS_DIR, projectName, f), "utf8"));
      totalRaw += p.totalCheckboxes;
    } catch {}
  }
  return {
    project: projectName,
    files: files.length,
    rawTasks: totalRaw,
    mergedTasks: merged.length,
    deduped: totalRaw - merged.length,
  };
}

module.exports = {
  mergeProjectRoadmaps,
  similarityScore,
  normalizeTask,
  exactKey,
  filePriority,
  dedupStats,
  SIMILARITY_THRESHOLD,
};
