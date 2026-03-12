#!/usr/bin/env bash
# fix-prod.sh — apply production config fixes for moph-meet.moph.go.th
# Run on the production server:  bash fix-prod.sh
set -euo pipefail

REPO="$(cd "$(dirname "$0")" && pwd)"
USER_ENV="$REPO/user-app-lite/.env"
CORE_ENV="$REPO/core-lite/.env"

echo "=== [1/3] Patch user-app-lite/.env ==="
# PORT must be 3000 (firewall allows 3000, not 3001)
# CORE_BASE must point directly to core-lite on localhost:3500 to avoid
# routing the OAuth code exchange through the internet (tokenExpired fix)
# API_BASE stays as the public URL for all non-auth calls
cat > "$USER_ENV" <<'EOF'
PORT=3000
API_BASE=https://moph-meet.moph.go.th
# Direct internal URL to core-lite — bypasses nginx/internet for time-sensitive OAuth code exchange
CORE_BASE=http://localhost:3500
MEETING_URL=https://moph-meetingroom.moph.go.th
MEETING_DOMAIN=moph-meetingroom.moph.go.th
SESSION_SECRET=change_me_in_production
PROVIDER_ID_CLIENT_ID=01953bd5-fc1e-73d4-9142-7598d70c34dc
PROVIDER_ID_REDIRECT_URI=https://moph-meet.moph.go.th/auth/providerid/callback
EOF
echo "    PORT=3000, CORE_BASE=http://localhost:3500 — done"

echo ""
echo "=== [2/3] Verify core-lite/.env port ==="
# core-lite must stay on 3500
CURRENT_PORT=$(grep -E '^APP_PORT=' "$CORE_ENV" | cut -d= -f2)
if [ "$CURRENT_PORT" = "3500" ]; then
  echo "    APP_PORT=3500 — already correct"
else
  echo "    WARNING: APP_PORT=$CURRENT_PORT — fixing to 3500"
  sed -i "s/^APP_PORT=.*/APP_PORT=3500/" "$CORE_ENV"
fi

echo ""
echo "=== [3/3] Restart services with PM2 (or plain node fallback) ==="

if command -v pm2 &>/dev/null; then
  # PM2 path: reload in-place so env is re-read
  if pm2 list | grep -q "core-lite"; then
    pm2 reload core-lite --update-env && echo "    core-lite reloaded via PM2"
  else
    pm2 start "$REPO/core-lite/src/index.js" --name core-lite --cwd "$REPO/core-lite" && echo "    core-lite started via PM2"
  fi

  if pm2 list | grep -q "user-app-lite"; then
    pm2 reload user-app-lite --update-env && echo "    user-app-lite reloaded via PM2"
  else
    pm2 start "$REPO/user-app-lite/server.js" --name user-app-lite --cwd "$REPO/user-app-lite" && echo "    user-app-lite started via PM2"
  fi

  pm2 save
  echo ""
  pm2 list
else
  echo "    PM2 not found — killing old node processes and restarting"

  # Kill old instances
  pkill -f "core-lite/src/index.js"    2>/dev/null || true
  pkill -f "user-app-lite/server.js"   2>/dev/null || true
  sleep 1

  # Start core-lite
  cd "$REPO/core-lite"
  nohup node src/index.js >> /tmp/core-lite.log 2>&1 &
  CORE_PID=$!
  echo "    core-lite started (PID $CORE_PID) → log: /tmp/core-lite.log"

  # Start user-app-lite
  cd "$REPO/user-app-lite"
  nohup node server.js >> /tmp/user-app-lite.log 2>&1 &
  APP_PID=$!
  echo "    user-app-lite started (PID $APP_PID) → log: /tmp/user-app-lite.log"

  echo ""
  echo "Tail logs:  tail -f /tmp/core-lite.log /tmp/user-app-lite.log"
fi

echo ""
echo "=== Done ==="
echo "  user-app-lite : http://localhost:3000"
echo "  core-lite     : http://localhost:3500"
echo ""
echo "Quick smoke test:"
echo "  curl -s http://localhost:3500/api/health"
echo "  curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/"
