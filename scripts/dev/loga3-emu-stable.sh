#!/usr/bin/env bash
# Start Pixel-6-class emulator from the STABLE AVD (1080×2400).
# Never use nixpkgs run-test-emulator — it mktemps ANDROID_USER_HOME and
# leaves Physical size stuck at 320×640 (broken matrix).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

export NIXPKGS_ALLOW_UNFREE=1
export ANDROID_USER_HOME="${ANDROID_USER_HOME:-$HOME/.loga3-android/project-android-nix}"
export ANDROID_AVD_HOME="${ANDROID_AVD_HOME:-$ANDROID_USER_HOME/avd}"
AVD_NAME="${LOGA3_AVD_NAME:-pixel_6_phone}"

if pgrep -f 'qemu-system-x86_64.*-avd' >/dev/null 2>&1; then
  echo "→ Emulator läuft schon"
  exit 0
fi

if [ ! -d "$ANDROID_AVD_HOME/${AVD_NAME}.avd" ]; then
  echo "AVD fehlt: $ANDROID_AVD_HOME/${AVD_NAME}.avd" >&2
  echo "Erwartet 1080×2400 Pixel-6-Phone unter ANDROID_USER_HOME=$ANDROID_USER_HOME" >&2
  exit 1
fi

# Keep ini path in sync with real AVD dir (stale path → silent fallback size)
INI="$ANDROID_AVD_HOME/${AVD_NAME}.ini"
if [ -f "$INI" ]; then
  printf '%s\n' \
    "avd.ini.encoding=UTF-8" \
    "path=$ANDROID_AVD_HOME/${AVD_NAME}.avd" \
    "path.rel=avd/${AVD_NAME}.avd" \
    "target=android-34" >"$INI"
fi

echo "→ Emulator @${AVD_NAME} (ANDROID_USER_HOME=$ANDROID_USER_HOME)"
exec nix-shell --run "
set -e
adb start-server >/dev/null
SDK=\"\${ANDROID_SDK_ROOT}/emulator/emulator\"
# -memory 4096 (suffix M in config.ini was ignored; guest stayed at 2048)
# -gpu host (swiftshader CPU-starves system_server)
nohup \"\$SDK\" -avd '${AVD_NAME}' -memory 4096 -no-snapshot-load -no-boot-anim -gpu host -port 5554 >/tmp/loga3-emulator.log 2>&1 &
echo \"PID \$!  log=/tmp/loga3-emulator.log\"
adb wait-for-device
for i in \$(seq 1 120); do
  boot=\$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)
  sz=\$(adb shell wm size 2>&1 | tr -d '\r' || true)
  echo \"boot=\$boot sz=\$sz\"
  if [ \"\$boot\" = 1 ] && echo \"\$sz\" | grep -qE '[0-9]+x[0-9]+'; then
    if echo \"\$sz\" | grep -q 'Physical size: 320x640' && ! echo \"\$sz\" | grep -q 'Override'; then
      echo 'WARN still 320x640 — wrong AVD?' >&2
    fi
    echo READY
    adb shell wm size
    adb shell wm density
    exit 0
  fi
  sleep 2
done
echo 'boot timeout' >&2
exit 1
"
