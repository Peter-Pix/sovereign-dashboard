#!/bin/bash
# Zastaví Sovereign Dashboard kompletně a spolehlivě — backend (port 8891)
# i frontend Vite (port 3205).
#
# Proč tento soubor existuje: Sovereign má DVĚ vrstvy auto-restartu + frontend,
# které ho dělají "nezastavitelným", pokud je zabíjíš v špatném pořadí:
#   1) launchd  KeepAlive=true   → restartuje wrapper při každé smrti
#   2) start.sh while-loop        → restartuje node při každém crashu
#   3) vite frontend              → běží jako ORPHANED proces (z dev.sh / npm run dev)
#      mimo launchd, takže ho starý stop.sh nezachytil → ukazatel se točil
#
# Správné pořadí = 1) odpojit launchd (zastavit restart), 2) zabít wrapper,
# 3) zabít node backend, 4) zabít vite frontend. Verifikovat, že je VŠE mrtvé.
#
# DŮLEŽITÉ (lsof): na macOS je lsof v /usr/sbin, NE v PATH, který si skript
# nastavuje. Absolutní cesta /usr/sbin/lsof, jinak lsof není nalezen.

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
LSOF="/usr/sbin/lsof"

PLIST="$HOME/Library/LaunchAgents/ai.sovereign-dashboard.plist"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$DIR/server.pid"

# ---- 1) Nejprv zastavit launchd service (aby restart nedal wrapper vzkřísit) ----
if launchctl list 2>/dev/null | grep -q "ai.sovereign-dashboard"; then
  launchctl bootout "gui/$(id -u)/ai.sovereign-dashboard" 2>/dev/null \
    || launchctl unload "$PLIST" 2>/dev/null
  echo "launchd service odpojena"
else
  echo "launchd service nebyla aktivní"
fi

# ---- 2. Zabít wrapper (start.sh) + backend node ----
WRAPPER_PIDS="$(pgrep -f "scripts/start.sh" 2>/dev/null || true)"
if [[ -n "$WRAPPER_PIDS" ]]; then
  echo "    ukončuji wrapper: $WRAPPER_PIDS"
  kill $WRAPPER_PIDS 2>/dev/null || true
  sleep 1
fi

NODE_PIDS="$(pgrep -f "server/index.cjs" 2>/dev/null || true)"
if [[ -n "$NODE_PIDS" ]]; then
  echo "    ukončuji backend: $NODE_PIDS"
  kill $NODE_PIDS 2>/dev/null || true
  sleep 1
  # pokud node odmítá zemřít, donuť
  NODE_PIDS="$(pgrep -f "server/index.cjs" 2>/dev/null || true)"
  if [[ -n "$NODE_PIDS" ]]; then
    echo "    backend ignoruje SIGTERM, posílám SIGKILL: $NODE_PIDS"
    kill -9 $NODE_PIDS 2>/dev/null || true
    sleep 1
  fi
fi

# ---- 3. Kill vite frontend (port 3205) — orphaned proces, co starý stop.sh nezachytil ----
# Detekce podle cesty k projektu, ne podle "vite" (aby nezabil cizí vite)
VITE_PIDS="$(pgrep -f "sovereign-dashboard/node_modules/.bin/vite" 2>/dev/null || true)"
VITE_PARENT="$(pgrep -f "npm exec vite --port 3205" 2>/dev/null || true)"
FRONT_PIDS="$VITE_PIDS $VITE_PARENT"
FRONT_PIDS="$(echo "$FRONT_PIDS" | xargs)"
if [[ -n "$FRONT_PIDS" ]]; then
  echo "    ukončuji frontend Vite (port 3205): $FRONT_PIDS"
  kill $FRONT_PIDS 2>/dev/null || true
  sleep 2
  # force pokud nezemřely
  STILL=""
  for p in $FRONT_PIDS; do
    if kill -0 "$p" 2>/dev/null; then STILL="$STILL $p"; fi
  done
  if [[ -n "$STILL" ]]; then
    echo "    frontend ignoruje SIGTERM, posílám SIGKILL: $STILL"
    kill -9 $STILL 2>/dev/null || true
    sleep 1
  fi
fi

# ---- 4. Ukliď PID soubory ----
rm -f "$PID_FILE" "$DIR/.backend.pid" "$DIR/.frontend.pid"

# ---- 5. Verifikace ----
FAIL=""
pgrep -f "server/index.cjs" >/dev/null 2>&1 && FAIL="$FAIL backend"
pgrep -f "scripts/start.sh" >/dev/null 2>&1 && FAIL="$FAIL wrapper"
pgrep -f "sovereign-dashboard/node_modules/.bin/vite" >/dev/null 2>&1 && FAIL="$FAIL frontend"

if [[ -n "$FAIL" ]]; then
  echo "❌ CHYBA: Sovereign stále běží:$FAIL"
  pgrep -af "server/index.cjs|scripts/start.sh|sovereign-dashboard/node_modules/.bin/vite" || true
  exit 1
else
  echo "✅ Sovereign dashboard zastaven (porty 8891 + 3205 uvolněny)"
fi
