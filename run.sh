#!/usr/bin/env bash
# Launch backend + panel together. Ctrl-C tears both down.
set -euo pipefail

cd "$(dirname "$0")"

export HAMI_BACKEND_HOST="${HAMI_BACKEND_HOST:-127.0.0.1}"
export HAMI_BACKEND_PORT="${HAMI_BACKEND_PORT:-8000}"
export HAMI_BACKEND_URL="${HAMI_BACKEND_URL:-http://127.0.0.1:${HAMI_BACKEND_PORT}}"
export HAMI_PANEL_PORT="${HAMI_PANEL_PORT:-8080}"

PY="${PY:-python}"

"$PY" -m backend &
BACKEND_PID=$!

cleanup() {
    kill "$BACKEND_PID" 2>/dev/null || true
    wait "$BACKEND_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Give the backend a moment to bind its port before the panel starts polling.
sleep 1

"$PY" panel.py
