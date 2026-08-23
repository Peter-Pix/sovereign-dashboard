// Historie reportů — trend analysis.
import { useState, useEffect } from "react";
import { API as API_URL } from "../../config";

export default function History() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`${API_URL}/api/paparazzi/history`)
      .then((r) => r.json())
      .then((data) => {
        setHistory(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  if (loading) return <p className="text-[#5c5c5c]">Načítám historii...</p>;
  if (error) return <p className="text-[#e85d5d]">Chyba: {error}</p>;

  if (history.length === 0) {
    return (
      <div className="bg-[#111] border border-[#232323] rounded-xl p-6 text-center">
        <p className="text-[#5c5c5c] text-sm">Zatím žádná historie reportů.</p>
        <p className="text-[#5c5c5c] text-xs mt-1">Reporty se ukládají automaticky každou hodinu.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-[#C89B3C]">
        📜 Historie reportů ({history.length})
      </h3>
      {history.slice().reverse().map((entry, i) => (
        <div key={i} className="bg-[#111] border border-[#232323] rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-[#5c5c5c] font-mono">
              {entry.generatedAt ? new Date(entry.generatedAt).toLocaleString("cs-CZ") : "—"}
            </span>
            {entry.summary?.counts && (
              <span className="text-[10px] text-[#5c5c5c]">
                {entry.summary.counts.total} projektů · {entry.summary.counts.hot} žhavých
              </span>
            )}
          </div>
          <p className="text-xs text-[#9d9d9d] leading-relaxed line-clamp-3">
            {entry.report?.slice(0, 300) || "—"}
          </p>
        </div>
      ))}
    </div>
  );
}
