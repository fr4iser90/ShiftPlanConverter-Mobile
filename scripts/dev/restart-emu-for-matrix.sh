#!/usr/bin/env bash
# Hard-restart emulator onto the stable 1080×2400 AVD (pixel_6_phone).
set -euo pipefail
cd /home/fr4iser/Documents/Git/LOGA3-Automation-Mobile
export NIXPKGS_ALLOW_UNFREE=1
export ANDROID_USER_HOME="${ANDROID_USER_HOME:-$HOME/.loga3-android/project-android-nix}"
export ANDROID_AVD_HOME="${ANDROID_AVD_HOME:-$ANDROID_USER_HOME/avd}"
exec > >(tee /tmp/loga3-hard-restart.log) 2>&1

echo "=== kill old emu (incl. broken temp AVDs) ==="
pkill -9 -f "qemu-system-x86_64" 2>/dev/null || true
pkill -9 -f "emulator.*-avd" 2>/dev/null || true
sleep 2

echo "=== start stable AVD ==="
bash scripts/dev/loga3-emu-stable.sh

echo "=== verify size + apk ==="
nix-shell --run '
set -e
adb wait-for-device
for i in $(seq 1 60); do
  boot=$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d "\r" || true)
  sz=$(adb shell wm size 2>&1 | tr -d "\r" || true)
  echo "i=$i boot=$boot sz=$sz"
  if [ "$boot" = "1" ] && echo "$sz" | grep -q "1080x2400"; then
    adb shell wm size reset >/dev/null 2>&1 || true
    adb shell wm density reset >/dev/null 2>&1 || true
    sleep 1
    sz=$(adb shell wm size 2>&1 | tr -d "\r" || true)
    echo "READY $sz"
    break
  fi
  if [ "$boot" = "1" ] && echo "$sz" | grep -q "Physical size: 320x640"; then
    echo "FAIL still broken 320x640 AVD" >&2
    exit 2
  fi
  sleep 3
done
adb shell wm size
adb shell wm density
if ! adb shell pm path com.fr4iser.loga3mobile >/dev/null 2>&1; then
  echo "→ install apk"
  APK=android/app/build/outputs/apk/debug/app-debug.apk
  if [ ! -f "$APK" ]; then
    echo "missing $APK — build with: nix-shell --run \"npx expo run:android\"" >&2
    exit 1
  fi
  adb push "$APK" /data/local/tmp/loga3.apk
  adb shell pm install -r -t /data/local/tmp/loga3.apk
fi
adb shell pm path com.fr4iser.loga3mobile
echo DONE
'
