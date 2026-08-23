// Přehled — report, shrnutí, systém, karty projektů.
import Markdown from "../Markdown";
import { Stat } from "./Stat";
import SystemGauge from "./SystemGauge";
import ProjectCard from "./ProjectCard";
import { fmtBytes } from "./constants";

export default function Overview({ summary, projects, system, report, cached }) {
  const c = summary?.counts;
  return (
    <div className="space-y-5">
      {/* Manažer Report */}
      {report && (
        <div className="bg-[#0d0d0d] border border-[#C89B3C]/30 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#C89B3C]">
              🎤 Paparazzi — Manažer Report
            </h3>
            <div className="flex items-center gap-2">
              {report.cached && <span className="text-[10px] text-[#5c5c5c]">(cache)</span>}
              <span className="text-[10px] text-[#5c5c5c] font-mono">
                {report.generatedAt ? new Date(report.generatedAt).toLocaleTimeString("cs-CZ") : ""}
              </span>
            </div>
          </div>
          <Markdown text={report.report} />
        </div>
      )}

      {/* Shrnutí */}
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

      {/* Systémový monitoring */}
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

      {/* Karty projektů */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {projects.map((p) => (
          <ProjectCard key={p.name} p={p} />
        ))}
      </div>
    </div>
  );
}
