// ExecutionPanel — sdílený exekuční panel pro RoadmapDetail i ProjectDetail.
// Zobrazuje běžící tasky (s časem + rolí), pozastavené procesy, sloty,
// a tlačítka Spustit / Pozastavit. Odstraňuje duplicitu mezi komponentami.
import { useState } from "react";
import { API } from "../config";
import Spinner from "./Spinner";
import { formatElapsed } from "../lib/format";

export default function ExecutionPanel({ project, state, runLabel = "▶ Spustit" }) {
  const [executing, setExecuting] = useState(false);
  const [execResult, setExecResult] = useState(null);

  const slotsUsed = state?.slots?.used || 0;
  const slotsTotal = state?.slots?.total || 3;
  const allSlotsFull = state?.slots?.allFull || slotsUsed >= slotsTotal;
  const activeHere = (state?.activeExecutions || []).filter((a) => a.project === project);
  const pausedHere = (state?.queue?.pausedProcesses || []).filter((p) => p.project === project);
  const isWorking = state?.queue?.workerRunning || state?.queue?.length > 0;

  const pauseProcess = async (key) => {
    await fetch(`${API}/api/executor/process/pause`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-auth-token": import.meta.env.VITE_AUTH_TOKEN },
      body: JSON.stringify({ key }),
    });
  };

  const runQueue = async () => {
    setExecuting(true);
    setExecResult(null);
    try {
      const res = await fetch(`${API}/api/executor/queue/${encodeURIComponent(project)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-auth-token": import.meta.env.VITE_AUTH_TOKEN },
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
    const action = state?.queue?.paused ? "resume" : "pause";
    await fetch(`${API}/api/executor/queue/${action}`, {
      method: "POST",
      headers: { "x-auth-token": import.meta.env.VITE_AUTH_TOKEN },
    });
  };

  return (
    <div className="bg-[#0d0d0d] border border-[#C89B3C]/30 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#C89B3C]">🤖 Autonomní exekuce</h3>
        <span className="text-[10px] font-mono text-[#5c5c5c]">
          sloty {slotsUsed}/{slotsTotal}{allSlotsFull && <span className="text-[#e85d5d]"> · plné</span>}
        </span>
      </div>

      {activeHere.length > 0 ? (
        <div className="mb-3 p-3 bg-[#111] border border-[#232323] rounded-lg space-y-1.5">
          {activeHere.map((a, i) => (
            <div key={i} className="flex flex-col gap-0.5 text-[11px] border-b border-[#232323] last:border-b-0 pb-1.5 last:pb-0">
              <div className="flex items-start gap-2">
                <span className="text-[#C89B3C] shrink-0">▶</span>
                <span className="text-[#e8e8e8]">"{a.task}"</span>
                <span className="text-[#C89B3C] font-mono shrink-0 ml-auto whitespace-nowrap">⏱ {formatElapsed(a.elapsedMs)}</span>
                <button
                  onClick={() => pauseProcess(a.key)}
                  title="Pozastavit tento proces"
                  className="text-[10px] px-1.5 py-0.5 rounded border border-[#232323] text-[#9d9d9d] hover:text-[#e85d5d] hover:border-[#e85d5d] transition-colors shrink-0"
                >
                  ⏸
                </button>
              </div>
              <div className="flex items-center gap-2 pl-5 text-[10px] text-[#5c5c5c]">
                <span className="font-mono">{a.agent}</span>
                {a.role && <span>· {a.role}</span>}
                {a.model && <span className="font-mono hidden sm:inline">· {a.model.split("/").pop()}</span>}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {pausedHere.length > 0 && (
        <div className="mb-3 p-3 bg-[#111] border border-[#e85d5d]/30 rounded-lg space-y-1">
          <p className="text-[10px] text-[#e85d5d] uppercase tracking-wider">⏸ Pozastavené procesy</p>
          {pausedHere.map((pp, i) => (
            <div key={i} className="flex items-center gap-2 text-[10px]">
              <span className="text-[#e85d5d]">⏸</span>
              <span className="text-[#9d9d9d]">{pp.task}</span>
            </div>
          ))}
        </div>
      )}

      {activeHere.length === 0 && pausedHere.length === 0 && isWorking ? (
        <p className="text-[10px] text-[#5c5c5c] mb-3">Fronta zpracovávána... <Spinner label="pracuji" /></p>
      ) : (
        <p className="text-[10px] text-[#5c5c5c] mb-3">Žádné aktivní exekuce na tomto projektu.</p>
      )}

      <div className="flex gap-2">
        <button
          onClick={runQueue}
          disabled={executing || allSlotsFull}
          className="bg-[#C89B3C] text-black text-xs font-bold px-3 py-1.5 rounded-md hover:bg-[#e5b34b] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {executing ? "Zařazuji..." : allSlotsFull ? `Všechny sloty plné (${slotsUsed}/${slotsTotal})` : runLabel}
        </button>
        {isWorking && (
          <button
            onClick={togglePause}
            className="text-[10px] px-2 py-1 rounded-md border border-[#232323] text-[#9d9d9d] hover:text-[#C89B3C] hover:border-[#C89B3C] transition-colors"
          >
            {state?.queue?.paused ? "▶ Pokračovat" : "⏸ Pozastavit"}
          </button>
        )}
      </div>

      {execResult && (
        <div className={`mt-3 p-3 rounded-md text-[11px] ${execResult.success ? "bg-[rgba(62,207,142,0.1)] text-[#3ecf8e]" : "bg-[rgba(232,93,93,0.1)] text-[#e85d5d]"}`}>
          {execResult.success
            ? `✅ ${execResult.queued} tasků zařazeno do fronty`
            : `❌ ${execResult.error || execResult.message || "Chyba"}`}
        </div>
      )}
    </div>
  );
}
