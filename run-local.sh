#!/usr/bin/env bash
# ============================================================================
# Omnix-AI — one-command local run. Zero cloud dependency.
#
# What it does, in order:
#   1. Brings up local MongoDB + Redis with `docker compose`
#      (the same setup the README documents). Waits until both are healthy.
#   2. Preflight-checks that both ports are reachable from the host.
#   3. Starts all five backend services with hot reload, colour-coded logs,
#      exactly like `npm run dev:all` in backend/.
#   4. Starts the Vite frontend on http://localhost:5173.
#
# Stop everything with Ctrl-C — it kills the services and the frontend,
# and leaves Mongo/Redis running so your local data survives.
#
# To also remove the databases:  ./run-local.sh down
# ============================================================================
set -uo pipefail
cd "$(dirname "$0")"

MODE="${1:-up}"

if [[ "$MODE" == "down" ]]; then
  echo "Stopping local Mongo + Redis (data is kept in docker volumes)..."
  (cd backend && docker compose down)
  echo "Done. Re-run ./run-local.sh to start again."
  exit 0
fi

command -v docker >/dev/null 2>&1 || { echo "Docker is required (Mongo + Redis run in it). Install Docker Desktop: https://docker.com/products/docker-desktop/"; exit 1; }
command -v node   >/dev/null 2>&1 || { echo "Node is required. The project is built for Node 24+ (node --watch is used for hot reload)."; exit 1; }

if [[ ! -d backend/node_modules || ! -d frontend/node_modules ]]; then
  echo "Dependencies missing — running npm install (this happens once)..."
  (cd backend  && npm install) || exit 1
  (cd frontend && npm install) || exit 1
fi

port_open() { # port_open <port>
  (echo > "/dev/tcp/127.0.0.1/$1") 2>/dev/null
}

fix_hints="Fixes to try:
  1. Is Docker Desktop running? (menu bar → Docker)
  2. cd backend && docker compose down && docker compose up -d --wait
  3. A stale container from an older project may own the name/port:
       docker ps -a | grep -E 'omnix-(mongo|redis)'
       docker rm -f omnix-mongo omnix-redis   # if listed and not from this compose file
     then re-run this script
  4. Some OTHER process may hold the port:
       lsof -nP -iTCP:6379 -sTCP:LISTEN   (and :27017 for Mongo)
     quit/kill it, or use a different host port in backend/docker-compose.yml"

echo "==> 1/4 Starting local databases (Mongo :27017, Redis :6379)..."
(cd backend && docker compose up -d --wait) || {
  echo "Databases failed to become healthy. Check: docker compose ps (run from backend/)"
  echo "$fix_hints"
  exit 1
}

echo "==> 2/4 Preflight: are the database ports actually reachable?"
if ! port_open 27017; then
  echo "Mongo port 27017 is NOT reachable from the host."
  echo "$fix_hints"
  exit 1
fi
if ! port_open 6379; then
  echo "Redis port 6379 is NOT reachable from the host (this is the one that causes 'Redis error' floods in the services)."
  echo "$fix_hints"
  exit 1
fi
echo "    both ports open"

BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
  echo
  echo "Stopping services... (local databases keep running)"
  [[ -n "$BACKEND_PID"  ]] && kill -TERM "$BACKEND_PID"  2>/dev/null || true
  [[ -n "$FRONTEND_PID" ]] && kill -TERM "$FRONTEND_PID" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup INT TERM

echo "==> 3/4 Starting backend services (gateway :8000, auth :8001, chat :8002, agent :8003, billing :8004)..."
(cd backend && node scripts/dev.js) &
BACKEND_PID=$!

# Let the services boot (and fail fast if their env is broken) before starting
# the frontend, so backend errors are not buried under Vite log noise.
sleep 5

echo "==> 4/4 Starting frontend on http://localhost:5173 ..."
(cd frontend && npm run dev) &
FRONTEND_PID=$!

echo
echo "Everything is up. Ctrl-C stops the services, not the databases."
echo "  Frontend   http://localhost:5173"
echo "  Gateway    http://localhost:8000  (API entry point)"
echo "  Databases  docker compose ps  (from backend/)"
echo
echo "Watch the logs: if a service prints 'could not connect to mongodb',"
echo "it will restart itself (dev:all uses node --watch) and connect on retry."
echo "Sign up in the UI to create your first account; provider keys already"
echo "in backend/services/agent/.env unlock the agents that use them."

# Stay in the foreground so Ctrl-C reaches the trap, then clean up.
wait
cleanup
exit 0
