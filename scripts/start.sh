#!/bin/bash
# Robustní start Sovereign Dashboard backendu s auto-restartem.
# Backend běží jako detached proces (přežije zavření terminálu).
# Auto-restart: když backend spadne, do 2s se restartuje.

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

PORT=8891
PID_FILE="$DIR/server.pid"
LOG_FILE="$DIR/server_debug.log"
MAX_RESTARTS=10          # max restartů za 60s (ochrana proti crash-loopu)
RESTART_WINDOW=60

# Pokud už backend běží, ukonči
if [[ -f "$PID_FILE" ]]; then
  OLD_PID=$(cat "$PID_FILE" 2>/dev/null || echo "")
  if [[ -n "$OLD_PID" && "$OLD_PID" != "0" ]] && kill -0 "$OLD_PID" 2>/dev/null; then
    echo "Backend už běží (PID $OLD_PID). Ukončuji..."
    kill "$OLD_PID" 2>/dev/null || true
    sleep 1
  fi
  rm -f "$PID_FILE"
fi

# Spustit backend jako detached proces s auto-restartem
echo "Spouštím Sovereign API na portu $PORT (auto-restart)..."
nohup bash -c '
  restart_count=0
  window_start=$(date +%s)
  while true; do
    node server/index.cjs >> server_debug.log 2>&1
    exit_code=$?
    now=$(date +%s)
    # Reset window po 60s
    if (( now - window_start > 60 )); then
      restart_count=0
      window_start=$now
    fi
    restart_count=$((restart_count + 1))
    if (( restart_count > 10 )); then
      echo "[$(date)] Crash-loop detekován (10+ restartů za 60s). Zastavuji." >> server_debug.log
      exit 1
    fi
    echo "[$(date)] Backend spadl (exit $exit_code). Restart za 2s..." >> server_debug.log
    sleep 2
  done
' > /dev/null 2>&1 &

# Počkat na start
for i in {1..10}; do
  sleep 0.5
  if curl -s -m 1 "http://localhost:$PORT/health" > /dev/null 2>&1; then
    echo "✅ Sovereign API běží na http://localhost:$PORT"
    echo "   PID: $(cat "$PID_FILE" 2>/dev/null || echo 'n/a')"
    echo "   Log: $LOG_FILE"
    exit 0
  fi
done

echo "⚠️ Backend se nespustil do 5s. Zkontroluj $LOG_FILE"
exit 1
