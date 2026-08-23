// Systémový gauge (CPU/RAM/Disk) pro Paparazzi.

export default function SystemGauge({ label, pct, sub }) {
  const color = pct >= 80 ? "#e85d5d" : pct >= 60 ? "#e5b34b" : "#3ecf8e";
  return (
    <div className="text-center">
      <div className="relative w-16 h-16 mx-auto mb-1">
        <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="#232323" strokeWidth="3" />
          <circle
            cx="18" cy="18" r="15.9" fill="none"
            stroke={color} strokeWidth="3" strokeLinecap="round"
            strokeDasharray={`${(pct || 0) * 1.0} 100`}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm font-bold" style={{ color }}>
          {pct}%
        </span>
      </div>
      <div className="text-[10px] uppercase tracking-wider text-[#5c5c5c]">{label}</div>
      <div className="text-[9px] text-[#5c5c5c] font-mono">{sub}</div>
    </div>
  );
}
