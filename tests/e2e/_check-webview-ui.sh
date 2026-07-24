#!/usr/bin/env bash
set -euo pipefail
cd /home/fr4iser/Documents/Git/LOGA3-Automation-Mobile
export ANDROID_SERIAL=ZY22J3RHFC
export NIXPKGS_ALLOW_UNFREE=1
mkdir -p /tmp/loga3-shots

nix-shell --run '
set -e
export ANDROID_SERIAL=ZY22J3RHFC
adb reverse tcp:8091 tcp:8091
curl -sf --max-time 2 http://127.0.0.1:8091/status
adb shell am force-stop com.fr4iser.loga3mobile
adb shell run-as com.fr4iser.loga3mobile sh -c "rm -rf cache code_cache" 2>/dev/null || true
sleep 1
ENC=$(python3 -c "import urllib.parse; print(urllib.parse.quote(\"http://127.0.0.1:8091\", safe=\"\"))")
adb shell am start -a android.intent.action.VIEW -d "loga3mobile://expo-development-client/?url=${ENC}" com.fr4iser.loga3mobile
sleep 28
adb exec-out screencap -p > /tmp/loga3-shots/now.png
adb shell uiautomator dump /sdcard/ui.xml >/dev/null
adb pull /sdcard/ui.xml /tmp/loga3-shots/ui.xml >/dev/null
python3 -c "
from pathlib import Path
import re
t=Path(\"/tmp/loga3-shots/ui.xml\").read_text(errors=\"replace\")
texts=re.findall(r\"text=\\\"([^\\\"]*)\\\"\", t)
for x in texts:
  if x and any(k.lower() in x.lower() for k in (\"LOGA3\",\"WebView\",\"Erweitert\",\"Schichten\",\"Holen\")):
    print(\"UI:\", x)
"
'
