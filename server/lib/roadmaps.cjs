// ===== Roadmapy — parsování ROADMAP.md / PLAN.md z projektů =====
const fs = require("fs");
const path = require("path");
const config = require("../config.cjs");

// Soubory, které považujeme za roadmapy (case-insensitive)
const ROADMAP_PATTERNS = [
  /^roadmap\.md$/i,
  /^roadmap.*\.md$/i,
  /^plan\.md$/i,
  /^master-plan\.md$/i,
  /^master_plan\.md$/i,
  /^build-plan\.md$/i,
  /^product-plan\.md$/i,
  /^launch-plan\.md$/i,
  /^project-completion-plan\.md$/i,
];

function isRoadmapFile(filename) {
  return ROADMAP_PATTERNS.some((re) => re.test(filename));
}

// Najde roadmap soubory v projektu
function findRoadmapFiles(projectDir) {
  if (!fs.existsSync(projectDir)) return [];
  try {
    return fs.readdirSync(projectDir).filter((f) => isRoadmapFile(f) && fs.statSync(path.join(projectDir, f)).isFile());
  } catch {
    return [];
  }
}

// Parsuje Markdown roadmapu na strukturovaná data
function parseRoadmap(content) {
  const lines = content.split("\n");
  const phases = [];
  let currentPhase = null;
  let totalCheckboxes = 0;
  let doneCheckboxes = 0;

  for (const line of lines) {
    // Detekce fáze (## nebo ### s klíčovými slovy)
    const phaseMatch = line.match(/^#{2,3}\s+(.+)$/);
    if (phaseMatch) {
      const title = phaseMatch[1].trim();
      // Přeskoč obecné nadpisy, které nejsou fáze
      if (/fáze|phase|krok|step|milestone|sprint|etapa|stage|week|týden/i.test(title)) {
        currentPhase = { title, items: [], done: 0, total: 0 };
        phases.push(currentPhase);
      }
      continue;
    }

    // Detekce checklist položky
    const checkboxMatch = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.+)$/);
    if (checkboxMatch) {
      const isDone = checkboxMatch[1].toLowerCase() === "x";
      const text = checkboxMatch[2].trim();
      totalCheckboxes++;
      if (isDone) doneCheckboxes++;

      if (currentPhase) {
        currentPhase.items.push({ text, done: isDone });
        currentPhase.total++;
        if (isDone) currentPhase.done++;
      }
    }
  }

  // Pokud nejsou fáze, ale jsou checklisty, vytvoř jednu implicitní fázi
  if (phases.length === 0 && totalCheckboxes > 0) {
    phases.push({ title: "Obecné úkoly", items: [], done: doneCheckboxes, total: totalCheckboxes });
    // Znovu projdi pro items
    for (const line of lines) {
      const checkboxMatch = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.+)$/);
      if (checkboxMatch) {
        phases[0].items.push({ text: checkboxMatch[2].trim(), done: checkboxMatch[1].toLowerCase() === "x" });
      }
    }
  }

  return {
    phases,
    totalCheckboxes,
    doneCheckboxes,
    progress: totalCheckboxes > 0 ? Math.round((doneCheckboxes / totalCheckboxes) * 100) : 0,
  };
}

// Skenuje všechny projekty a vrací roadmapy
function collectRoadmaps() {
  const projectsDir = config.PROJECTS_DIR;
  const roadmaps = [];

  if (!fs.existsSync(projectsDir)) return roadmaps;

  const projectDirs = fs.readdirSync(projectsDir).filter((d) => {
    try {
      return fs.statSync(path.join(projectsDir, d)).isDirectory() && !d.startsWith(".");
    } catch {
      return false;
    }
  });

  for (const projectName of projectDirs) {
    const projectDir = path.join(projectsDir, projectName);
    const roadmapFiles = findRoadmapFiles(projectDir);

    for (const file of roadmapFiles) {
      try {
        const content = fs.readFileSync(path.join(projectDir, file), "utf8");
        const parsed = parseRoadmap(content);
        // Přeskoč soubory bez checklistů (nejsou to skutečné roadmapy)
        if (parsed.totalCheckboxes === 0) continue;

        roadmaps.push({
          project: projectName,
          file,
          ...parsed,
          updatedAt: fs.statSync(path.join(projectDir, file)).mtime.toISOString(),
        });
      } catch (e) {
        // Přeskoč nečitelné soubory
      }
    }
  }

  // Seřaď podle progress (nejméně hotové nahoře = nejvíc práce zbývá)
  roadmaps.sort((a, b) => a.progress - b.progress);

  return roadmaps;
}

module.exports = { collectRoadmaps, parseRoadmap, findRoadmapFiles, isRoadmapFile };
