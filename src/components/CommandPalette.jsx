import { useState, useEffect, useMemo, useRef } from "react";
import { API, cachedFetch, invalidateCache, authHeaders } from "../config";

/**
 * CommandPalette — global Cmd+K / Ctrl+K interface.
 * Akce: přepnutí tabu, spuštění agenta, otevření projektu, reload dat.
 */
function CommandPalette({ tabs, activeTab, onSelectTab, onSelectProject, onClose }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [agents, setAgents] = useState([]);
  const [projects, setProjects] = useState([]);
  const [recent, setRecent] = useState(() => loadRecent());
  const inputRef = useRef(null);

  // Načti data pro palette
  useEffect(() => {
    if (!open) return;
    cachedFetch(`${API}/api/agents`).then(setAgents).catch(() => {});
    cachedFetch(`${API}/api/projects`).then(setProjects).catch(() => {});
  }, [open]);

  // Keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") {
        setOpen(false);
        onClose?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
      setSelected(0);
    }
  }, [open]);

  const actions = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = [];

    // 1. Navigation
    tabs.forEach((tab) => {
      all.push({
        id: `tab-${tab.id}`,
        type: "navigate",
        icon: "→",
        title: `Přejít na: ${tab.label}`,
        subtitle: `Tab: ${tab.id}`,
        keywords: [tab.label, tab.id, "tab", "goto"],
        run: () => onSelectTab?.(tab.id),
      });
    });

    // 2. Agents
    agents.forEach((agent) => {
      all.push({
        id: `agent-run-${agent.name}`,
        type: "action",
        icon: "▶",
        title: `Spustit agenta: ${agent.name}`,
        subtitle: agent.manifest?.identity?.archetype || "Agent",
        keywords: [agent.name, "agent", "run", "spustit"],
        run: () => runAgent(agent.name),
      });
    });

    // 3. Projects
    projects.forEach((project) => {
      const name = typeof project === "string" ? project : project.name;
      all.push({
        id: `project-${name}`,
        type: "navigate",
        icon: "◎",
        title: `Otevřít projekt: ${name}`,
        subtitle: "Project detail",
        keywords: [name, "project", "projekt", "detail"],
        run: () => onSelectProject?.(name),
      });
    });

    // 4. Global actions
    all.push(
      {
        id: "reload-data",
        type: "action",
        icon: "↻",
        title: "Reload všechna data",
        subtitle: "Vyčistit cache a načíst znovu",
        keywords: ["reload", "refresh", "cache", "data"],
        run: () => {
          ["/api/projects", "/api/agents", "/api/leads", "/api/roadmaps", "/api/paparazzi"].forEach(invalidateCache);
          window.location.reload();
        },
      },
      {
        id: "toggle-streaming-log",
        type: "action",
        icon: "⌘",
        title: "Otevřít Agenti",
        subtitle: "Přejít na záložku Agenti",
        keywords: ["agenti", "agents", "stream"],
        run: () => onSelectTab?.("agents"),
      },
      {
        id: "close-palette",
        type: "action",
        icon: "✕",
        title: "Zavřít Command Palette",
        subtitle: "Esc",
        keywords: ["close", "zavrit", "exit"],
        run: () => setOpen(false),
      }
    );

    // 5. Recent actions (pokud jsou)
    recent.forEach((r) => {
      all.unshift({
        id: `recent-${r.id}`,
        type: "recent",
        icon: "↺",
        title: `Nedávné: ${r.title}`,
        subtitle: r.subtitle,
        keywords: r.keywords || [r.title],
        run: () => {
          // Pokus se zavolat stored action (pokud je to tab)
          if (r.actionType === "navigate" && r.targetTab) onSelectTab?.(r.targetTab);
        },
      });
    });

    if (!q) return all;

    // Fuzzy filter
    return all
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
  }, [query, tabs, agents, projects, recent, activeTab, onSelectTab, onSelectProject]);

  // Udrž selected v rozsahu
  useEffect(() => {
    setSelected((s) => Math.min(s, Math.max(0, actions.length - 1)));
  }, [actions.length]);

  const execute = (action) => {
    if (!action) return;
    addRecent(action);
    action.run?.();
    setOpen(false);
    onClose?.();
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => (s + 1) % actions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => (s - 1 + actions.length) % actions.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      execute(actions[selected]);
    } else if (e.key === "Escape") {
      setOpen(false);
      onClose?.();
    }
  };

  if (!open) {
    return (
      <div className="fixed bottom-4 right-4 text-[11px] text-[#5c5c5c] opacity-50 hover:opacity-100 transition-opacity">
        Cmd+K
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-sm"
      onClick={() => { setOpen(false); onClose?.(); }}
    >
      <div
        className="w-[640px] max-w-[90vw] bg-[#111] border border-[#232323] rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#232323]">
          <span className="text-[#C89B3C] text-lg">⌘</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelected(0); }}
            onKeyDown={onKeyDown}
            placeholder="Příkaz, agent, projekt, tab…"
            className="flex-1 bg-transparent text-[14px] text-[#f4f4f4] placeholder-[#5c5c5c] outline-none"
            autoComplete="off"
          />
          <span className="text-[11px] text-[#5c5c5c] px-2 py-0.5 rounded border border-[#232323]">ESC</span>
        </div>

        {/* Results */}
        <div className="max-h-[50vh] overflow-y-auto py-2">
          {actions.length === 0 ? (
            <div className="px-4 py-8 text-center text-[12px] text-[#5c5c5c]">
              Žádný výsledek pro „{query}“
            </div>
          ) : (
            actions.map((action, i) => (
              <button
                key={action.id}
                onClick={() => execute(action)}
                onMouseEnter={() => setSelected(i)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  i === selected ? "bg-[#C89B3C]/10" : "hover:bg-[#1a1a1a]"
                }`}
              >
                <span className={`w-6 text-center text-[13px] ${i === selected ? "text-[#C89B3C]" : "text-[#5c5c5c]"}`}>
                  {action.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <div className={`text-[13px] truncate ${i === selected ? "text-[#f4f4f4]" : "text-[#d4d4d4]"}`}>
                    {action.title}
                  </div>
                  <div className="text-[11px] text-[#5c5c5c] truncate">
                    {action.subtitle}
                  </div>
                </div>
                {i === selected && <span className="text-[11px] text-[#C89B3C]">↵</span>}
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-[#232323] flex justify-between text-[10px] text-[#5c5c5c]">
          <span>{actions.length} akcí</span>
          <span>↑↓ navigace · Enter spustí · Esc zavře</span>
        </div>
      </div>
    </div>
  );
}

// ===== Helpers =====

const RECENT_KEY = "sovereign-cmd-recent";

function loadRecent() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
  } catch {
    return [];
  }
}

function addRecent(action) {
  try {
    const recent = loadRecent();
    const item = {
      id: action.id,
      title: action.title,
      subtitle: action.subtitle,
      keywords: action.keywords,
      actionType: action.type,
      targetTab: action.type === "navigate" && action.title.startsWith("Přejít na:") ? action.subtitle.replace("Tab: ", "") : null,
      at: Date.now(),
    };
    const filtered = recent.filter((r) => r.id !== item.id);
    const next = [item, ...filtered].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // localStorage může být plný — ignoruj
  }
}

function runAgent(name) {
  fetch(`${API}/api/agents/${encodeURIComponent(name)}/run`, { method: "POST", headers: authHeaders() })
    .then((r) => r.json())
    .then((data) => {
      if (data.success) {
        alert(`Agent ${name} dokončen: ${data.tokens || 0} tokens`);
      } else {
        alert(`Agent ${name} selhal: ${data.error}`);
      }
    })
    .catch((err) => alert(`Chyba: ${err.message}`));
}

export default CommandPalette;
