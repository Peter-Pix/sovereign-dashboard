// Čisté formátovací funkce (testovatelné bez transpilace).

// Formátuje elapsed time (ms → "12s" / "3m 45s")
export function formatElapsed(ms) {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min > 0) return `${min}m ${sec}s`;
  return `${sec}s`;
}
