#!/usr/bin/env bash
# Sequential resolution matrix — one profile after another.
# Screenshots ONLY under: /tmp/loga3-shots/matrix/<profile>/
# Months: auto = current + 2 random (override LOGA3_MATRIX_MONTHS=07,03,11)
# First profile only: LOGA3_MATRIX_PROFILES=moto_g73
set -euo pipefail
cd /home/fr4iser/Documents/Git/LOGA3-Automation-Mobile
export NIXPKGS_ALLOW_UNFREE=1
export ANDROID_USER_HOME="${ANDROID_USER_HOME:-$HOME/.loga3-android/project-android-nix}"
export ANDROID_AVD_HOME="${ANDROID_AVD_HOME:-$ANDROID_USER_HOME/avd}"
exec > >(tee /tmp/loga3-matrix-run.log) 2>&1

echo "=== ensure metro ==="
if ! curl -sf --max-time 2 http://127.0.0.1:8091/status >/dev/null; then
  mkdir -p tmp/metro-tmp
  TMPDIR="$PWD/tmp/metro-tmp" nohup nix-shell --run 'npx expo start --dev-client --port 8091' >/tmp/loga3-metro.log 2>&1 &
  for i in $(seq 1 45); do
    curl -sf --max-time 1 http://127.0.0.1:8091/status >/dev/null && break
    sleep 2
  done
fi
curl -sf --max-time 2 http://127.0.0.1:8091/status
echo

echo "=== ensure emulator (stable AVD) ==="
if ! nix-shell --run 'adb devices' 2>/dev/null | grep -qE 'emulator-[0-9]+[[:space:]]+device'; then
  bash scripts/dev/loga3-emu-stable.sh
fi

PROFILES="${LOGA3_MATRIX_PROFILES:-}"
MONTHS_ARG="${LOGA3_MATRIX_MONTHS:-auto}"

echo "=== wait window + matrix ==="
nix-shell --run "
set -e
adb kill-server >/dev/null 2>&1 || true
adb start-server >/dev/null
adb wait-for-device
adb reverse tcp:8091 tcp:8091
for i in \$(seq 1 40); do
  sz=\$(adb shell wm size 2>&1 | tr -d '\r')
  echo \"wm: \$sz\"
  if echo \"\$sz\" | grep -q 'Physical size: 320x640' && ! echo \"\$sz\" | grep -q 'Override size:'; then
    echo BROKEN_AVD >&2; exit 2
  fi
  if echo \"\$sz\" | grep -qE '[0-9]+x[0-9]+' && ! echo \"\$sz\" | grep -qi 'Can.t find'; then
    echo WINDOW_OK
    break
  fi
  sleep 2
done
adb shell pm path com.fr4iser.loga3mobile
echo '=== matrix sequential ==='
if [ -n \"$PROFILES\" ]; then
  python3 -u tests/e2e/live-smoke-matrix.py --months '$MONTHS_ARG' --profiles '$PROFILES'
else
  python3 -u tests/e2e/live-smoke-matrix.py --months '$MONTHS_ARG'
fi
"
