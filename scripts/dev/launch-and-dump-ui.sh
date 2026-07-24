#!/usr/bin/env bash
set -euo pipefail
cd /home/fr4iser/Documents/Git/LOGA3-Automation-Mobile
adb reverse tcp:8091 tcp:8091 || true
adb shell am force-stop com.fr4iser.loga3mobile
sleep 1
ENCODED=$(python3 -c "import urllib.parse; print(urllib.parse.quote('http://10.0.2.2:8091', safe=''))")
adb shell am start -a android.intent.action.VIEW \
  -d "loga3mobile://expo-development-client/?url=${ENCODED}" \
  com.fr4iser.loga3mobile
echo STARTED

UI_READY=0
for i in $(seq 1 50); do
  sleep 2
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 || true
  adb pull /sdcard/ui.xml /tmp/loga3-ui.xml >/dev/null 2>&1 || true
  if grep -Eq 'Ausgewählte laden|LOGA3 Login|Offline-Fixture|Benutzername|Fetch selected' /tmp/loga3-ui.xml 2>/dev/null; then
    echo "UI_READY t=$i"
    UI_READY=1
    break
  fi
  FOCUS=$(adb shell dumpsys window 2>/dev/null | grep mCurrentFocus || true)
  echo "wait t=$i $FOCUS"
done

adb exec-out screencap -p > /tmp/loga3-shots/fetch-before.png
file /tmp/loga3-shots/fetch-before.png
python3 - <<'PY'
import re, pathlib
p = pathlib.Path("/tmp/loga3-ui.xml")
if not p.exists():
    print("no ui dump")
else:
    texts = re.findall(r'text="([^"]+)"', p.read_text())
    for t in texts:
        if t.strip():
            print("TEXT:", t[:140])
PY
exit $((1 - UI_READY))
