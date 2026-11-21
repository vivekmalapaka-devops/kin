#!/bin/sh
set -eu
python3 backend/server.py &
backend_pid=$!
cleanup() { kill "$backend_pid" 2>/dev/null || true; wait "$backend_pid" 2>/dev/null || true; }
trap cleanup EXIT INT TERM
sleep 1
if ! kill -0 "$backend_pid" 2>/dev/null; then
  echo 'The extraction backend could not start. Check port 8787 and the .env configuration.' >&2
  exit 1
fi
npm run web:dev
