// Roadmapy — ONE SOURCE OF TRUTH (/api/roadmaps/state).
// Server agreguje markdown roadmapy + live exekuční stav do jednoho modelu.
// UI čte JEN tento endpoint — žádné klient-side spojování dvou zdrojů.
import { useState, useEffect, useMemo } from "react";
import { API } from "../config";
import ExecutionPanel from "./ExecutionPanel";

// ----- Barvy dle progress (sdílené) -----
const progColor = (pct) => (pct >= 70 ? "#3ecf8e" : pct >= 30 ? "#e5b34b" : "#e85d5d");


function ProgressBar({ pct }) {
  return (
    <div className="h-1.5 bg-[#232323] rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: progColor(pct) }} />
    </div>
  );
}

// ----- Přehledová karta projektu -----
function RoadmapCard({ p, onSelect }) {
  const running = p.execution?.running || 0;
  return (
    <button
      onClick={() => onSelect(p.project)}
      className="text-left bg-[#111] border border-[#232323] rounded-xl p-4 hover:border-[#8f6f26] transition-all w-full"
    >
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-[#e8e8e8] truncate">{p.project}</h4>
        <span className="text-[10px] font-mono text-[#5c5c5c] shrink-0">{p.file}</span>
      </div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] text-[#9d9d9d]">{p.done}/{p.total} úkolů</span>
        <span className="text-[11px] font-bold" style={{ color: progColor(p.progress) }}>{p.progress}%</span>
      </div>
      <ProgressBar pct={p.progress} />
      <div className="flex items-center justify-between mt-2">
        {running > 0 ? (
          <span className="text-[10px] font-mono text-[#C89B3C] bg-[rgba(200,155,60,0.12)] border border-[rgba(200,155,60,0.3)] rounded px-1.5 py-0.5">
            ● {running} agent{running > 1 ? "i" : ""} běží
          </span>
        ) : (
          <span className="text-[10px] font-mono text-[#5c5c5c]">0 agentů běží</span>
        )}
        <span className="text-[10px] text-[#5c5c5c]">
          {p.phases.length} fází{p.files > 1 ? ` · ${p.files} souborů sloučeno${p.deduped ? ` (+${p.deduped} dedup)` : ""}` : ""} · {new Date(p.updatedAt).toLocaleDateString("cs-CZ")}
        </span>
      </div>
    </button>
  );
}

// ----- Detail roadmapy projektu -----
function RoadmapDetail({ project, data, state, onBack }) {
  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-xs text-[#C89B3C] hover:text-[#8f6f26] transition-colors">
        ← Zpět na přehled
      </button>

      {/* Exekuční panel — sdílená komponenta */}
      <ExecutionPanel project={project} state={state} runLabel="▶ Spustit celý task list" />

      {/* Roadmapa — fázové rozpadlé */}
      {data.phases.map((phase, j) => {
        const phasePct = phase.total > 0 ? Math.round((phase.done / phase.total) * 100) : 0;
        const activeTaskTexts = new Set((data.execution?.activeTasks || []).map((a) => a.task));
        return (
          <div key={j} className="bg-[#111] border border-[#232323] rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-[#e8e8e8]">{phase.title}</h3>
              <span className="text-[10px] text-[#5c5c5c] font-mono">{phase.done}/{phase.total} · {phasePct}%</span>
            </div>
            <ProgressBar pct={phasePct} />
            <ul className="space-y-1 mt-3">
              {phase.items.map((item, k) => {
                const isActive = activeTaskTexts.has(item.text);
                return (
                  <li key={k} className={`flex items-start gap-2 text-[11px] ${isActive ? "bg-[rgba(200,155,60,0.08)] border border-[rgba(200,155,60,0.3)] rounded px-2 py-1" : ""}`}>
                    <span className={item.done ? "text-[#3ecf8e]" : isActive ? "text-[#C89B3C]" : "text-[#5c5c5c]"}>
                      {item.done ? "✓" : isActive ? "▶" : "○"}
                    </span>
                    <span className={item.done ? "text-[#5c5c5c] line-through" : isActive ? "text-[#e8e8e8]" : "text-[#9d9d9d]"}>
                      {item.text}
                      {isActive && <span className="ml-2 text-[10px] font-mono text-[#C89B3C]">(běží)</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

// ----- Hlavní přehled -----
export default function Roadmaps() {
  const [data, setData] = useState(null);      // one source of truth
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState("all"); // all | running

  useEffect(() => {
    const load = () => {
      fetch(`${API}/api/roadmaps/state`)
        .then((r) => r.json())
        .then((d) => {
          setData(d);
          setLoading(false);
          setError(null);
        })
        .catch((e) => setError(e.message));
    };
    load();
    const id = setInterval(load, 2000); // one source, jeden poll
    return () => clearInterval(id);
  }, []);

  const projects = useMemo(() => {
    if (!data?.projects) return [];
    let list = [...data.projects].sort((a, b) => a.progress - b.progress);
    if (filter === "running") list = list.filter((p) => (p.execution?.running || 0) > 0);
    return list;
  }, [data, filter]);

  if (loading) return <p className="text-[#5c5c5c]">Načítám roadmapy...</p>;
  if (error) return <p className="text-[#e85d5d]">Chyba: {error}</p>;

  // Detail vybraného projektu — najdi ho v one source
  if (selected && data) {
    const proj = data.projects.find((p) => p.project === selected);
    if (proj) return <RoadmapDetail project={selected} data={proj} state={data} onBack={() => setSelected(null)} />;
  }

  if (projects.length === 0) {
    return (
      <div className="bg-[#111] border border-[#232323] rounded-xl p-6 text-center">
        <p className="text-[#5c5c5c] text-sm">
          {filter === "running" ? "Žádné projekty s běžícími agenty." : "Žádné roadmapy nalezeny."}
        </p>
        <p className="text-[#5c5c5c] text-xs mt-1">Přidej ROADMAP.md do projektu, aby se tu objevil.</p>
      </div>
    );
  }

  const { summary, slots } = data;

  return (
    <div className="space-y-4">
      {/* Souhrnný header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#C89B3C]">🗺️ Roadmapy projektů ({projects.length})</h3>
        <div className="flex gap-2">
          <button
            onClick={() => setFilter("all")}
            className={`text-[10px] px-2 py-1 rounded-md border transition-colors ${filter === "all" ? "border-[#C89B3C] text-[#C89B3C]" : "border-[#232323] text-[#5c5c5c] hover:text-[#9d9d9d]"}`}
          >
            Vše
          </button>
          <button
            onClick={() => setFilter("running")}
            className={`text-[10px] px-2 py-1 rounded-md border transition-colors ${filter === "running" ? "border-[#C89B3C] text-[#C89B3C]" : "border-[#232323] text-[#5c5c5c] hover:text-[#9d9d9d]"}`}
          >
            Běží ({summary.runningAgents})
          </button>
        </div>
      </div>

      {/* Agregační souhrn — one source summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[#111] border border-[#232323] rounded-xl p-3">
          <p className="text-[10px] text-[#5c5c5c] uppercase tracking-wider">Celkový progress</p>
          <p className="text-xl font-semibold" style={{ color: progColor(summary.overallProgress) }}>{summary.overallProgress}%</p>
          <p className="text-[10px] text-[#5c5c5c]">{summary.doneTasks}/{summary.totalTasks} úkolů</p>
        </div>
        <div className="bg-[#111] border border-[#232323] rounded-xl p-3">
          <p className="text-[10px] text-[#5c5c5c] uppercase tracking-wider">Projektů</p>
          <p className="text-xl font-semibold">{summary.projectCount}</p>
          <p className="text-[10px] text-[#5c5c5c]">s roadmapami</p>
        </div>
        <div className="bg-[#111] border border-[#232323] rounded-xl p-3">
          <p className="text-[10px] text-[#5c5c5c] uppercase tracking-wider">Běžící agenti</p>
          <p className="text-xl font-semibold text-[#C89B3C]">{summary.runningAgents}</p>
          <p className="text-[10px] text-[#5c5c5c]">sloty {slots.used}/{slots.total}</p>
        </div>
        <div className="bg-[#111] border border-[#232323] rounded-xl p-3">
          <p className="text-[10px] text-[#5c5c5c] uppercase tracking-wider">Fronta</p>
          <p className="text-xl font-semibold">{data.queue.length}</p>
          <p className="text-[10px] text-[#5c5c5c]">{data.queue.workerRunning ? "pracuje" : "idle"}</p>
        </div>
      </div>

      {/* Grid projektů */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {projects.map((p) => (
          <RoadmapCard key={`${p.project}-${p.file}`} p={p} onSelect={setSelected} />
        ))}
      </div>
    </div>
  );
}
