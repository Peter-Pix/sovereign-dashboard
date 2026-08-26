import { useState, useEffect } from "react";
import { API, cachedFetch, invalidateCache } from "../config";
import AgentStream from "./AgentStream";
import WebhookSettings from "./WebhookSettings";
import McpManager from "./McpManager";

export default function Agents() {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [jobLog, setJobLog] = useState([]);
  const [streamingAgent, setStreamingAgent] = useState(null);

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

  const streamAgent = (name) => {
    setStreamingAgent(name);
  };

  const handleStreamClose = () => {
    setStreamingAgent(null);
    invalidateCache(`${API}/api/agents`);
  };

  if (loading) return <p className="text-[#5c5c5c]">Načítám agenty...</p>;
  if (error) return <p className="text-[#e85d5d]">Chyba: {error}</p>;

  return (
    <div className="space-y-3">
      {streamingAgent && (
        <AgentStream
          agentName={streamingAgent}
          onClose={handleStreamClose}
          onDone={(data) => {
            const ts = new Date().toLocaleTimeString("en-GB", { hour12: false });
            setJobLog((l) => [
              {
                time: ts,
                agent: streamingAgent,
                text: `✔ Dokončeno (${data.tokens || 0} tokens)`,
                status: "done",
                detail: data.text || "(Agent nedodal žádný textový výstup)",
              },
              ...l,
            ]);
            invalidateCache(`${API}/api/agents`);
          }}
        />
      )}

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
                onClick={() => streamAgent(agent.name)}
                className="text-[10px] px-3 py-1.5 rounded-md font-semibold bg-[#C89B3C] text-[#0a0a0a] hover:bg-[#8f6f26] transition-colors"
              >
                ▶ Spustit
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
              <p className="text-xs">
                Status:{" "}
                <span className={`font-semibold ${
                  agent.manifest.status === "blocked" ? "text-[#e85d5d]"
                  : agent.manifest.status === "complete" || agent.manifest.status === "done" ? "text-[#3ecf8e]"
                  : agent.manifest.status?.includes("ready") ? "text-[#e5b34b]"
                  : "text-[#9d9d9d]"
                }`}>
                  {agent.manifest.status || "—"}
                </span>
              </p>
              {agent.manifest.completedAt && (
                <p className="text-xs text-[#5c5c5c]">
                  Dokončeno: {agent.manifest.completedAt}
                </p>
              )}
              {agent.manifest.summary && (
                <p className="text-xs text-[#9d9d9d] mt-1">{agent.manifest.summary}</p>
              )}
              {Array.isArray(agent.manifest.deliverables) && agent.manifest.deliverables.length > 0 && (
                <div className="mt-2">
                  <p className="text-[10px] text-[#5c5c5c] uppercase tracking-wider mb-1">Výstupy (deliverables)</p>
                  <div className="space-y-1">
                    {agent.manifest.deliverables.map((d, i) => (
                      <div key={i} className="flex items-center gap-2 text-[10px]">
                        <span className={`shrink-0 ${
                          d.status === "complete" ? "text-[#3ecf8e]"
                          : d.status?.includes("ready") ? "text-[#e5b34b]"
                          : d.status === "active" ? "text-[#C89B3C]"
                          : "text-[#5c5c5c]"
                        }`}>
                          {d.status === "complete" ? "✓" : d.status?.includes("ready") ? "▲" : d.status === "active" ? "●" : "○"}
                        </span>
                        <span className="text-[#9d9d9d] truncate" title={d.path || ""}>{d.name || d.path || "—"}</span>
                      </div>
                    ))}
                  </div>
                </div>
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

      <WebhookSettings />
      <McpManager />

      {/* Job activity log */}
      {jobLog.length > 0 && (
        <div className="bg-[#0a0a0a] border border-[#232323] rounded-lg p-3">
          <p className="text-[10px] text-[#5c5c5c] uppercase tracking-wider mb-1">
            Aktivita
          </p>
          {jobLog.map((entry, i) => (
            <div key={i} className="py-1 border-b border-[#232323] last:border-b-0">
              <p className="text-[10px] font-mono text-[#5c5c5c]">
                <span className="text-[#C89B3C]">{entry.time}</span>{" "}
                <span className="text-[#9d9d9d]">[{entry.agent}]</span>{" "}
                <span className={entry.status === "error" ? "text-[#e85d5d]" : entry.status === "done" ? "text-[#3ecf8e]" : ""}>{entry.text}</span>
              </p>
              {entry.detail && (
                <pre className="mt-1 text-[10px] font-mono text-[#9d9d9d] bg-[#111] border border-[#232323] rounded p-2 max-h-48 overflow-y-auto whitespace-pre-wrap break-all">
                  {entry.detail}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
