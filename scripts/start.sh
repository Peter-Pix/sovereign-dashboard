#!/bin/bash
# Robustní start Sovereign Dashboard backendu s auto-restartem.
# Backend běží jako detached proces (přežije zavření terminálu).
# Auto-restart: když backend spadne, do 2s se restartuje.

# PATH musí být nastaven i pro launchd (nemá /opt/homebrew/bin)
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

PORT=8891
PID_FILE="$DIR/server.pid"
LOG_FILE="$DIR/server_debug.log"
MAX_RESTARTS=10
RESTART_WINDOW=60

if [[ -f "$PID_FILE" ]]; then
  OLD_PID=$(cat "$PID_FILE" 2>/dev/null || echo "")
  if [[ -n "$OLD_PID" && "$OLD_PID" != "0" ]] && kill -0 "$OLD_PID" 2>/dev/null; then
    echo "Backend už běží (PID $OLD_PID). Ukončuji..."
    kill "$OLD_PID" 2>/dev/null || true
    sleep 1
  fi
  rm -f "$PID_FILE"
fi

echo "Spouštím Sovereign API na portu $PORT (auto-restart)..."

# Ulož PID wrapperu (ne node procesu) — kill tohoto ukončí celý řetěz
echo $$ > "$PID_FILE"

restart_count=0
window_start=$(date +%s)

while true; do
  # Spustí node přímo, ne přes bash subshell — keepalive shell wrapper
  node server/index.cjs >> server_debug.log 2>&1
  exit_code=$?

  if (( exit_code == 0 )); then
    echo "[$(date)] Graceful shutdown. Ukončuji wrapper." >> server_debug.log
    exit 0
  fi

  now=$(date +%s)
  if (( now - window_start > 60 )); then
    restart_count=0
    window_start=$now
  fi

  restart_count=$((restart_count + 1))
  if (( restart_count > 10 )); then
    echo "[$(date)] Crash-loop detekován. Zastavuji." >> server_debug.log
    exit 1
  fi

  echo "[$(date)] Backend spadl (exit $exit_code). Restart za 2s..." >> server_debug.log
  sleep 2
done
