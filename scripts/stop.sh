#!/bin/bash
# zastaví launchd service + killne všechny node procesy sovereign-dashboard
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
launchctl unload ~/Library/LaunchAgents/ai.sovereign-dashboard.plist 2>/dev/null || true
pkill -f "server/index.cjs" 2>/dev/null || true
echo "✅ zastaveno"
