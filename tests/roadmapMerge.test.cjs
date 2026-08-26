// ===== Unit testy pro Roadmap Merge (dedup více .md souborů) =====
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { similarityScore, normalizeTask, exactKey, filePriority } = require("../server/lib/roadmapMerge.cjs");

// ===== similarityScore =====
test("similarityScore: exact match = 1", () => {
  assert.strictEqual(similarityScore("Fallback model", "Fallback model"), 1);
});

test("similarityScore: prefix/rozšíření → high containment", () => {
  // task v ROADMAP vs rozšířený v PRODUCT-PLAN — stejný task, jiná formulace
  const s = similarityScore(
    "Přidat fallback model (pokud minimax-m3 selže)",
    "Fallback model — pokud minimax-m3 selže, zkusit gemma4:31b"
  );
  assert.ok(s >= 0.7, `měl by být >= 0.7, je ${s}`);
});

test("similarityScore: nepodobné tasky → nízké skóre", () => {
  const s = similarityScore("Deploy na Vercel", "Sdílení veřejný link");
  assert.ok(s < 0.7, `nepodobné by měly být < 0.7, je ${s}`);
});

test("similarityScore: diakritika ignorována", () => {
  const s = similarityScore("Lepší error stavy v UI", "Error handling — lepsi error stavy v UI");
  assert.ok(s >= 0.7, `diakritika by neměla vadit, je ${s}`);
});

test("similarityScore: prázdný text = 0", () => {
  assert.strictEqual(similarityScore("", "něco"), 0);
  assert.strictEqual(similarityScore("", ""), 0);
});

// ===== normalizeTask =====
test("normalizeTask: odstraní markdown + diakritiku", () => {
  assert.strictEqual(normalizeTask("**Fallback model** — pokud `minimax-m3`"), "fallback model — pokud minimax-m3");
});

test("normalizeTask: lowercase + whitespace", () => {
  assert.strictEqual(normalizeTask("  AHOJ   světe  "), "ahoj svete");
});

// ===== exactKey =====
test("exactKey: normalizuje identicky", () => {
  assert.strictEqual(exactKey("**Fallback model**"), exactKey("fallback model"));
});

// ===== filePriority =====
test("filePriority: ROADMAP je canonical (nejvyšší priorita)", () => {
  assert.ok(filePriority("ROADMAP.md") < filePriority("MASTER-PLAN.md"));
  assert.ok(filePriority("MASTER-PLAN.md") < filePriority("PRODUCT-PLAN.md"));
  assert.ok(filePriority("ROADMAP.md") < filePriority("random.md"));
});

// ===== mergeProjectRoadmaps (skutečný projekt s víc soubory) =====
test("mergeProjectRoadmaps: dedup reálných souborů (okeye)", () => {
  const { mergeProjectRoadmaps, dedupStats } = require("../server/lib/roadmapMerge.cjs");
  const stats = dedupStats("okeye");
  assert.ok(stats.files >= 2, `okeye má víc souborů (files=${stats.files})`);
  assert.ok(stats.deduped > 0, `dedup by měl odstranit duplicity (deduped=${stats.deduped})`);
  const merged = mergeProjectRoadmaps("okeye");
  assert.ok(merged.length < stats.rawTasks, `merged (${merged.length}) < raw (${stats.rawTasks})`);
});

test("mergeProjectRoadmaps: tasky mají sources[]", () => {
  const { mergeProjectRoadmaps } = require("../server/lib/roadmapMerge.cjs");
  const merged = mergeProjectRoadmaps("okeye");
  // nějaký task by měl mít víc zdrojů (byl v ROADMAP + PRODUCT-PLAN)
  const multiSource = merged.filter((t) => t.sources.length > 1);
  assert.ok(multiSource.length > 0, `aspoň 1 task s víc zdroji (máme ${multiSource.length})`);
});
