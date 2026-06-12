#!/usr/bin/env bash
# claude-presence sandbox — everything runs locally, isolated from your real
# config (identity lives in sandbox/.home, DB in a Docker volume).
#
#   bash sandbox/demo.sh          live demo: statusline re-renders every 5s
#   bash sandbox/demo.sh --once   single render (used for CI / smoke tests)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export CLAUDE_PRESENCE_HOME="$ROOT/sandbox/.home"
export LIBSQL_URL="${LIBSQL_URL:-http://127.0.0.1:8088}"
export PORT="${PORT:-8787}"
SERVER_URL="http://127.0.0.1:$PORT"

echo "▸ starting libsql (docker) ..."
docker compose up -d --wait 2>/dev/null || docker compose up -d
for _ in $(seq 1 40); do
  curl -sf "$LIBSQL_URL/health" >/dev/null 2>&1 && break
  sleep 0.5
done

echo "▸ starting presence server on :$PORT ..."
node server/index.js &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT
for _ in $(seq 1 40); do
  curl -sf "$SERVER_URL/healthz" >/dev/null 2>&1 && break
  sleep 0.3
done
curl -sf "$SERVER_URL/healthz" >/dev/null || { echo "server failed to start"; exit 1; }

if [ ! -f "$CLAUDE_PRESENCE_HOME/config.json" ]; then
  echo "▸ registering sandbox user 'simone' ..."
  node client/presence.js register simone --emoji 🧑‍💻 --server "$SERVER_URL"
fi

echo "▸ seeding fake friends ..."
node sandbox/seed.js setup

render() {
  node sandbox/seed.js tick >/dev/null
  node client/presence.js pull
  echo '{}' | node client/statusline.js
}

echo
echo "── statusline preview ──────────────────────────────────────────"
if [ "${1:-}" = "--once" ]; then
  render
  echo "────────────────────────────────────────────────────────────────"
  echo "sandbox is up. try:  CLAUDE_PRESENCE_HOME=$CLAUDE_PRESENCE_HOME node client/presence.js feed"
else
  echo "(re-rendering every 5s — Ctrl+C to stop)"
  while true; do
    render
    sleep 5
  done
fi
