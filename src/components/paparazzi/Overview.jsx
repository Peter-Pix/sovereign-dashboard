// Přehled — report, shrnutí, systém, karty projektů.
import { useState, useEffect } from "react";
import Markdown from "../Markdown";
import { Stat } from "./Stat";
import SystemGauge from "./SystemGauge";
import ProjectCard from "./ProjectCard";
import { fmtBytes } from "./constants";
import { API as API_URL } from "../../config";

export default function Overview({ summary, projects, system, cached, refreshTrigger, onAddBug }) {
  const [report, setReport] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [reportMeta, setReportMeta] = useState(null);

  const streamReport = async (force = false) => {
    setIsStreaming(true);
    setReport("");
    
    try {
      const response = await fetch(`${API_URL}/api/paparazzi/report${force ? "?refresh=1" : ""}`);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedReport = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const dataStr = line.replace("data: ", "");
          try {
            const data = JSON.parse(dataStr);
            if (data.type === "token") {
              accumulatedReport += data.content;
              setReport(accumulatedReport);
            } else if (data.type === "metadata") {
              setReportMeta(data);
            } else if (data.type === "report") {
              setReport(data.content);
            }
          } catch (e) {
            console.error("SSE parse error:", e);
          }
        }
      }
    } catch (e) {
      console.error("Streaming error:", e);
    } finally {
      setIsStreaming(false);
    }
  };

  useEffect(() => {
    streamReport(refreshTrigger);
  }, [refreshTrigger]);

  const c = summary?.counts;
  return (
    <div className="space-y-5">
      <div className="bg-[#0d0d0d] border border-[#C89B3C]/30 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#C89B3C]">
            🎤 Paparazzi — Manažer Report {isStreaming && <span className="ml-2 animate-pulse opacity-70">(píše...)</span>}
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[#5c5c5c] font-mono">
              {reportMeta?.generatedAt ? new Date(reportMeta.generatedAt).toLocaleTimeString("cs-CZ") : ""}
            </span>
          </div>
        </div>
        <div className="min-h-[60px]">
          {report ? <Markdown text={report} /> : <p className="text-xs text-[#5c5c5c] italic">Paparazzi právě přemýšlí...</p>}
        </div>
      </div>

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

      {system && (
        <div className="bg-[#111] border border-[#232323] rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#C89B3C]">
              🖥️ Systém — The Big Eye
            </h3>
            <span className="text-[10px] text-[#5c5c5c] font-mono">{system.hostname}</span>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-3">
            <SystemGauge label="CPU" pct={system.cpu?.pct} sub={`${system.cpu?.load1}/${system.cpu?.load5} load`} />
            <SystemGauge label="RAM" pct={system.memory?.pct} sub={fmtBytes(system.memory?.used)} />
            <SystemGauge label="Disk" pct={system.disk?.pct} sub={`${system.disk?.used} / ${system.disk?.total}`} />
          </div>

          {system.processes?.length > 0 && (
            <div className="border-t border-[#232323] pt-3">
              <p className="text-[10px] uppercase tracking-wider text-[#5c5c5c] mb-2">Top procesy (CPU)</p>
              <div className="space-y-1">
                {system.processes.map((p, i) => (
                  <div key={i} className="flex items-center justify-between text-[11px]">
                    <span className="text-[#9d9d9d] truncate mr-2">{p.cmd}</span>
                    <span className="text-[#5c5c5c] font-mono shrink-0">{p.cpu}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-[10px] text-[#5c5c5c] mt-3 border-t border-[#232323] pt-2">
            Uptime: {system.uptime} · {system.platform}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-cols-2 lg:grid-cols-3 gap-3">
        {projects.map((p) => (
          <ProjectCard key={p.name} p={p} onAddBug={onAddBug} />
        ))}
      </div>
    </div>
  );
}
