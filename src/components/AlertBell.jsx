import { useState, useEffect } from "react";
import { API } from "../config";

function AlertBell({ onOpenFeed }) {
  const [summary, setSummary] = useState({ critical: 0, warning: 0, info: 0, total: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const res = await fetch(`${API}/api/alerts`);
        if (!res.ok) throw new Error("HTTP " + res.status);
        const data = await res.json();
        if (mounted) {
          setSummary(data.summary || { critical: 0, warning: 0, info: 0, total: 0 });
          setLoading(false);
        }
      } catch {
        if (mounted) setLoading(false);
      }
    };

    load();
    const id = setInterval(load, 30_000); // refresh every 30s
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  if (loading) {
    return (
      <button className="relative p-2 text-[#5c5c5c] hover:text-[#C89B3C] transition-colors">
        🔔
      </button>
    );
  }

  const hasCritical = summary.critical > 0;
  const hasWarning = summary.warning > 0;
  const hasAny = summary.total > 0;

  return (
    <button
      onClick={onOpenFeed}
      className={`relative p-2 transition-colors ${
        hasCritical ? "text-red-400 hover:text-red-300" :
        hasWarning ? "text-[#C89B3C] hover:text-[#8f6f26]" :
        hasAny ? "text-[#9d9d9d] hover:text-[#C89B3C]" :
        "text-[#5c5c5c] hover:text-[#C89B3C]"
      }`}
      title={`Alerts: ${summary.critical} critical, ${summary.warning} warning, ${summary.info} info`}
    >
      🔔
      {hasAny && (
        <span className={`absolute top-0 right-0 flex items-center justify-center min-w-[18px] h-[18px] text-[10px] font-bold rounded-full border border-[#111] ${
          hasCritical ? "bg-red-500 text-white" :
          hasWarning ? "bg-[#C89B3C] text-[#0a0a0a]" :
          "bg-[#5c5c5c] text-white"
        }`}>
          {summary.total > 9 ? "9+" : summary.total}
        </span>
      )}
    </button>
  );
}

export default AlertBell;
