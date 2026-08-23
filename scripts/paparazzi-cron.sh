#!/bin/bash
# Paparazzi cron — pravidelně generuje Manažer Report a ukládá do historie.
# Volá backend endpoint /api/paparazzi/report (pokud běží) a ukládá report.
# Běží každých 30 minut.

REPORT_DIR="$HOME/.openclaw/workspace/sovereign-os/workspaces/paparazzi"
REPORT_FILE="$REPORT_DIR/paparazzi-report.json"
HISTORY_FILE="$REPORT_DIR/paparazzi-history.json"
LOG_FILE="$REPORT_DIR/paparazzi-cron.log"

mkdir -p "$REPORT_DIR"

# Zkontrolovat, jestli backend běží
if curl -s -m 3 "http://localhost:8891/health" > /dev/null 2>&1; then
  # Backend běží — nechat ho generovat report (setInterval to dělá sám)
  # Jen zkontrolovat, jestli report existuje a je čerstvý
  if [ -f "$REPORT_FILE" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backend běží, report existuje. OK." >> "$LOG_FILE"
  else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backend běží, ale report chybí. Volám endpoint..." >> "$LOG_FILE"
    curl -s -m 60 "http://localhost:8891/api/paparazzi/report?refresh=1" > /dev/null 2>&1
  fi
else
  # Backend neběží — report se negeneruje. Zaznamenat.
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backend neběží. Report se negeneruje." >> "$LOG_FILE"
fi
