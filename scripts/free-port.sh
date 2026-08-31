#!/usr/bin/env bash
# Kill whatever is listening on a TCP port, so a server can bind it.
# Usage: scripts/free-port.sh [PORT]   (default 8000). A free port is a no-op.
set -euo pipefail

port="${1:-8000}"
pids=$(lsof -ti "tcp:${port}" -sTCP:LISTEN || true)

if [ -z "$pids" ]; then
  echo "port ${port}: free"
  exit 0
fi

echo "port ${port}: killing $(echo "$pids" | tr '\n' ' ')"
kill -9 $pids
