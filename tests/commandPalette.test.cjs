// ===== Unit testy pro CommandPalette fuzzy search =====

const { test } = require("node:test");
const assert = require("node:assert");

// Re-implementace fuzzy search logiky z CommandPalette.jsx
function filterActions(actions, query) {
  const q = query.trim().toLowerCase();
  if (!q) return actions;

  return actions
    .map((a) => {
      const haystack = [a.title, a.subtitle, ...(a.keywords || [])].join(" ").toLowerCase();
      let score = 0;
      if (a.title.toLowerCase().startsWith(q)) score += 100;
      if (haystack.includes(q)) score += 10;
      if (a.keywords?.some((k) => k.toLowerCase().startsWith(q))) score += 5;
      return { a, score };
    })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .map((x) => x.a);
}

const actions = [
  { id: "tab-pulse", title: "Přejít na: Pulse", subtitle: "Tab: pulse", keywords: ["Pulse", "tab", "goto"] },
  { id: "tab-agents", title: "Přejít na: Agenti", subtitle: "Tab: agents", keywords: ["Agenti", "agents", "tab"] },
  { id: "agent-scout", title: "Spustit agenta: scout", subtitle: "The Scout", keywords: ["scout", "agent", "run"] },
  { id: "project-foo", title: "Otevřít projekt: foo", subtitle: "Project detail", keywords: ["foo", "project"] },
  { id: "reload", title: "Reload všechna data", subtitle: "Vyčistit cache", keywords: ["reload", "refresh", "cache"] },
];

test("fuzzy search: prázdný query vrací vše", () => {
  assert.strictEqual(filterActions(actions, "").length, actions.length);
});

test("fuzzy search: nalezne 'agents' v názvu", () => {
  const res = filterActions(actions, "agents");
  assert.strictEqual(res[0].id, "tab-agents");
});

test("fuzzy search: 'agent' najde agent i tab", () => {
  const res = filterActions(actions, "agent");
  const ids = res.map((a) => a.id);
  assert.ok(ids.includes("agent-scout"));
  assert.ok(ids.includes("tab-agents"));
});

test("fuzzy search: 'scout' upřednostní agenta před tabem", () => {
  const res = filterActions(actions, "scout");
  assert.strictEqual(res[0].id, "agent-scout");
});

test("fuzzy search: 'reload' najde reload akci", () => {
  const res = filterActions(actions, "reload");
  assert.strictEqual(res[0].id, "reload");
});

test("fuzzy search: 'xyz' nenajde nic", () => {
  assert.strictEqual(filterActions(actions, "xyz").length, 0);
});

test("fuzzy search: case insensitive", () => {
  const res = filterActions(actions, "SCOUT");
  assert.strictEqual(res[0].id, "agent-scout");
});

test("fuzzy search: víceslovný query najde", () => {
  const res = filterActions(actions, "agenti tab");
  assert.ok(res.length > 0);
  assert.ok(res.some((a) => a.id === "tab-agents"));
});

test("fuzzy search: projekt se najde podle názvu", () => {
  const res = filterActions(actions, "foo");
  assert.strictEqual(res[0].id, "project-foo");
});

test("fuzzy search: prefix má nejvyšší skóre", () => {
  const res = filterActions(actions, "spus");
  assert.strictEqual(res[0].id, "agent-scout");
});
