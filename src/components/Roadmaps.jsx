// Roadmapy — přehled roadmap napříč projekty + autonomní exekuce (queue).
import { useState, useEffect } from "react";
import { API } from "../config";
import Spinner from "./Spinner";

function ProgressBar({ pct }) {
  const color = pct >= 70 ? "#3ecf8e" : pct >= 30 ? "#e5b34b" : "#e85d5d";
  return (
    <div className="h-1.5 bg-[#232323] rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

function RoadmapCard({ r, onSelect }) {
  return (
    <button
      onClick={() => onSelect(r.project)}
      className="text-left bg-[#111] border border-[#232323] rounded-xl p-4 hover:border-[#8f6f26] transition-all w-full"
    >
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-[#e8e8e8] truncate">{r.project}</h4>
        <span className="text-[10px] font-mono text-[#5c5c5c] shrink-0">{r.file}</span>
      </div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] text-[#9d9d9d]">
          {r.doneCheckboxes}/{r.totalCheckboxes} úkolů
        </span>
        <span className="text-[11px] font-bold" style={{ color: r.progress >= 70 ? "#3ecf8e" : r.progress >= 30 ? "#e5b34b" : "#e85d5d" }}>
          {r.progress}%
        </span>
      </div>
      <ProgressBar pct={r.progress} />
      <p className="text-[10px] text-[#5c5c5c] mt-2">
        {r.phases.length} fází · aktualizováno {new Date(r.updatedAt).toLocaleDateString("cs-CZ")}
      </p>
    </button>
  );
}

function RoadmapDetail({ project, onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [queueState, setQueueState] = useState(null);
  const [executing, setExecuting] = useState(false);
  const [execResult, setExecResult] = useState(null);

  const loadDetail = () => {
    fetch(`${API}/api/roadmaps/${project}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  };

  // Poll queue state každé 2s
  useEffect(() => {
    loadDetail();
    const poll = () => {
      fetch(`${API}/api/executor/state`)
        .then((r) => r.json())
        .then((d) => setQueueState(d))
        .catch(() => {});
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project]);

  const runQueue = async () => {
    setExecuting(true);
    setExecResult(null);
    try {
      const res = await fetch(`${API}/api/executor/queue/${project}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-auth-token": import.meta.env.VITE_AUTH_TOKEN,
        },
      });
      const d = await res.json();
      setExecResult(d);
    } catch {
      setExecResult({ error: "Síťová chyba" });
    } finally {
      setExecuting(false);
    }
  };

  const togglePause = async () => {
    const action = queueState?.paused ? "resume" : "pause";
    await fetch(`${API}/api/executor/queue/${action}`, {
      method: "POST",
      headers: { "x-auth-token": import.meta.env.VITE_AUTH_TOKEN },
    });
  };

  if (loading) return <p className="text-[#5c5c5c]">Načítám roadmapu...</p>;
  if (error) return <p className="text-[#e85d5d]">Chyba: {error}</p>;
  if (!data || data.roadmaps.length === 0) return <p className="text-[#5c5c5c]">Žádná roadmapa.</p>;

  const isWorking = queueState?.workerRunning || queueState?.queueLength > 0;

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-xs text-[#C89B3C] hover:text-[#8f6f26] transition-colors">
        ← Zpět na přehled
      </button>

      {/* Autonomní exekuce — queue */}
      <div className="bg-[#0d0d0d] border border-[#C89B3C]/30 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#C89B3C]">
            🤖 Autonomní exekuce
          </h3>
        </div>

        {/* Queue status */}
        {isWorking && (
          <div className="mb-3 p-3 bg-[#111] border border-[#232323] rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] text-[#9d9d9d]">
                {queueState?.current ? (
                  <>Běží: <span className="text-[#e8e8e8]">"{queueState.current.task}"</span></>
                ) : (
                  "Fronta zpracovávána..."
                )}
              </span>
              <Spinner label="pracuji" />
            </div>
            {queueState?.queueLength > 0 && (
              <p className="text-[10px] text-[#5c5c5c] mb-2">
                Zbývá {queueState.queueLength} tasků ve frontě
              </p>
            )}
            <div className="flex gap-2">
              <button
                onClick={togglePause}
                className="text-[10px] px-2 py-1 rounded-md border border-[#232323] text-[#9d9d9d] hover:text-[#C89B3C] hover:border-[#C89B3C] transition-colors"
              >
                {queueState?.paused ? "▶ Pokračovat" : "⏸ Pozastavit"}
              </button>
            </div>
          </div>
        )}

        {/* Spustit celý list */}
        <button
          onClick={runQueue}
          disabled={executing || isWorking}
          className="bg-[#C89B3C] text-black text-xs font-bold px-3 py-1.5 rounded-md hover:bg-[#e5b34b] disabled:opacity-50 transition-colors"
        >
          {executing ? "Zařazuji..." : "▶ Spustit celý task list"}
        </button>

        {execResult && (
          <div className={`mt-3 p-3 rounded-md text-[11px] ${execResult.success ? "bg-[rgba(62,207,142,0.1)] text-[#3ecf8e]" : "bg-[rgba(232,93,93,0.1)] text-[#e85d5d]"}`}>
            {execResult.success
              ? `✅ ${execResult.queued} tasků zařazeno do fronty`
              : `❌ ${execResult.error || execResult.message || "Chyba"}`}
          </div>
        )}

        {/* Queue log */}
        {queueState?.log?.length > 0 && (
          <div className="mt-3 border-t border-[#232323] pt-2">
            <p className="text-[10px] text-[#5c5c5c] uppercase tracking-wider mb-1">Průběh</p>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {queueState.log.slice(0, 10).map((entry, i) => (
                <p key={i} className="text-[10px] font-mono">
                  <span className={entry.status === "done" ? "text-[#3ecf8e]" : entry.status === "failed" ? "text-[#e85d5d]" : "text-[#e5b34b]"}>
                    {entry.status === "done" ? "✓" : entry.status === "failed" ? "✘" : "⚠"}
                  </span>{" "}
                  <span className="text-[#9d9d9d]">{entry.task}</span>
                </p>
              ))}
            </div>
          </div>
        )}
      </div>

      {data.roadmaps.map((rm, i) => (
        <div key={i} className="bg-[#111] border border-[#232323] rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-[#e8e8e8]">{rm.file}</h3>
            <span className="text-[10px] text-[#5c5c5c] font-mono">
              {rm.parsed.doneCheckboxes}/{rm.parsed.totalCheckboxes} · {rm.parsed.progress}%
            </span>
          </div>

          {rm.parsed.phases.map((phase, j) => (
            <div key={j} className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <h4 className="text-xs font-semibold text-[#C89B3C]">{phase.title}</h4>
                {phase.total > 0 && (
                  <span className="text-[10px] text-[#5c5c5c]">{phase.done}/{phase.total}</span>
                )}
              </div>
              {phase.items.length > 0 && (
                <ul className="space-y-1">
                  {phase.items.map((item, k) => (
                    <li key={k} className="flex items-start gap-2 text-[11px]">
                      <span className={item.done ? "text-[#3ecf8e]" : "text-[#5c5c5c]"}>
                        {item.done ? "✓" : "○"}
                      </span>
                      <span className={item.done ? "text-[#5c5c5c] line-through" : "text-[#9d9d9d]"}>
                        {item.text}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function Roadmaps() {
  const [roadmaps, setRoadmaps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    fetch(`${API}/api/roadmaps`)
      .then((r) => r.json())
      .then((d) => {
        setRoadmaps(Array.isArray(d) ? d : []);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  if (loading) return <p className="text-[#5c5c5c]">Načítám roadmapy...</p>;
  if (error) return <p className="text-[#e85d5d]">Chyba: {error}</p>;

  if (selected) {
    return <RoadmapDetail project={selected} onBack={() => setSelected(null)} />;
  }

  if (roadmaps.length === 0) {
    return (
      <div className="bg-[#111] border border-[#232323] rounded-xl p-6 text-center">
        <p className="text-[#5c5c5c] text-sm">Žádné roadmapy nalezeny.</p>
        <p className="text-[#5c5c5c] text-xs mt-1">Přidej ROADMAP.md do projektu, aby se tu objevil.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#C89B3C]">
          🗺️ Roadmapy projektů ({roadmaps.length})
        </h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {roadmaps.map((r) => (
          <RoadmapCard key={`${r.project}-${r.file}`} r={r} onSelect={setSelected} />
        ))}
      </div>
    </div>
  );
}
