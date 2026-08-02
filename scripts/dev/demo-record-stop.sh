#!/usr/bin/env bash
# Stop demo-record by PID file only. NEVER use pkill -f (kills the launcher shell).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PID_FILE="${DEMO_REC_OUT:-$ROOT/artifacts/demo-rec}/demo-record.pid"
if [[ ! -f "$PID_FILE" ]]; then
  echo "no pid file: $PID_FILE (nothing to stop)"
  exit 0
fi
pid="$(tr -d ' \n' <"$PID_FILE")"
if [[ ! "$pid" =~ ^[0-9]+$ ]]; then
  echo "FAIL: bad pid in $PID_FILE: $pid" >&2
  exit 1
fi
if ! kill -0 "$pid" 2>/dev/null; then
  echo "stale pid $pid — removing $PID_FILE"
  rm -f "$PID_FILE"
  exit 0
fi
# Only kill this PID (the python recorder), never pattern-match.
kill "$pid"
echo "sent SIGTERM to demo-record pid=$pid"
