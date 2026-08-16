#!/bin/bash
# Zastaví Sovereign Dashboard backend + wrapper.

set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"
PID_FILE="$DIR/server.pid"

stop_backend() {
  if [[ -f "$PID_FILE" ]]; then
    PID=$(cat "$PID_FILE" 2>/dev/null || echo "")
    if [[ -n "$PID" && "$PID" != "0" ]] && kill -0 "$PID" 2>/dev/null; then
      echo "Zastavuji backend (PID $PID)..."
      kill "$PID" 2>/dev/null || true
      sleep 1
      if kill -0 "$PID" 2>/dev/null; then
        kill -9 "$PID" 2>/dev/null || true
      fi
    fi
    rm -f "$PID_FILE"
  fi
}

stop_wrapper() {
  # Najít wrapper proces (bash -c "...while true...node server/index.cjs...")
  # Wrapper běží jako: bash -c '... while true; do node server/index.cjs ...'
  local WRAPPER_PIDS
  WRAPPER_PIDS=$(ps aux | grep -E "while true.*node server/index\.cjs" | grep -v grep | awk '{print $2}')
  if [[ -n "$WRAPPER_PIDS" ]]; then
    for WPID in $WRAPPER_PIDS; do
      echo "Zastavuji wrapper (PID $WPID)..."
      kill "$WPID" 2>/dev/null || true
    done
    sleep 1
    for WPID in $WRAPPER_PIDS; do
      if kill -0 "$WPID" 2>/dev/null; then
        kill -9 "$WPID" 2>/dev/null || true
      fi
    done
  fi
}

stop_backend
stop_wrapper

# Ověřit, že backend neběží
if curl -s -m 3 "http://localhost:8891/health" > /dev/null 2>&1; then
  echo "⚠️ Backend stále běží. Zkusím znovu..."
  stop_backend
  stop_wrapper
  sleep 2
  if curl -s -m 3 "http://localhost:8891/health" > /dev/null 2>&1; then
    echo "❌ Backend se nedaří zastavit."
    exit 1
  fi
fi

echo "✅ Backend zastaven."
