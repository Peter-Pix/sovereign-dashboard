// Spinner — animované logo + elapsed time pro běžící operace.
import { useState, useEffect } from "react";
import { formatElapsed } from "../lib/format";

export default function Spinner({ label = "Pracuji", startedAt = null }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = startedAt || Date.now();
    const tick = () => setElapsed(Date.now() - start);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  return (
    <span className="inline-flex items-center gap-2">
      {/* Animované logo — rotující Sovereign oko */}
      <span className="relative inline-flex w-4 h-4">
        <span className="absolute inset-0 rounded-full border-2 border-[#C89B3C] border-t-transparent animate-spin" />
        <span className="absolute inset-[3px] rounded-full bg-[#C89B3C] opacity-60 animate-pulse" />
      </span>
      <span className="text-[10px] text-[#C89B3C] font-semibold">{label}</span>
      <span className="text-[10px] text-[#5c5c5c] font-mono tabular-nums">
        {formatElapsed(elapsed)}
      </span>
    </span>
  );
}
