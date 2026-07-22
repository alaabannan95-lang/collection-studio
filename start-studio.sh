#!/usr/bin/env bash
#
# Start the Collection Studio locally: the render backend and the app itself.
#
# Both are needed. Opening index.html straight from Finder looks like it works
# but silently talks to the deployed backend, which has no mockup support, so
# "Generate Mockup" fails with a network error.
#
#   ./start-studio.sh
#
# Ctrl+C stops both.

set -euo pipefail
cd "$(dirname "$0")"

for port in 5001 3901; do
  if lsof -ti:"$port" >/dev/null 2>&1; then
    echo "  port $port is already in use, freeing it"
    kill "$(lsof -ti:"$port")" 2>/dev/null || true
    sleep 1
  fi
done

echo "  starting render backend on :5001"
(cd backend && python3 app.py > /tmp/soap-studio-backend.log 2>&1) &
BACKEND=$!

echo "  starting app on :3901"
python3 -m http.server 3901 > /tmp/soap-studio-app.log 2>&1 &
APP=$!

# Stop both together, however this script exits.
trap 'kill $BACKEND $APP 2>/dev/null || true' EXIT INT TERM

# Wait for the backend rather than guessing at a sleep: a cold start is slower
# on some machines, and opening the app early makes the first mockup fail.
for _ in $(seq 1 30); do
  if curl -sf -m 1 http://localhost:5001/health >/dev/null 2>&1; then break; fi
  sleep 0.5
done

if ! curl -sf -m 2 http://localhost:5001/health >/dev/null 2>&1; then
  echo
  echo "  backend did not come up. Its log:"
  tail -20 /tmp/soap-studio-backend.log
  exit 1
fi

echo
echo "  Ready:  http://localhost:3901"
echo "  Backend logs: /tmp/soap-studio-backend.log"
echo "  Ctrl+C to stop both."
echo

open http://localhost:3901 2>/dev/null || true
wait
