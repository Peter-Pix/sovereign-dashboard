import { useState, useEffect, useRef, useCallback } from "react";
import { API, authHeaders } from "../config";

/**
 * AgentStream — Live terminal window pro sledování běžícího agenta přes SSE.
 *
 * Architektura: log je v useRef (žádné React state re-rendery).
 * Řádky se přidávají imperativně do DOM. Scroll se děje přes
 * requestAnimationFrame, ne scrollIntoView (ten způsobuje "vyskočení").
 */
function AgentStream({ agentName, onClose, onDone }) {
  const [status, setStatus] = useState("connecting");
  const [error, setError] = useState(null);
  const [metrics, setMetrics] = useState({ tokens: 0, startedAt: null, endedAt: null });

  const containerRef = useRef(null);
  const abortRef = useRef(null);
  const esRef = useRef(null);
  const lineCountRef = useRef(0);

  const formatDuration = () => {
    const end = metrics.endedAt || Date.now();
    const ms = end - metrics.startedAt;
    if (!ms || ms < 0) return "0s";
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
  };

  useEffect(() => {
    if (!agentName) return;

    setStatus("connecting");
    setError(null);
    setMetrics({ tokens: 0, startedAt: Date.now(), endedAt: null });
    lineCountRef.current = 0;

    // Vyčisti container
    const container = containerRef.current;
    if (container) {
      container.innerHTML =
        '<div style="color:#5c5c5c;font-style:italic">Čekání na první data…</div>';
    }

    const url = new URL(`${API}/api/agents/${encodeURIComponent(agentName)}/stream`);
    const token = authHeaders()["x-auth-token"];
    if (token) url.searchParams.set("token", token);

    const es = new EventSource(url.toString());
    esRef.current = es;

    // --- Batched append: nasbírá řádky do fronty a flushuje je v JEDNOM
    // requestAnimationFrame ticku. Zabraňuje "trhání" kontejneru, když
    // agent posílá dávku chunku na začátku streamu (prvních ~20 řádků).
    let pendingLines = [];
    let rafId = null;
    let placeholderEl = null;

    const flushBatch = () => {
      rafId = null;
      const container = containerRef.current;
      if (!container || pendingLines.length === 0) return;

      if (placeholderEl) {
        placeholderEl.remove();
        placeholderEl = null;
      }

      // Jeden DocumentFragment = jedna DOM operace místo N
      const frag = document.createDocumentFragment();
      for (const line of pendingLines) {
        const div = document.createElement("div");
        div.className = "whitespace-pre-wrap break-words mb-0.5";

        const timeSpan = document.createElement("span");
        timeSpan.className = "text-[#5c5c5c] mr-2";
        timeSpan.textContent = `[${line.ts}]`;

        const textSpan = document.createElement("span");
        if (line.type === "stderr" || line.type === "error") {
          textSpan.className = "text-red-400" + (line.type === "error" ? " font-medium" : "");
        } else if (line.type === "info") {
          textSpan.className = "text-[#C89B3C]";
        } else {
          textSpan.className = "text-[#d4d4d4]";
        }
        textSpan.textContent = line.text;

        div.appendChild(timeSpan);
        div.appendChild(textSpan);
        frag.appendChild(div);
      }

      container.appendChild(frag);
      pendingLines = [];

      // Scroll až na konec — po vložení celé dávky
      container.scrollTop = container.scrollHeight;
    };

    const scheduleFlush = () => {
      if (rafId === null) {
        rafId = requestAnimationFrame(flushBatch);
      }
    };

    const appendLine = (type, text, ts) => {
      const container = containerRef.current;
      if (!container || !text) return;

      if (!placeholderEl) {
        placeholderEl = container.querySelector('div[style*="italic"]');
      }
      lineCountRef.current++;
      pendingLines.push({ type, text, ts });

      // Omezení velikosti fronty — pokud moc narostla, flush hned
      if (pendingLines.length >= 30) {
        if (rafId !== null) cancelAnimationFrame(rafId);
        flushBatch();
      } else {
        scheduleFlush();
      }
    };

    const handleEvent = (eventName) => (e) => {
      try {
        const data = JSON.parse(e.data);

        if (eventName === "start") {
          setStatus("running");
          appendLine("info", `▶ Stream started: ${data.agent}`, new Date().toLocaleTimeString("en-GB", { hour12: false }));
        } else if (eventName === "stdout") {
          appendLine("stdout", data.chunk || "", new Date().toLocaleTimeString("en-GB", { hour12: false }));
        } else if (eventName === "stderr") {
          appendLine("stderr", data.chunk || "", new Date().toLocaleTimeString("en-GB", { hour12: false }));
        } else if (eventName === "error") {
          setStatus("error");
          setError(data.message);
          appendLine("error", `✗ ${data.message}`, new Date().toLocaleTimeString("en-GB", { hour12: false }));
        } else if (eventName === "done") {
          setStatus("done");
          setMetrics((m) => ({ ...m, tokens: data.tokens, endedAt: Date.now() }));
          appendLine("info", `✓ Done — ${data.tokens} tokens`, new Date().toLocaleTimeString("en-GB", { hour12: false }));
          es.close();
          if (onDone) onDone(data);
        } else if (eventName === "heartbeat") {
          // heartbeat jen udržuje connection alive, žádná vizuální změna
        }
      } catch {}
    };

    es.addEventListener("start", handleEvent("start"));
    es.addEventListener("stdout", handleEvent("stdout"));
    es.addEventListener("stderr", handleEvent("stderr"));
    es.addEventListener("error", handleEvent("error"));
    es.addEventListener("done", handleEvent("done"));
    es.addEventListener("heartbeat", () => {});

    es.onerror = () => {
      if (status !== "done" && status !== "error") {
        setStatus("error");
        setError("Spojení přerušeno");
        appendLine("error", "✗ Spojení přerušeno", new Date().toLocaleTimeString("en-GB", { hour12: false }));
      }
    };

    abortRef.current = () => es.close();

    return () => {
      // Vyprázdni čekající frontu a zruš plánovaný rAF
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (pendingLines.length > 0) flushBatch();
      es.close();
    };
  }, [agentName]);

  const handleAbort = useCallback(() => {
    if (abortRef.current) abortRef.current();
    setStatus("aborted");
    onClose?.();
  }, [onClose]);

  const statusColors = {
    connecting: "bg-yellow-400 animate-pulse",
    running: "bg-green-400 animate-pulse",
    done: "bg-[#C89B3C]",
    error: "bg-red-400",
    aborted: "bg-orange-400",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="w-[90vw] max-w-4xl h-[80vh] bg-[#111] border border-[#232323] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#232323] shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-2.5 h-2.5 rounded-full ${statusColors[status] || "bg-gray-400"}`} />
            <span className="text-[13px] font-medium text-[#f4f4f4]">
              Agent Stream: {agentName}
            </span>
            <span className="text-[11px] text-[#5c5c5c]">
              {status.toUpperCase()} · {formatDuration()}
              {metrics.tokens > 0 && ` · ${metrics.tokens} tokens`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {(status === "running" || status === "connecting") && (
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

        {/* Terminal — scroll container, ref na něj */}
        <div
          ref={containerRef}
          className="flex-1 overflow-y-auto p-4 font-mono text-[12px] leading-relaxed bg-[#0a0a0a]"
        />

        {/* Footer */}
        <div className="px-4 py-2 border-t border-[#232323] text-[11px] text-[#5c5c5c] flex justify-between shrink-0">
          <span>{error ? `Error: ${error}` : "SSE connection"}</span>
          <span>Lines: {lineCountRef.current}</span>
        </div>
      </div>
    </div>
  );
}

export default AgentStream;
