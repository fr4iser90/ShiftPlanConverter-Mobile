#!/usr/bin/env bash
set -euo pipefail
cd /home/fr4iser/Documents/Git/LOGA3-Automation-Mobile
mkdir -p /tmp/loga3-shots

adb reverse tcp:8091 tcp:8091 || true
adb shell am force-stop com.fr4iser.loga3mobile || true
sleep 1

# Clear any stale packager preference pointing at old host:8088
adb shell pm clear com.fr4iser.loga3mobile >/dev/null 2>&1 || true
sleep 1

ENCODED=$(python3 -c "import urllib.parse; print(urllib.parse.quote('http://10.0.2.2:8091', safe=''))")
adb shell am start -a android.intent.action.VIEW \
  -d "loga3mobile://expo-development-client/?url=${ENCODED}" \
  com.fr4iser.loga3mobile
echo STARTED

UI_READY=0
for i in $(seq 1 60); do
  sleep 2
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 || true
  adb pull /sdcard/ui.xml /tmp/loga3-ui.xml >/dev/null 2>&1 || true
  if grep -Eq 'Ausgewählte laden|LOGA3 Login|Offline-Fixture|Benutzername|Fetch selected' /tmp/loga3-ui.xml 2>/dev/null; then
    echo "UI_READY t=$i"
    UI_READY=1
    break
  fi
  if grep -Eq 'Render Error|Unable to resolve|Bundling failed' /tmp/loga3-ui.xml 2>/dev/null; then
    echo "RENDER_ERROR t=$i"
    python3 - <<'PY'
import re, pathlib
p = pathlib.Path("/tmp/loga3-ui.xml")
texts = re.findall(r'text="([^"]+)"', p.read_text())
for t in texts:
    if t.strip():
        print("TEXT:", t[:200].replace("&#10;", " | "))
PY
    break
  fi
  FOCUS=$(adb shell dumpsys window 2>/dev/null | grep mCurrentFocus || true)
  echo "wait t=$i $FOCUS"
done

mkdir -p /tmp/loga3-shots/fetch-ui
adb exec-out screencap -p > /tmp/loga3-shots/fetch-ui/fetch-ui.png

if [[ "$UI_READY" != "1" ]]; then
  echo FAIL_NO_UI
  exit 1
fi

python3 - <<'PY'
import re, pathlib, xml.etree.ElementTree as ET
xml = pathlib.Path("/tmp/loga3-ui.xml").read_text()
# Prefer clicking "Ausgewählte laden"
target = None
for m in re.finditer(r'text="([^"]+)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', xml):
    text, x1, y1, x2, y2 = m.group(1), *map(int, m.groups()[1:])
    if "Ausgewählte laden" in text or text == "Fetch selected":
        target = ((x1+x2)//2, (y1+y2)//2, text)
        break
if not target:
    # RN Button often puts text on a child; find clickable ancestors near text
    root = ET.fromstring(xml)
    for node in root.iter("node"):
        if (node.attrib.get("text") or "") in ("Ausgewählte laden", "Fetch selected"):
            b = node.attrib.get("bounds")
            if b:
                nums = list(map(int, re.findall(r"\d+", b)))
                target = ((nums[0]+nums[2])//2, (nums[1]+nums[3])//2, node.attrib.get("text"))
                break
            # climb for bounds
            p = None
print("CLICK_TARGET", target)
if target:
    pathlib.Path("/tmp/loga3-click.txt").write_text(f"{target[0]} {target[1]}")
else:
    texts = re.findall(r'text="([^"]+)"', xml)
    for t in texts:
        if t.strip():
            print("TEXT:", t[:140])
    raise SystemExit(2)
PY

read -r CX CY < /tmp/loga3-click.txt
echo "Tapping $CX $CY"
adb shell input tap "$CX" "$CY"

# Wait for fetch progress / result
for i in $(seq 1 90); do
  sleep 3
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 || true
  adb pull /sdcard/ui.xml /tmp/loga3-ui-fetch.xml >/dev/null 2>&1 || true
  adb exec-out screencap -p > /tmp/loga3-shots/fetch-ui/fetch-progress.png
  python3 - <<'PY'
import re, pathlib, sys
xml = pathlib.Path("/tmp/loga3-ui-fetch.xml").read_text(errors="ignore")
texts = [t for t in re.findall(r'text="([^"]+)"', xml) if t.strip()]
interesting = [t for t in texts if re.search(r'Status|Schichten|Fehler|Login|NO_PLAN|Fertig|PDF|Fetch|laden|Timeout|Monat|Cred', t, re.I)]
print("tick texts:", " || ".join(interesting[:12])[:400])
blob = " ".join(texts)
if re.search(r'Fertig|Schichten \(\d|Einträge im Store: [1-9]', blob):
    print("FETCH_OK_HINT")
    sys.exit(10)
if re.search(r'Fetch fehlgeschlagen|Abbruch: keine Zugangsdaten|Fehler:', blob):
    print("FETCH_FAIL_HINT")
    sys.exit(11)
PY
  code=$?
  if [[ $code -eq 10 ]]; then
    echo FETCH_LIKELY_OK
    break
  fi
  if [[ $code -eq 11 ]]; then
    echo FETCH_FAILED_VISIBLE
    break
  fi
  echo "fetch wait $i"
done

adb exec-out screencap -p > /tmp/loga3-shots/fetch-ui/fetch-after.png
python3 - <<'PY'
import re, pathlib
xml = pathlib.Path("/tmp/loga3-ui-fetch.xml").read_text(errors="ignore")
for t in re.findall(r'text="([^"]+)"', xml):
    if t.strip():
        print("FINAL:", t[:180].replace("&#10;", " | "))
PY
