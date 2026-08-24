#!/bin/bash
# Sovereign Dashboard — start obou služeb najednou.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
# Spustí: backend (auto-restart) + frontend (Vite HMR).
# Ctrl+C = clean shutdown obou.

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

BACKEND_PORT=8891
FRONTEND_PORT=3205
BACKEND_PID_FILE="$DIR/.backend.pid"
FRONTEND_PID_FILE="$DIR/.frontend.pid"
BACKEND_LOG="$DIR/backend_dev.log"

# --- Frontend proxy: změň VITE_API_URL na prázdný (použij relative URL /) ---
# Pak Vite proxy přepošle /api/* na backend.
if grep -q "^VITE_API_URL=" .env 2>/dev/null; then
  # Nechat tak jak je — Vite proxy funguje i s plnou URL
  :
fi

cleanup() {
  echo ""
  echo "🛑 Shutdown..."
  [[ -f "$BACKEND_PID_FILE" ]] && kill "$(cat "$BACKEND_PID_FILE")" 2>/dev/null || true
  [[ -f "$FRONTEND_PID_FILE" ]] && kill "$(cat "$FRONTEND_PID_FILE")" 2>/dev/null || true
  echo "✅ Clean shutdown."
  exit 0
}
trap cleanup SIGINT SIGTERM

# --- Spusť backend (auto-restart) ---
echo "🚀 Spouštím backend (port $BACKEND_PORT)..."
nohup bash -c '
  restart_count=0
  window_start=$(date +%s)
  while true; do
    node server/index.cjs >> "'"$BACKEND_LOG"'" 2>&1
    exit_code=$?
    if (( exit_code == 0 )); then
      exit 0
    fi
    now=$(date +%s)
    if (( now - window_start > 60 )); then
      restart_count=0
      window_start=$now
    fi
    restart_count=$((restart_count + 1))
    if (( restart_count > 10 )); then
      echo "[$(date)] Crash-loop detekován. Zastavuji." >> "'"$BACKEND_LOG"'"
      exit 1
    fi
    echo "[$(date)] Backend spadl. Restart za 2s..." >> "'"$BACKEND_LOG"'" 
    sleep 2
  done
' > /dev/null 2>&1 &
BACKEND_PID=$!
echo "$BACKEND_PID" > "$BACKEND_PID_FILE"

# Počkej na backend
for i in {1..20}; do
  sleep 0.5
  if curl -s -m 1 "http://localhost:$BACKEND_PORT/health" > /dev/null 2>&1; then
    echo "✅ Backend běží (PID $BACKEND_PID)"
    break
  fi
  if (( i == 20 )); then
    echo "❌ Backend se nespustil. Viz $BACKEND_LOG"
    cat "$BACKEND_LOG" | tail -5
    kill "$BACKEND_PID" 2>/dev/null || true
    exit 1
  fi
done

# --- Spusť frontend (Vite) ---
echo "🚀 Spouštím frontend (port $FRONTEND_PORT)..."
cd "$DIR"
npx vite --port "$FRONTEND_PORT" > /tmp/sovereign_vite.log 2>&1 &
FRONTEND_PID=$!
echo "$FRONTEND_PID" > "$FRONTEND_PID_FILE"

for i in {1..20}; do
  sleep 0.5
  if curl -s -m 1 "http://localhost:$FRONTEND_PORT" > /dev/null 2>&1; then
    echo "✅ Frontend běží (PID $FRONTEND_PID)"
    break
  fi
  if (( i == 20 )); then
    echo "❌ Frontend se nespustil. Viz /tmp/sovereign_vite.log"
    exit 1
  fi
done

echo ""
echo "========================================="
echo "🏠  Dashboard:   http://localhost:$FRONTEND_PORT"
echo "🔌  API:         http://localhost:$BACKEND_PORT"
echo "📋  Backend log: $BACKEND_LOG"
echo "========================================="
echo ""
echo "Ctrl+C = shutdown obou služeb"
echo ""

# Čekej na cokoliv zemře
wait $([[ -f "$BACKEND_PID_FILE" ]] && cat "$BACKEND_PID_FILE" || echo 0) 2>/dev/null || true
