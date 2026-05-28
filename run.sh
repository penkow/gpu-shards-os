#!/usr/bin/env bash
# Launch backend + Next.js frontend together. Ctrl-C tears both down.
set -euo pipefail
# Job control: each `&` job gets its own process group, so `kill -- -PID`
# below tears down the whole npm -> node -> next-server tree.
set -m

cd "$(dirname "$0")"

# Bind to 0.0.0.0 so the panel + API are reachable from the whole internal
# network, not just localhost. NOTE: the backend can deploy/stop containers on
# the Docker daemon and ships with no API key by default — set HAMI_API_KEY (and
# narrow HAMI_ALLOWED_ORIGINS) before exposing this beyond a trusted network.
export HAMI_BACKEND_HOST="${HAMI_BACKEND_HOST:-0.0.0.0}"
export HAMI_BACKEND_PORT="${HAMI_BACKEND_PORT:-8000}"
export HAMI_BACKEND_URL="${HAMI_BACKEND_URL:-http://127.0.0.1:${HAMI_BACKEND_PORT}}"
# "*" lets any LAN origin (http://<host-ip>:3000) reach the API. Safe here
# because CORS runs with allow_credentials=False and auth is header/token-based.
export HAMI_ALLOWED_ORIGINS="${HAMI_ALLOWED_ORIGINS:-*}"

PY="${PY:-python}"

"$PY" -m backend &
BACKEND_PID=$!

# Give the backend a moment to bind its port before the frontend starts.
sleep 1

(cd frontend && npm run dev -- -H 0.0.0.0) &
FRONTEND_PID=$!

LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo "  frontend : http://${LAN_IP:-<host-ip>}:3000  (local: http://localhost:3000)"
echo "  backend  : http://${LAN_IP:-<host-ip>}:${HAMI_BACKEND_PORT}"

cleanup() {
    kill -- -"$BACKEND_PID" 2>/dev/null || kill "$BACKEND_PID" 2>/dev/null || true
    kill -- -"$FRONTEND_PID" 2>/dev/null || kill "$FRONTEND_PID" 2>/dev/null || true
    wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

wait
