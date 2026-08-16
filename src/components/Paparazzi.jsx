import { useState, useEffect, useMemo } from "react";
import { API } from "../config";

const tagColors = {
  STRUGGLE: "#e85d5d",
  VICTORY: "#3ecf8e",
  PROGRESS: "#e5b34b",
  IDLE: "#5c5c5c",
};

const activityMeta = {
  hot: { label: "Žhavý", color: "#3ecf8e", icon: "🔥" },
  active: { label: "Aktivní", color: "#e5b34b", icon: "⚡" },
  slow: { label: "Pomalý", color: "#5c5c5c", icon: "🐢" },
  idle: { label: "Idle", color: "#3a3a3a", icon: "💤" },
};

const healthColor = (h) => (h >= 70 ? "#3ecf8e" : h >= 40 ? "#e5b34b" : "#e85d5d");

export default function Paparazzi() {
  const [captures, setCaptures] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("ALL");
  const [view, setView] = useState("overview"); // overview | captures
  const [refreshing, setRefreshing] = useState(false);

  const load = (force = false) => {
    setLoading(true);
    setError(null);
    const url = (p) => `${API}${p}${force ? "?refresh=1" : ""}`;
    Promise.all([
      fetch(url("/api/paparazzi")).then((r) => r.json()),
      fetch(url("/api/paparazzi/data")).then((r) => r.json()),
    ])
      .then(([caps, d]) => {
        setCaptures(caps);
        setData(d);
        setLoading(false);
        setRefreshing(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
        setRefreshing(false);
      });
  };

  useEffect(load, []);

  const refresh = () => {
    setRefreshing(true);
    load(true);
  };

  const projects = useMemo(() => data?.projects || [], [data]);
  const summary = data?.summary;

  // Sort: nejaktivnější / nejnovější nahoře
  const sortedProjects = useMemo(() => {
    const order = { hot: 0, active: 1, slow: 2, idle: 3 };
    return [...projects].sort((a, b) => (order[a.activity] ?? 9) - (order[b.activity] ?? 9) || b.health - a.health);
  }, [projects]);

  const tags = ["ALL", ...new Set(captures.map((c) => c.tag))];
  const filtered = filter === "ALL" ? captures : captures.filter((c) => c.tag === filter);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {(["overview", "captures"]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-md font-semibold border transition-colors ${
                view === v
                  ? "text-[#C89B3C] border-[#C89B3C] bg-[rgba(200,155,60,0.1)]"
                  : "text-[#5c5c5c] border-[#232323] hover:text-[#9d9d9d]"
              }`}
            >
              {v === "overview" ? "Přehled" : "Captures"}
            </button>
          ))}
        </div>
        <button onClick={refresh} className="text-xs text-[#C89B3C] hover:text-[#8f6f26] transition-colors">
          {refreshing ? "⟳ Obnovuji..." : "↻ Refresh"}
        </button>
      </div>

      {error && (
        <p className="text-[#e85d5d] text-sm bg-[rgba(232,93,93,0.1)] border border-[rgba(232,93,93,0.3)] rounded-lg p-3">
          Chyba: {error}
        </p>
      )}

      {loading && !refreshing ? (
        <p className="text-[#5c5c5c]">Paparazzi sbírá data...</p>
      ) : view === "overview" ? (
        <Overview summary={summary} projects={sortedProjects} cached={data?.cached} />
      ) : (
        <Captures captures={filtered} tags={tags} filter={filter} setFilter={setFilter} />
      )}
    </div>
  );
}

/* ============ PŘEHLED — data o projektech + shrnutí ============ */
function Overview({ summary, projects, cached }) {
  const c = summary?.counts;
  return (
    <div className="space-y-5">
      {/* Shrnutí — sumarizace, vyhozené zbytečnosti */}
      {summary && (
        <div className="bg-[#111] border border-[#232323] rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#C89B3C]">
              📸 Paparazzi — stav ekosystému
            </h3>
            <div className="flex items-center gap-2">
              {cached && <span className="text-[10px] text-[#5c5c5c]">(cache)</span>}
              <span className="text-[10px] text-[#5c5c5c] font-mono">
                {new Date(summary.generatedAt).toLocaleTimeString("cs-CZ")}
              </span>
            </div>
          </div>
          <div className="space-y-1.5">
            {summary.summary.map((line, i) => (
              <p key={i} className="text-xs text-[#9d9d9d] leading-relaxed">{line}</p>
            ))}
          </div>

          {/* Rychlé počty */}
          {c && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 pt-3 border-t border-[#232323]">
              <Stat label="Projektů" value={c.total} color="#9d9d9d" />
              <Stat label="Žhavých" value={c.hot} color="#3ecf8e" />
              <Stat label="Dirty" value={c.dirty} color={c.dirty ? "#e85d5d" : "#9d9d9d"} />
              <Stat label="Bez README" value={c.undocumented} color={c.undocumented ? "#e5b34b" : "#9d9d9d"} />
            </div>
          )}
        </div>
      )}

      {/* Karty projektů */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {projects.map((p) => (
          <ProjectCard key={p.name} p={p} />
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div className="text-center">
      <div className="text-xl font-bold" style={{ color }}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-[#5c5c5c]">{label}</div>
    </div>
  );
}

/* ============ KARTA PROJEKTU — vylepšená ============ */
function ProjectCard({ p }) {
  const act = activityMeta[p.activity] || activityMeta.idle;
  const dirty = p.dirty ? " ⚠️" : "";

  return (
    <div className="bg-[#111] border border-[#232323] rounded-xl p-4 hover:border-[#8f6f26] transition-all">
      {/* Hlavička */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm">{act.icon}</span>
          <h4 className="text-sm font-semibold text-[#e8e8e8] truncate">{p.name}</h4>
        </div>
        <span
          className="shrink-0 text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded border"
          style={{ color: act.color, borderColor: act.color, opacity: 0.8 }}
        >
          {act.label}{dirty}
        </span>
      </div>

      {/* Poslední commit */}
      <p className="text-[11px] text-[#9d9d9d] leading-snug mb-1 truncate" title={p.lastMsg}>
        <span className="text-[#5c5c5c] font-mono">{p.lastHash}</span> {p.lastMsg}
      </p>
      <p className="text-[10px] text-[#5c5c5c] mb-3">
        {p.lastCommitAgo} · {p.branch}
      </p>

      {/* Health bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] uppercase tracking-wider text-[#5c5c5c]">Health</span>
          <span className="text-[10px] font-mono" style={{ color: healthColor(p.health) }}>{p.health}/100</span>
        </div>
        <div className="h-1.5 bg-[#232323] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${p.health}%`, backgroundColor: healthColor(p.health) }}
          />
        </div>
      </div>

      {/* Metriky */}
      <div className="grid grid-cols-4 gap-1 text-center mb-3">
        <MiniStat label="7d" value={p.commits7d} />
        <MiniStat label="30d" value={p.commits30d} />
        <MiniStat label="TODO" value={p.todoCount} warn={p.todoCount > 0} />
        <MiniStat label="README" value={p.hasReadme ? p.readmeLines : "—"} />
      </div>

      {/* Upozornění */}
      {p.todos.length > 0 && (
        <div className="text-[10px] text-[#5c5c5c] space-y-0.5">
          {p.todos.slice(0, 2).map((t, i) => (
            <p key={i} className="truncate" title={t.text}>
              <span className="text-[#e5b34b]">▸</span> {t.file}:{t.line} {t.text}
            </p>
          ))}
          {p.todos.length > 2 && <p>…a další {p.todos.length - 2}</p>}
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, warn }) {
  return (
    <div className="bg-[#0a0a0a] rounded-lg py-1.5">
      <div className="text-xs font-semibold" style={{ color: warn ? "#e5b34b" : "#e8e8e8" }}>{value}</div>
      <div className="text-[9px] uppercase tracking-wider text-[#5c5c5c]">{label}</div>
    </div>
  );
}

/* ============ CAPTURES — foto zobrazení (vylepšené) ============ */
function Captures({ captures, tags, filter, setFilter }) {
  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        {tags.map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-md font-semibold border transition-colors ${
              filter === t
                ? "text-[#C89B3C] border-[#C89B3C] bg-[rgba(200,155,60,0.1)]"
                : "text-[#5c5c5c] border-[#232323] hover:text-[#9d9d9d]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {captures.length === 0 ? (
        <p className="text-[#5c5c5c]">Žádné Paparazzi captures.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {captures.slice(0, 30).map((c) => (
            <div key={c.filename} className="bg-[#111] border border-[#232323] rounded-xl p-4 hover:border-[#8f6f26] transition-all">
              <div className="flex items-center justify-between mb-2">
                <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: tagColors[c.tag] || "#5c5c5c" }} />
                <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: tagColors[c.tag] || "#5c5c5c" }}>
                  {c.tag}
                </span>
              </div>
              <p className="text-xs text-[#9d9d9d] mb-1 truncate">{c.title}</p>
              <p className="text-[10px] text-[#5c5c5c] font-mono mb-3">{c.timestamp}</p>
              <a
                href={`${API}/api/files?p=${encodeURIComponent(
                  "/Users/petrpiskacek/Library/Mobile Documents/com~apple~CloudDocs/Paparazzi/" + c.filename
                )}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-[#C89B3C] hover:text-[#8f6f26] transition-colors"
              >
                Otevřít ↗
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
