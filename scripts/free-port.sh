#!/usr/bin/env bash
# Kill whatever holds a TCP port, so a server can bind it.
# Usage: scripts/free-port.sh [PORT]   (default 8000). A free port is a no-op.
#
# Matches any state, not just LISTEN: a uvicorn --reload whose app failed to
# start leaves the socket CLOSED but still bound, which blocks the next run
# just the same. Only sockets whose *local* address is the port count, so a
# browser connected to it is left alone.
set -euo pipefail

port="${1:-8000}"
pids=$(lsof -nP -iTCP:"$port" -Fpn 2>/dev/null | awk -v pat=":$port\$" '
  /^p/ { pid = substr($0, 2) }
  /^n/ { split(substr($0, 2), local, "->"); if (local[1] ~ pat) print pid }
' | sort -u)

if [ -z "$pids" ]; then
  echo "port ${port}: free"
  exit 0
fi

echo "port ${port}: killing $(echo "$pids" | tr '\n' ' ')"
kill -9 $pids
