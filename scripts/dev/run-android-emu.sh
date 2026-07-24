#!/usr/bin/env bash
set -euo pipefail
cd /home/fr4iser/Documents/Git/LOGA3-Automation-Mobile
export DISPLAY=:0
export WAYLAND_DISPLAY=wayland-0
export CI=1
export NIXPKGS_ALLOW_UNFREE=1
export ANDROID_USER_HOME="$PWD/.android-nix"
export ANDROID_AVD_HOME="$ANDROID_USER_HOME/avd"

printf '%s\n' "sdk.dir=$ANDROID_SDK_ROOT" > local.properties
printf '%s\n' "sdk.dir=$ANDROID_SDK_ROOT" > android/local.properties
export ANDROID_NDK_HOME="$ANDROID_NDK_ROOT"

echo "=== devices ==="
adb devices -l
echo "=== cmake ==="
ls "$ANDROID_SDK_ROOT/cmake"
echo "=== building ==="
exec npx expo run:android --port 8088
