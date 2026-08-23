import { useState, useEffect } from "react";
import { API, cachedFetch } from "../config";

const sectorColors = {
  accounting: { bg: "rgba(62,207,142,0.12)", color: "#3ecf8e" },
  legal: { bg: "rgba(200,155,60,0.12)", color: "#C89B3C" },
  logistics: { bg: "rgba(229,179,75,0.12)", color: "#e5b34b" },
  "e-commerce": { bg: "rgba(93,156,236,0.12)", color: "#5d9cec" },
  manufacturing: { bg: "rgba(232,93,93,0.12)", color: "#e85d5d" },
  healthcare: { bg: "rgba(62,207,142,0.12)", color: "#3ecf8e" },
  real_estate: { bg: "rgba(200,155,60,0.12)", color: "#C89B3C" },
  insurance: { bg: "rgba(229,179,75,0.12)", color: "#e5b34b" },
  marketing: { bg: "rgba(93,156,236,0.12)", color: "#5d9cec" },
  customer_service: { bg: "rgba(62,207,142,0.12)", color: "#3ecf8e" },
};

const fallbackColor = { bg: "rgba(92,92,92,0.2)", color: "#5c5c5c" };

export default function Leads() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("ALL");
  const [error, setError] = useState(null);

  const load = () => {
    setLoading(true);
    cachedFetch(`${API}/api/leads`)
      .then((data) => {
        setLeads(data);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  };

  useEffect(load, []);

  const sectors = ["ALL", ...new Set(leads.map((l) => l.sector).filter(Boolean))];
  const filtered = filter === "ALL" ? leads : leads.filter((l) => l.sector === filter);

  return (
    <div className="space-y-4">
      {/* Header + stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[#111] border border-[#232323] rounded-xl p-4">
          <p className="text-[10px] text-[#5c5c5c] uppercase tracking-wider">Celkem leadů</p>
          <p className="text-2xl font-semibold text-[#C89B3C] mt-1">{leads.length}</p>
        </div>
        <div className="bg-[#111] border border-[#232323] rounded-xl p-4">
          <p className="text-[10px] text-[#5c5c5c] uppercase tracking-wider">Sektorů</p>
          <p className="text-2xl font-semibold text-[#3ecf8e] mt-1">{new Set(leads.map((l) => l.sector)).size}</p>
        </div>
        <div className="bg-[#111] border border-[#232323] rounded-xl p-4">
          <p className="text-[10px] text-[#5c5c5c] uppercase tracking-wider">Zdroje souborů</p>
          <p className="text-2xl font-semibold text-[#5d9cec] mt-1">{new Set(leads.map((l) => l.sourceFile)).size}</p>
        </div>
        <div className="bg-[#111] border border-[#232323] rounded-xl p-4">
          <p className="text-[10px] text-[#5c5c5c] uppercase tracking-wider">K dispozici</p>
          <p className="text-2xl font-semibold text-[#e5b34b] mt-1">{filtered.length}</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex flex-wrap gap-2">
        {sectors.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-md font-semibold border transition-colors ${
              filter === s
                ? "text-[#C89B3C] border-[#C89B3C] bg-[rgba(200,155,60,0.1)]"
                : "text-[#5c5c5c] border-[#232323] hover:text-[#9d9d9d]"
            }`}
          >
            {s}
          </button>
        ))}
        <button
          onClick={load}
          className="ml-auto text-xs text-[#C89B3C] hover:text-[#8f6f26] transition-colors"
        >
          ↻ Refresh
        </button>
      </div>

      {error && (
        <p className="text-[#e85d5d] text-sm bg-[rgba(232,93,93,0.1)] border border-[rgba(232,93,93,0.3)] rounded-lg p-3">
          Chyba: {error}
        </p>
      )}

      {loading ? (
        <p className="text-[#5c5c5c]">Načítám leady...</p>
      ) : filtered.length === 0 ? (
        <p className="text-[#5c5c5c]">Žádné leady. Spusť Scouta v Pipeline tabu.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((lead, i) => {
            const c = sectorColors[lead.sector] || fallbackColor;
            return (
              <div key={i} className="bg-[#111] border border-[#232323] rounded-xl p-4 hover:border-[#8f6f26] transition-all">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-semibold">{lead.name}</h3>
                  <span
                    className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md font-semibold"
                    style={{ background: c.bg, color: c.color }}
                  >
                    {lead.sector || "—"}
                  </span>
                </div>
                <p className="text-xs text-[#5c5c5c] mb-2">
                  {lead.location || "—"} {lead.size_guess_employees ? `• ${lead.size_guess_employees}` : ""}
                </p>
                {lead.repetitive_task && (
                  <p className="text-xs text-[#9d9d9d] mb-1">
                    <span className="text-[#C89B3C]">Úkol:</span> {lead.repetitive_task}
                  </p>
                )}
                {lead.ai_value && (
                  <p className="text-xs text-[#9d9d9d] mb-2">
                    <span className="text-[#C89B3C]">AI:</span> {lead.ai_value}
                  </p>
                )}
                <div className="flex items-center gap-3 text-[10px]">
                  {lead.website && (
                    <a
                      href={lead.website}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#C89B3C] hover:text-[#8f6f26]"
                    >
                      Web ↗
                    </a>
                  )}
                  <span className="text-[#5c5c5c]">{lead.sourceFile}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
