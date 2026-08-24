import { useState, useEffect, useRef, useCallback } from "react";
import { API, authHeaders } from "../config";

/**
 * AgentStream — Live terminal window pro sledování běžícího agenta přes SSE.
 */
function AgentStream({ agentName, onClose, onDone }) {
  const [log, setLog] = useState([]);
  const [status, setStatus] = useState("connecting"); // connecting | running | done | error
  const [error, setError] = useState(null);
  const [metrics, setMetrics] = useState({ tokens: 0, startedAt: null, endedAt: null });
  const bottomRef = useRef(null);
  const abortRef = useRef(null);

  const addLine = useCallback((type, text) => {
    const ts = new Date().toLocaleTimeString("en-GB", { hour12: false });
    setLog((prev) => [...prev.slice(-500), { type, text, ts }]);
  }, []);

  useEffect(() => {
    if (!agentName) return;

    setStatus("connecting");
    setError(null);
    setLog([]);
    setMetrics({ tokens: 0, startedAt: Date.now(), endedAt: null });

    const url = new URL(`${API}/api/agents/${encodeURIComponent(agentName)}/stream`);
    const token = authHeaders()["x-auth-token"];
    if (token) url.searchParams.set("token", token); // SSE nepodporuje custom headers

    const es = new EventSource(url.toString());
    abortRef.current = () => es.close();

    es.addEventListener("start", (e) => {
      const data = JSON.parse(e.data);
      setStatus("running");
      addLine("info", `▶ Agent stream started: ${data.agent}`);
    });

    es.addEventListener("stdout", (e) => {
      const data = JSON.parse(e.data);
      addLine("stdout", data.chunk);
    });

    es.addEventListener("stderr", (e) => {
      const data = JSON.parse(e.data);
      addLine("stderr", data.chunk);
    });

    es.addEventListener("error", (e) => {
      const data = JSON.parse(e.data || '{"message":"Stream error"}');
      setStatus("error");
      setError(data.message);
      addLine("error", `✗ ${data.message}`);
      setMetrics((m) => ({ ...m, endedAt: Date.now() }));
    });

    es.addEventListener("done", (e) => {
      const data = JSON.parse(e.data);
      setStatus("done");
      addLine("info", `✓ Agent ${data.agent} done — ${data.tokens} tokens`);
      setMetrics((m) => ({ ...m, tokens: data.tokens, endedAt: Date.now() }));
      es.close();
      if (onDone) onDone(data);
    });

    es.addEventListener("open", () => {
      addLine("info", "SSE connected");
    });

    es.addEventListener("heartbeat", (e) => {
      // Nezobrazuj každý heartbeat v logu, ale updatuj status
      setStatus((s) => s === "connecting" ? "running" : s);
    });

    // Native onerror se vyvolá při network error nebo uzavření spojení
    es.onerror = (err) => {
      if (status !== "done" && status !== "error") {
        setStatus("error");
        setError("Spojení přerušeno");
        addLine("error", "✗ Spojení přerušeno");
      }
    };

    return () => {
      es.close();
    };
  }, [agentName, addLine, onDone]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log]);

  const handleAbort = () => {
    if (abortRef.current) abortRef.current();
    addLine("info", "■ Stream ukončen uživatelem");
    setStatus("aborted");
    onClose?.();
  };

  const formatDuration = () => {
    const end = metrics.endedAt || Date.now();
    const ms = end - metrics.startedAt;
    if (!ms || ms < 0) return "0s";
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="w-[90vw] max-w-4xl h-[80vh] bg-[#111] border border-[#232323] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#232323]">
          <div className="flex items-center gap-3">
            <div className={`w-2.5 h-2.5 rounded-full ${
              status === "running" ? "bg-green-400 animate-pulse" :
              status === "connecting" ? "bg-yellow-400 animate-pulse" :
              status === "done" ? "bg-[#C89B3C]" :
              "bg-red-400"
            }`} />
            <span className="text-[13px] font-medium text-[#f4f4f4]">
              Agent Stream: {agentName}
            </span>
            <span className="text-[11px] text-[#5c5c5c]">
              {status.toUpperCase()} · {formatDuration()} · {metrics.tokens > 0 && `${metrics.tokens} tokens`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {status === "running" && (
              <button
                onClick={handleAbort}
                className="px-3 py-1 text-[11px] font-medium text-red-400 border border-red-400/30 rounded-lg hover:bg-red-400/10 transition-colors"
              >
                Abort
              </button>
            )}
            <button
              onClick={onClose}
              className="px-3 py-1 text-[11px] text-[#9d9d9d] hover:text-[#f4f4f4] transition-colors"
            >
              Close
            </button>
          </div>
        </div>

        {/* Terminal */}
        <div className="flex-1 overflow-y-auto p-4 font-mono text-[12px] leading-relaxed bg-[#0a0a0a]">
          {log.length === 0 && (
            <div className="text-[#5c5c5c] italic">Čekání na první data ze streamu…</div>
          )}
          {log.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap break-words mb-0.5">
              <span className="text-[#5c5c5c] mr-2">[{line.ts}]</span>
              <span className={
                line.type === "stderr" ? "text-red-400" :
                line.type === "error" ? "text-red-400 font-medium" :
                line.type === "info" ? "text-[#C89B3C]" :
                "text-[#d4d4d4]"
              }>
                {line.text}
              </span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Footer status */}
        <div className="px-4 py-2 border-t border-[#232323] text-[11px] text-[#5c5c5c] flex justify-between">
          <span>{error ? `Error: ${error}` : "SSE connection"}</span>
          <span>Lines: {log.length}</span>
        </div>
      </div>
    </div>
  );
}

export default AgentStream;
