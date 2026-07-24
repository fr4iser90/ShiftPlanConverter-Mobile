#!/usr/bin/env bash
# Guard: never run `adb pm clear` without explicit opt-in.
# Usage: source this file, then: loga3_pm_clear_guard && adb shell pm clear ...
#
# Required:
#   LOGA3_ALLOW_PM_CLEAR=1
# Extra required on physical USB devices (non-emulator):
#   LOGA3_ALLOW_PM_CLEAR_ON_DEVICE=1
loga3_pm_clear_guard() {
  if [[ "${LOGA3_ALLOW_PM_CLEAR:-}" != "1" && "${LOGA3_ALLOW_PM_CLEAR:-}" != "true" && "${LOGA3_ALLOW_PM_CLEAR:-}" != "yes" ]]; then
    echo "REFUSED: pm clear blocked. Set LOGA3_ALLOW_PM_CLEAR=1 only for intentional wipe (emulator smoke)." >&2
    return 1
  fi
  local serial="${ANDROID_SERIAL:-}"
  if [[ -z "$serial" ]]; then
    serial="$(adb get-serialno 2>/dev/null | tr -d '\r' || true)"
  fi
  local qemu
  qemu="$(adb ${serial:+-s "$serial"} shell getprop ro.kernel.qemu 2>/dev/null | tr -d '\r' || true)"
  local char
  char="$(adb ${serial:+-s "$serial"} shell getprop ro.hardware 2>/dev/null | tr -d '\r' || true)"
  local is_emu=0
  if [[ "$qemu" == "1" || "$char" == "ranchu" || "$char" == "goldfish" || "$serial" == emulator-* ]]; then
    is_emu=1
  fi
  if [[ "$is_emu" -eq 0 ]]; then
    if [[ "${LOGA3_ALLOW_PM_CLEAR_ON_DEVICE:-}" != "1" && "${LOGA3_ALLOW_PM_CLEAR_ON_DEVICE:-}" != "true" && "${LOGA3_ALLOW_PM_CLEAR_ON_DEVICE:-}" != "yes" ]]; then
      echo "REFUSED: pm clear on physical device blocked (serial=${serial:-?}). Set LOGA3_ALLOW_PM_CLEAR_ON_DEVICE=1 only if you really mean it." >&2
      return 1
    fi
  fi
  echo "pm-clear guard OK (emu=$is_emu serial=${serial:-default})" >&2
  return 0
}
