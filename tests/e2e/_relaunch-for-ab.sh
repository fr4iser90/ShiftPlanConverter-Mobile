#!/usr/bin/env bash
set -euo pipefail
cd /home/fr4iser/Documents/Git/LOGA3-Automation-Mobile
export ANDROID_SERIAL="${ANDROID_SERIAL:-ZY22J3RHFC}"
export NIXPKGS_ALLOW_UNFREE=1

nix-shell --run '
set -e
export ANDROID_SERIAL=ZY22J3RHFC
adb reverse tcp:8091 tcp:8091
adb shell service call statusbar 2 >/dev/null 2>&1 || true
adb shell input keyevent KEYCODE_HOME || true
sleep 1
adb shell am force-stop com.fr4iser.loga3mobile
sleep 2
ENC=$(python3 -c "import urllib.parse; print(urllib.parse.quote(\"http://127.0.0.1:8091\", safe=\"\"))")
adb shell am start -a android.intent.action.VIEW -d "loga3mobile://expo-development-client/?url=${ENC}" com.fr4iser.loga3mobile
echo waiting_bundle
sleep 22
node tests/e2e/_seed-only.js
sleep 12
adb shell service call statusbar 2 >/dev/null 2>&1 || true
adb shell dumpsys window | grep mCurrentFocus | head -2
PID=$(adb shell pidof -s com.fr4iser.loga3mobile | tr -d "\r")
echo PID=$PID
adb forward --remove tcp:9333 2>/dev/null || true
adb forward tcp:9333 localabstract:webview_devtools_remote_$PID
curl -sf http://127.0.0.1:9333/json/list | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0].get(\"description\") if d else \"none\")"
'
