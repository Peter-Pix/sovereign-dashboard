// Karta projektu pro Paparazzi přehled.
import { useState } from "react";
import { activityMeta, healthColor } from "./constants";
import { MiniStat } from "./Stat";
import { API as API_URL } from "../../config";
import Spinner from "../Spinner";

export default function ProjectCard({ p, onAddBug, onSelectProject }) {
  const [isAdding, setIsAdding] = useState(false);
  const [bugTitle, setBugTitle] = useState("");
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentStartedAt, setAgentStartedAt] = useState(null);
  const [agentResult, setAgentResult] = useState(null);

  const handleAddBug = async (e) => {
    e.preventDefault();
    if (!bugTitle.trim()) return;
    setIsAdding(true);
    await onAddBug(p.name, { title: bugTitle, description: "Added via dashboard", severity: "medium" });
    setBugTitle("");
    setIsAdding(false);
  };

  const handleRunAgent = async () => {
    setAgentRunning(true);
    setAgentStartedAt(Date.now());
    setAgentResult(null);
    try {
      const res = await fetch(`${API_URL}/api/projects/${p.name}/run-agent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-auth-token": import.meta.env.VITE_AUTH_TOKEN,
        },
        body: JSON.stringify({ agent: "archivist" }),
      });
      const data = await res.json();
      if (res.ok) {
        setAgentResult({ success: true, text: data.text?.slice(0, 200) || "Agent dokončil audit." });
      } else {
        setAgentResult({ success: false, text: data.error || "Chyba při spuštění agenta." });
      }
    } catch {
      setAgentResult({ success: false, text: "Síťová chyba." });
    } finally {
      setAgentRunning(false);
    }
  };

  const act = activityMeta[p.activity] || activityMeta.idle;
  const dirty = p.dirty ? " ⚠️" : "";

  return (
    <div className="bg-[#111] border border-[#232323] rounded-xl p-4 hover:border-[#8f6f26] transition-all">
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

      <p className="text-[11px] text-[#9d9d9d] leading-snug mb-1 truncate" title={p.lastMsg}>
        <span className="text-[#5c5c5c] font-mono">{p.lastHash}</span> {p.lastMsg}
      </p>
      <p className="text-[10px] text-[#5c5c5c] mb-3">
        {p.lastCommitAgo} · {p.branch}
      </p>

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

      <div className="grid grid-cols-4 gap-1 text-center mb-3">
        <MiniStat label="7d" value={p.commits7d} />
        <MiniStat label="30d" value={p.commits30d} />
        <MiniStat label="TODO" value={p.todoCount} warn={p.todoCount > 0} />
        <MiniStat label="README" value={p.hasReadme ? p.readmeLines : "—"} />
      </div>

      {/* Action Center */}
      <div className="flex gap-1 mb-3">
        {onSelectProject && (
          <button
            onClick={() => onSelectProject(p.name)}
            className="flex-1 text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded-md border border-[#232323] text-[#9d9d9d] hover:text-[#C89B3C] hover:border-[#C89B3C] transition-colors"
          >
            📄 Detail
          </button>
        )}
        <button
          onClick={handleRunAgent}
          disabled={agentRunning}
          className="flex-1 text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded-md border border-[#232323] text-[#9d9d9d] hover:text-[#C89B3C] hover:border-[#C89B3C] disabled:opacity-50 transition-colors"
        >
          {agentRunning ? <Spinner label="Audit" startedAt={agentStartedAt} /> : "🤖 Audit"}
        </button>
        <a
          href={`vscode://file/${encodeURIComponent("/Users/petrpiskacek/projects/" + p.name)}`}
          className="flex-1 text-center text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded-md border border-[#232323] text-[#9d9d9d] hover:text-[#C89B3C] hover:border-[#C89B3C] transition-colors"
        >
          💻 VS Code
        </a>
      </div>

      {agentResult && (
        <div className={`text-[10px] mb-3 p-2 rounded-md ${agentResult.success ? "bg-[rgba(62,207,142,0.1)] text-[#3ecf8e]" : "bg-[rgba(232,93,93,0.1)] text-[#e85d5d]"}`}>
          {agentResult.text}
        </div>
      )}

      {/* Rychlé přidání bugu */}
      <form onSubmit={handleAddBug} className="flex gap-1 mt-3 pt-3 border-t border-[#232323]">
        <input
          type="text"
          value={bugTitle}
          onChange={(e) => setBugTitle(e.target.value)}
          placeholder="Nový bug..."
          className="bg-[#0a0a0a] border border-[#232323] text-[10px] px-2 py-1 rounded-md text-[#e8e8e8] w-full focus:outline-none focus:border-[#C89B3C]"
        />
        <button
          type="submit"
          disabled={isAdding || !bugTitle.trim()}
          className="bg-[#C89B3C] text-black text-[10px] font-bold px-2 py-1 rounded-md hover:bg-[#e5b34b] disabled:opacity-50 transition-colors"
        >
          {isAdding ? "..." : "+"}
        </button>
      </form>

      {(p.todos || []).length > 0 && (
        <div className="text-[10px] text-[#5c5c5c] space-y-0.5 mt-3">
          {(p.todos || []).slice(0, 2).map((t, i) => (
            <p key={i} className="truncate" title={t.text}>
              <span className="text-[#e5b34b]">▸</span> {t.file}:{t.line} {t.text}
            </p>
          ))}
          {(p.todos || []).length > 2 && <p>…a další {(p.todos || []).length - 2}</p>}
        </div>
      )}
    </div>
  );
}
