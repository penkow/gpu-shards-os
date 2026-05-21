#!/usr/bin/env bash
# Launch backend + Next.js frontend together. Ctrl-C tears both down.
set -euo pipefail
# Job control: each `&` job gets its own process group, so `kill -- -PID`
# below tears down the whole npm -> node -> next-server tree.
set -m

cd "$(dirname "$0")"

export HAMI_BACKEND_HOST="${HAMI_BACKEND_HOST:-127.0.0.1}"
export HAMI_BACKEND_PORT="${HAMI_BACKEND_PORT:-8000}"
export HAMI_BACKEND_URL="${HAMI_BACKEND_URL:-http://127.0.0.1:${HAMI_BACKEND_PORT}}"
export HAMI_ALLOWED_ORIGINS="${HAMI_ALLOWED_ORIGINS:-http://localhost:3000,http://127.0.0.1:3000}"

PY="${PY:-python}"

"$PY" -m backend &
BACKEND_PID=$!

# Give the backend a moment to bind its port before the frontend starts.
sleep 1

(cd frontend && npm run dev) &
FRONTEND_PID=$!

cleanup() {
    kill -- -"$BACKEND_PID" 2>/dev/null || kill "$BACKEND_PID" 2>/dev/null || true
    kill -- -"$FRONTEND_PID" 2>/dev/null || kill "$FRONTEND_PID" 2>/dev/null || true
    wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

wait
