#!/usr/bin/env bash
# One-profile gate debug: Holen 07/2026 + pull DOM dumps after each pipeline gate.
set -euo pipefail
cd /home/fr4iser/Documents/Git/LOGA3-Automation-Mobile
export NIXPKGS_ALLOW_UNFREE=1
OUT=/tmp/loga3-shots/gate-debug
mkdir -p "$OUT"
exec > >(tee /tmp/loga3-gate-debug.log) 2>&1

echo "=== gate-debug start ==="
nix-shell --run '
set -e
ADB=adb
PKG=com.fr4iser.loga3mobile
OUT=/tmp/loga3-shots/gate-debug

curl -sf --max-time 2 http://127.0.0.1:8091/status >/dev/null || {
  echo "Metro missing on :8091 — start: npm start / expo"
  exit 1
}
adb reverse tcp:8091 tcp:8091
adb shell wm size reset || true
adb shell wm density reset || true
# Common phone-like size for this debug run
adb shell wm size 1080x2400 || adb shell wm size 1080x1920
adb shell wm density 420 || true
echo "SIZE=$(adb shell wm size | tr -d '\''\r'\'')"

adb shell am force-stop "$PKG" || true
# shellcheck disable=SC1091
source /home/fr4iser/Documents/Git/LOGA3-Automation-Mobile/tests/e2e/_pm_clear_guard.sh
loga3_pm_clear_guard
adb shell pm clear "$PKG"
sleep 2

ENC=$(python3 -c "import urllib.parse; print(urllib.parse.quote(\"http://10.0.2.2:8091\", safe=\"\"))")
adb shell am start -a android.intent.action.VIEW -d "loga3mobile://expo-development-client/?url=${ENC}" "$PKG"
echo "waiting bundle…"
sleep 28

python3 - <<'"'"'PY'"'"'
from pathlib import Path
import urllib.parse, subprocess
ADB="adb"
PKG="com.fr4iser.loga3mobile"
vals={}
for line in Path(".env").read_text().splitlines():
    if "=" in line and not line.strip().startswith("#"):
        k,v=line.split("=",1); vals[k.strip()]=v.strip()
q=urllib.parse.urlencode({
  "smoke":"1","url":vals["LOGA3_BASE_URL"],"user":vals["LOGA3_USERNAME"],"pass":vals["LOGA3_PASSWORD"],
  "hospital":"st-elisabeth-leipzig","group":"pflege","area":"op-bereich","preset":"Anästhesie",
  "months":"07","year":"2026","autofetch":"1",
})
deep=f"loga3mobile:///?{q}"
subprocess.check_call([ADB,"shell",f"am start -a android.intent.action.VIEW -d '\''{deep}'\'' {PKG}"])
print("SEED_OK")
PY

# Optional: dismiss Expo Continue once (do NOT spam BACK — exits app to launcher)
sleep 2
adb shell input tap 540 1680 || true
sleep 1

adb logcat -c
# Poll status + screencap on GATE_TRACE
python3 - <<'"'"'PY'"'"'
import subprocess, time, re
from pathlib import Path
OUT=Path("/tmp/loga3-shots/gate-debug")
ADB="adb"
PKG="com.fr4iser.loga3mobile"
t0=time.time()
last_gate=""
n=0
while time.time()-t0 < 420:
    # status file
    r=subprocess.run([ADB,"shell","run-as",PKG,"cat","cache/matrix-status.txt"],capture_output=True,text=True)
    st=(r.stdout or "").strip().splitlines()[0] if r.stdout else ""
    # gate files count
    ls=subprocess.run([ADB,"shell","run-as",PKG,"ls","cache/gate-trace"],capture_output=True,text=True)
    files=[x for x in (ls.stdout or "").split() if x.endswith(".json")]
    log=subprocess.run([ADB,"logcat","-d"],capture_output=True,text=True)
    gates=re.findall(r"GATE_TRACE ([^\s]+)", log.stdout or "")
    if gates and gates[-1] != last_gate:
        last_gate=gates[-1]
        n+=1
        shot=OUT/f"{n:02d}-{last_gate}.png"
        data=subprocess.check_output([ADB,"exec-out","screencap","-p"])
        shot.write_bytes(data)
        print(f"SHOT {shot.name} gate={last_gate} files={len(files)}", flush=True)
    if "MATRIX_FETCH_PASS" in st or "MATRIX_FETCH_FAIL" in st:
        print("RESULT", st[:300], flush=True)
        data=subprocess.check_output([ADB,"exec-out","screencap","-p"])
        (OUT/"99-final.png").write_bytes(data)
        break
    time.sleep(2)
else:
    print("TIMEOUT", flush=True)

# Pull all gate JSON
OUT.mkdir(parents=True, exist_ok=True)
ls=subprocess.run([ADB,"shell","run-as",PKG,"ls","cache/gate-trace"],capture_output=True,text=True)
for f in (ls.stdout or "").split():
    if not f.endswith(".json"): continue
    raw=subprocess.run([ADB,"shell","run-as",PKG,"cat",f"cache/gate-trace/{f}"],capture_output=True)
    (OUT/f).write_bytes(raw.stdout or b"")
    print("PULL", f, len(raw.stdout or b""), flush=True)
print("OUT", OUT, flush=True)
PY

adb shell wm size reset || true
adb shell wm density reset || true
echo "=== done — see $OUT ==="
ls -la "$OUT" | head -40
'
