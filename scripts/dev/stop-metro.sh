#!/usr/bin/env bash
# Stop Metro / Expo for this project (ports 8081, 8082, 8091).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

killed=0

kill_pids() {
  local pids="$1"
  if [ -n "${pids:-}" ]; then
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
    sleep 0.4
    # shellcheck disable=SC2086
    kill -9 $pids 2>/dev/null || true
    killed=1
  fi
}

# Expo / Metro by command line
if pgrep -f "expo start" >/dev/null 2>&1; then
  pkill -f "expo start" 2>/dev/null || true
  killed=1
fi
if pgrep -f "node_modules/.bin/expo" >/dev/null 2>&1; then
  pkill -f "node_modules/.bin/expo" 2>/dev/null || true
  killed=1
fi

# Listeners on common Metro ports
if command -v lsof >/dev/null 2>&1; then
  for port in 8081 8082 8091; do
    pids="$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)"
    if [ -n "${pids:-}" ]; then
      echo "Stopping listeners on :$port ($pids)"
      kill_pids "$pids"
    fi
  done
fi

sleep 0.3
if pgrep -f "expo start" >/dev/null 2>&1; then
  echo "warn: expo start still running — try: pkill -9 -f 'expo start'" >&2
  exit 1
fi

# Hint if 8081 is Docker (not Metro) — common on this machine
if command -v ss >/dev/null 2>&1; then
  if ss -ltnpe sport = :8081 2>/dev/null | grep -q docker; then
    echo "Hinweis: :8081 ist ein Docker-Port-Mapping (nicht Metro)."
    echo "  → npm start nutzt Port 8091; Docker lassen oder: docker ps --filter publish=8081"
  fi
fi

if [ "$killed" -eq 1 ]; then
  echo "Metro/Expo gestoppt."
else
  echo "Nichts zu stoppen (kein Expo/Metro auf 8081/8082/8091)."
fi
