#!/usr/bin/env bash
# Manual demo screen record on the physical phone.
# Start → you drive the app → Ctrl+C stops and finalizes the mp4.
#
# Usage (from repo, with nix/scrcpy + adb):
#   bash scripts/dev/demo-record-manual.sh 1
#   bash scripts/dev/demo-record-manual.sh 2
#   bash scripts/dev/demo-record-manual.sh custom-name
#
# Never uses pkill. Ctrl+C = clean scrcpy stop.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${DEMO_REC_OUT:-$ROOT/artifacts/demo-rec}"
mkdir -p "$OUT"

SERIAL="${ANDROID_SERIAL:-ZY22J3RHFC}"
label="${1:-manual}"
case "$label" in
  1|demo1) name="demo1-pflege-loga3.mp4" ;;
  2|demo2) name="demo2-arzt-pdf.mp4" ;;
  *) name="${label%.mp4}.mp4" ;;
esac
path="$OUT/$name"

ADB="${ADB:-$(command -v adb || true)}"
SCRCPY="${SCRCPY:-$(command -v scrcpy || true)}"
if [[ -z "$ADB" || -z "$SCRCPY" ]]; then
  echo "FAIL: need adb + scrcpy in PATH (use: nix-shell -p scrcpy --run '…')" >&2
  exit 1
fi

"$ADB" -s "$SERIAL" get-state >/dev/null
"$ADB" -s "$SERIAL" shell input keyevent KEYCODE_WAKEUP >/dev/null 2>&1 || true
"$ADB" -s "$SERIAL" shell wm dismiss-keyguard >/dev/null 2>&1 || true

rm -f "$path"
export DISPLAY="${DISPLAY:-:0}"
export SDL_VIDEODRIVER="${SDL_VIDEODRIVER:-x11}"

echo "REC → $path"
echo "Phone: $SERIAL — drive the app yourself. Ctrl+C = stop & save."
echo

exec "$SCRCPY" -s "$SERIAL" \
  --window-title "shiftplan-demo-manual" \
  --window-width 360 \
  --max-fps 30 \
  --video-bit-rate 4M \
  --record="$path"
