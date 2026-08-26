#!/bin/bash
# Spustí Sovereign Dashboard: backend (8891, auto-restart wrapper) + frontend Vite (3205)
# PARALELNĚ. Na ukončení (Ctrl+C / SIGTERM) zastaví oba čistě.
#
# Proč ne "start.sh && vite": start.sh je keepalive while-loop, který nikdy
# neskončí, takže sekvenční `&&` vite NIKDY nespustí. Oba musí běžet souběžně.

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

echo "[dev] Spouštím backend (8891) + frontend (3205) paralelně..."
bash scripts/start.sh &
BACKEND_PID=$!

npx vite --port 3205 &
FRONTEND_PID=$!

# Na exit/Ctrl+C zastav obě vrstvy (start.sh sám restartuje backend,
# takže pro backend spustíme i stop.sh, který odpálí wrapper + node).
cleanup() {
  echo ""
  echo "[dev] Ukončuji backend + frontend..."
  bash scripts/stop.sh 2>/dev/null || true
  kill "$FRONTEND_PID" 2>/dev/null || true
  wait "$FRONTEND_PID" 2>/dev/null || true
  echo "[dev] Hotovo. Oba procesy zastaveny."
  exit 0
}
trap cleanup INT TERM

# Čeká na frontend; pokud vite spadne, ukončíme i backend.
wait "$FRONTEND_PID"
FRONTEND_CODE=$?
echo "[dev] Frontend skončil (exit $FRONTEND_CODE). Zastavuji backend..."
bash scripts/stop.sh 2>/dev/null || true
exit "$FRONTEND_CODE"
