// Čisté formátovací funkce (testovatelné bez transpilace).

// Formátuje elapsed time (ms → "12s" / "3m 45s" / "1h 5m")
export function formatElapsed(ms) {
  if (ms == null || ms < 0 || Number.isNaN(ms)) return "—";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const min = Math.floor((totalSec % 3600) / 60);
  const sec = totalSec % 60;
  if (h > 0) return `${h}h ${min}m`;
  if (min > 0) return `${min}m ${sec}s`;
  return `${sec}s`;
}
