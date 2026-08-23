// Malé statistiky (Stat + MiniStat) pro Paparazzi přehled.

export function Stat({ label, value, color }) {
  return (
    <div className="text-center">
      <div className="text-xl font-bold" style={{ color }}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-[#5c5c5c]">{label}</div>
    </div>
  );
}

export function MiniStat({ label, value, warn }) {
  return (
    <div className="bg-[#0a0a0a] rounded-lg py-1.5">
      <div className="text-xs font-semibold" style={{ color: warn ? "#e5b34b" : "#e8e8e8" }}>{value}</div>
      <div className="text-[9px] uppercase tracking-wider text-[#5c5c5c]">{label}</div>
    </div>
  );
}
