#!/usr/bin/env bash
# One-shot: Emulator (falls nötig) + Metro :8091 + App öffnen.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PORT="${LOGA3_METRO_PORT:-8091}"
PKG="com.fr4iser.loga3mobile"
HOST_URL="http://10.0.2.2:${PORT}"

# Global aliases (z.B. PIDEA node-wrapper in ~/.bashrc) dürfen hier nicht greifen
unalias node npm npx 2>/dev/null || true

resolve_adb() {
  if command -v adb >/dev/null 2>&1; then
    command -v adb
    return 0
  fi
  for base in "${ANDROID_HOME:-}" "${ANDROID_SDK_ROOT:-}"; do
    if [ -n "$base" ] && [ -x "$base/platform-tools/adb" ]; then
      echo "$base/platform-tools/adb"
      return 0
    fi
  done
  for props in android/local.properties local.properties; do
    if [ -f "$props" ]; then
      sdk="$(grep -E '^sdk\.dir=' "$props" | head -1 | cut -d= -f2- | tr -d '\r')"
      if [ -n "$sdk" ] && [ -x "$sdk/platform-tools/adb" ]; then
        echo "$sdk/platform-tools/adb"
        return 0
      fi
      if [ -n "$sdk" ] && [ -x "$(dirname "$sdk")/bin/adb" ]; then
        echo "$(dirname "$sdk")/bin/adb"
        return 0
      fi
    fi
  done
  # Nix androidsdk layout: …/androidsdk/bin/adb
  local c
  for c in /nix/store/*androidsdk*/bin/adb; do
    if [ -x "$c" ]; then
      echo "$c"
      return 0
    fi
  done
  return 1
}

ADB="$(resolve_adb || true)"
if [ -z "${ADB:-}" ]; then
  echo "adb fehlt. Einmal: nix-shell   (oder Android platform-tools in PATH)" >&2
  exit 1
fi
export PATH="$(dirname "$ADB"):$PATH"

# Echtes Node (nicht PIDEA-Wrapper)
REAL_NODE=""
if command -v node >/dev/null 2>&1; then
  NODE_PATH="$(command -v node)"
  case "$NODE_PATH" in
    *PIDEA*|*node-wrapper*|*node-replacement*)
      REAL_NODE="$(type -a node 2>/dev/null | awk '/nodejs/ {print $NF; exit}')"
      ;;
    *)
      REAL_NODE="$NODE_PATH"
      ;;
  esac
fi
if [ -z "${REAL_NODE:-}" ] || [ ! -x "${REAL_NODE}" ]; then
  for c in /nix/store/*nodejs-22*/bin/node /nix/store/*nodejs*/bin/node; do
    if [ -x "$c" ]; then REAL_NODE="$c"; break; fi
  done
fi
if [ -n "${REAL_NODE:-}" ]; then
  export PATH="$(dirname "$REAL_NODE"):$PATH"
fi

device_ready() {
  "$ADB" devices 2>/dev/null | awk 'NR>1 && $2=="device"{found=1} END{exit !found}'
}

ensure_emulator() {
  if device_ready; then
    echo "→ Emulator/Gerät schon da"
    "$ADB" devices -l | sed -n '1,5p'
    return 0
  fi
  if command -v loga3-emu >/dev/null 2>&1; then
    echo "→ loga3-emu …"
    loga3-emu
  elif command -v emulator >/dev/null 2>&1; then
    echo "→ emulator @pixel_6 (Hintergrund)…"
    nohup emulator -avd pixel_6 -no-boot-anim >/tmp/loga3-emulator.log 2>&1 &
    echo "Log: /tmp/loga3-emulator.log"
  else
    echo "Kein Emulator. In nix-shell: loga3-emu   oder AVD manuell starten." >&2
    exit 1
  fi
  echo "→ warte auf adb…"
  "$ADB" wait-for-device
  for i in $(seq 1 60); do
    boot="$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)"
    if [ "$boot" = "1" ]; then break; fi
    sleep 2
  done
  "$ADB" devices -l | sed -n '1,5p'
}

open_app() {
  "$ADB" reverse "tcp:${PORT}" "tcp:${PORT}" >/dev/null 2>&1 || true
  # Portrait + Breite ≥1280 (GWT). Landscape-wm bei portrait-locked App → seitlich.
  # Nach Native-Rebuild mit orientation:default kann man Landscape nutzen.
  "$ADB" shell settings put system accelerometer_rotation 0 >/dev/null 2>&1 || true
  "$ADB" shell settings put system user_rotation 0 >/dev/null 2>&1 || true
  "$ADB" shell wm size 1280x2400 >/dev/null 2>&1 || true
  "$ADB" shell wm density 320 >/dev/null 2>&1 || true
  ENCODED="$(python3 -c "import urllib.parse; print(urllib.parse.quote('${HOST_URL}', safe=''))")"
  "$ADB" shell am start -a android.intent.action.VIEW \
    -d "loga3mobile://expo-development-client/?url=${ENCODED}" \
    "$PKG" >/dev/null 2>&1 || true
  echo "→ App-Deep-Link gesendet (${HOST_URL}, 1280×2400 portrait)"
}

ensure_emulator

if curl -sf "http://127.0.0.1:${PORT}/status" >/dev/null 2>&1; then
  echo "→ Metro läuft schon auf :${PORT}"
  open_app
  echo "Fertig. Metro war schon gestartet — Logs im anderen Terminal."
  exit 0
fi

echo "→ Metro :${PORT} + App öffnen…"
(
  for i in $(seq 1 90); do
    if curl -sf "http://127.0.0.1:${PORT}/status" >/dev/null 2>&1; then
      open_app
      exit 0
    fi
    sleep 1
  done
  echo "warn: Metro nicht rechtzeitig bereit — App manuell öffnen / Taste a" >&2
) &

exec npx expo start --port "$PORT" --dev-client --android
