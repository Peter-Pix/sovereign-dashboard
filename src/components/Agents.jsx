import { useState, useEffect } from "react";
import { API, authHeaders, cachedFetch } from "../config";

export default function Agents() {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [running, setRunning] = useState({});
  const [jobLog, setJobLog] = useState([]);

  useEffect(() => {
    cachedFetch(`${API}/api/agents`)
      .then((data) => {
        setAgents(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const runAgent = (name) => {
    if (running[name]) return;
    setRunning((r) => ({ ...r, [name]: true }));
    const ts = new Date().toLocaleTimeString("en-GB", { hour12: false });
    setJobLog((l) => [{ time: ts, agent: name, text: "▶ Job spuštěn — agent pracuje (reálná exekuce)..." }, ...l]);
    fetch(`${API}/api/agents/${encodeURIComponent(name)}/run`, { method: "POST", headers: authHeaders() })
      .then((r) => r.json())
      .then((data) => {
        const ts2 = new Date().toLocaleTimeString("en-GB", { hour12: false });
        if (data.success) {
          setJobLog((l) => [
            { time: ts2, agent: name, text: `✔ Job dokončen (${data.tokens || 0} tok): ${(data.text || "").slice(0, 120)}` },
            ...l,
          ]);
        } else {
          setJobLog((l) => [
            { time: ts2, agent: name, text: `✘ Selhání: ${data.error || "neznámá chyba"}` },
            ...l,
          ]);
        }
        setRunning((r) => ({ ...r, [name]: false }));
      })
      .catch((err) => {
        const ts2 = new Date().toLocaleTimeString("en-GB", { hour12: false });
        setJobLog((l) => [{ time: ts2, agent: name, text: `✘ Chyba: ${err.message}` }, ...l]);
        setRunning((r) => ({ ...r, [name]: false }));
      });
  };

  if (loading) return <p className="text-[#5c5c5c]">Načítám agenty...</p>;
  if (error) return <p className="text-[#e85d5d]">Chyba: {error}</p>;

  return (
    <div className="space-y-3">
      {agents.map((agent) => (
        <div
          key={agent.name}
          className="bg-[#111] border border-[#232323] rounded-xl p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">{agent.name}</h3>
              {agent.manifest?.identity?.big_four && (
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md font-semibold bg-[rgba(200,155,60,0.12)] text-[#C89B3C] border border-[rgba(200,155,60,0.3)]">
                  {agent.manifest.identity.big_four}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => runAgent(agent.name)}
                disabled={running[agent.name]}
                className="text-[10px] px-3 py-1.5 rounded-md font-semibold bg-[#C89B3C] text-[#0a0a0a] hover:bg-[#8f6f26] disabled:opacity-40 transition-colors"
              >
                {running[agent.name] ? "Běží..." : "Spustit job"}
              </button>
              <a
                href={`${API}/api/files?p=${encodeURIComponent(agent.workspacePath + "/manifest.json")}`}
                className="text-[10px] text-[#C89B3C] hover:text-[#8f6f26]"
                target="_blank"
                rel="noreferrer"
              >
                Manifest ↗
              </a>
            </div>
          </div>

          {agent.manifest?.identity && (
            <div className="bg-[#161616] border border-[#232323] rounded-lg p-3 mb-2">
              <p className="text-xs text-[#9d9d9d]">
                <span className="text-[#C89B3C]">Archetyp:</span> {agent.manifest.identity.archetype}
              </p>
              <p className="text-xs text-[#9d9d9d]">
                <span className="text-[#C89B3C]">Mise:</span> {agent.manifest.identity.mission}
              </p>
            </div>
          )}

          {agent.manifest && (
            <div className="bg-[#161616] border border-[#232323] rounded-lg p-3 mb-2">
              <p className="text-xs text-[#5c5c5c]">
                Role: {agent.manifest.role || agent.manifest.agent || "—"}
              </p>
              <p className="text-xs text-[#5c5c5c]">
                Status: {agent.manifest.status || "—"}
              </p>
              {agent.manifest.completedAt && (
                <p className="text-xs text-[#5c5c5c]">
                  Dokončeno: {agent.manifest.completedAt}
                </p>
              )}
              {agent.manifest.summary && (
                <p className="text-xs text-[#9d9d9d] mt-1">{agent.manifest.summary}</p>
              )}
            </div>
          )}

          {agent.log.length > 0 && (
            <div>
              <p className="text-[10px] text-[#5c5c5c] uppercase tracking-wider mb-1">
                Log (posledních 20)
              </p>
              <div className="bg-[#0a0a0a] border border-[#232323] rounded-lg p-2 max-h-32 overflow-y-auto">
                {agent.log.map((line, i) => (
                  <p key={i} className="text-[10px] text-[#5c5c5c] font-mono leading-relaxed">
                    {line}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Job activity log */}
      {jobLog.length > 0 && (
        <div className="bg-[#0a0a0a] border border-[#232323] rounded-lg p-3">
          <p className="text-[10px] text-[#5c5c5c] uppercase tracking-wider mb-1">
            Aktivita
          </p>
          {jobLog.map((entry, i) => (
            <p key={i} className="text-[10px] font-mono text-[#5c5c5c]">
              <span className="text-[#C89B3C]">{entry.time}</span>{" "}
              <span className="text-[#9d9d9d]">[{entry.agent}]</span>{" "}
              {entry.text}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
