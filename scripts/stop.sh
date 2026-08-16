#!/bin/bash
# Zastaví Sovereign Dashboard backend.

set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"
PID_FILE="$DIR/server.pid"

if [[ -f "$PID_FILE" ]]; then
  PID=$(cat "$PID_FILE" 2>/dev/null || echo "")
  if [[ -n "$PID" && "$PID" != "0" ]] && kill -0 "$PID" 2>/dev/null; then
    echo "Zastavuji backend (PID $PID)..."
    kill "$PID" 2>/dev/null || true
    sleep 1
    # Force kill pokud stále běží
    if kill -0 "$PID" 2>/dev/null; then
      kill -9 "$PID" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
    echo "✅ Backend zastaven."
  else
    echo "Backend neběží (PID $PID neexistuje)."
    rm -f "$PID_FILE"
  fi
else
  echo "Backend neběží (žádný PID soubor)."
fi
