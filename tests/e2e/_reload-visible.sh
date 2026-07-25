#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
export ANDROID_SERIAL=ZY22J3RHFC
export NIXPKGS_ALLOW_UNFREE=1
nix-shell --run '
set -e
export ANDROID_SERIAL=ZY22J3RHFC
adb reverse tcp:8091 tcp:8091
adb shell am force-stop com.fr4iser.shiftplan
sleep 2
ENC=$(python3 -c "import urllib.parse; print(urllib.parse.quote(\"http://127.0.0.1:8091\", safe=\"\"))")
adb shell am start -a android.intent.action.VIEW -d "shiftplan://expo-development-client/?url=${ENC}" com.fr4iser.shiftplan
sleep 24
node tests/e2e/_seed-only.js
sleep 10
mkdir -p /tmp/loga3-shots
adb exec-out screencap -p > /tmp/loga3-shots/webview-must-see.png
PID=$(adb shell pidof -s com.fr4iser.shiftplan | tr -d "\r")
echo PID=$PID
adb forward --remove tcp:9335 >/dev/null 2>&1 || true
adb forward tcp:9335 localabstract:webview_devtools_remote_$PID
curl -sf http://127.0.0.1:9335/json/list | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0].get(\"description\",\"\") if d else \"none\")"
echo DONE
'
