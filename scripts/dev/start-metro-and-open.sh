#!/usr/bin/env bash
set -euo pipefail
cd /home/fr4iser/Documents/Git/LOGA3-Automation-Mobile
export DISPLAY=:0
export WAYLAND_DISPLAY=wayland-0
export ANDROID_USER_HOME="$PWD/.android-nix"
export ANDROID_AVD_HOME="$ANDROID_USER_HOME/avd"
export ANDROID_NDK_HOME="${ANDROID_NDK_ROOT:-}"
unset CI || true
printf '%s\n' "sdk.dir=$ANDROID_SDK_ROOT" > android/local.properties

adb devices -l
adb shell am force-stop com.fr4iser.loga3mobile || true

# adb reverse; 10.0.2.2 is ENETUNREACH on this AVD
HOST_URL="http://127.0.0.1:8091"

npx expo start --dev-client --port 8091 --clear > /tmp/loga3-metro.log 2>&1 &
METRO_PID=$!
echo "METRO_PID=$METRO_PID"

for i in $(seq 1 90); do
  if curl -sf http://127.0.0.1:8091/status >/dev/null 2>&1; then
    echo METRO_READY
    break
  fi
  sleep 2
done

ENCODED=$(python3 -c "import urllib.parse; print(urllib.parse.quote('${HOST_URL}', safe=''))")
adb shell am start -a android.intent.action.VIEW \
  -d "loga3mobile://expo-development-client/?url=${ENCODED}" \
  com.fr4iser.loga3mobile

sleep 35
adb shell dumpsys window | grep mCurrentFocus || true
adb exec-out screencap -p > /tmp/loga3-shots/emulator5.png
file /tmp/loga3-shots/emulator5.png
tail -40 /tmp/loga3-metro.log || true
wait "$METRO_PID"
