"""Hard gate before `adb shell pm clear`.

Never wipe app data unless explicitly opted in.

Required env:
  LOGA3_ALLOW_PM_CLEAR=1

On physical devices (non-emulator) also required:
  LOGA3_ALLOW_PM_CLEAR_ON_DEVICE=1
"""
from __future__ import annotations

import os
import subprocess
import sys


def _adb_bin() -> str:
    return os.environ.get(
        "ADB",
        "adb",
    )


def _serial() -> str | None:
    s = (os.environ.get("ANDROID_SERIAL") or "").strip()
    return s or None


def is_emulator(adb: str | None = None, serial: str | None = None) -> bool:
    adb = adb or _adb_bin()
    serial = serial if serial is not None else _serial()
    base = [adb] + (["-s", serial] if serial else [])
    try:
        qemu = subprocess.run(
            base + ["shell", "getprop", "ro.kernel.qemu"],
            capture_output=True,
            text=True,
            timeout=10,
        ).stdout.strip()
        hw = subprocess.run(
            base + ["shell", "getprop", "ro.hardware"],
            capture_output=True,
            text=True,
            timeout=10,
        ).stdout.strip()
    except Exception:
        return False
    if qemu == "1":
        return True
    if hw in ("ranchu", "goldfish"):
        return True
    if serial and serial.startswith("emulator-"):
        return True
    return False


def assert_pm_clear_allowed(adb: str | None = None, serial: str | None = None) -> None:
    flag = (os.environ.get("LOGA3_ALLOW_PM_CLEAR") or "").strip().lower()
    if flag not in ("1", "true", "yes"):
        raise SystemExit(
            "REFUSED: pm clear blocked. Set LOGA3_ALLOW_PM_CLEAR=1 only for intentional wipe "
            "(typically emulator smoke)."
        )
    serial = serial if serial is not None else _serial()
    if not is_emulator(adb=adb, serial=serial):
        device_flag = (os.environ.get("LOGA3_ALLOW_PM_CLEAR_ON_DEVICE") or "").strip().lower()
        if device_flag not in ("1", "true", "yes"):
            raise SystemExit(
                f"REFUSED: pm clear on physical device blocked (serial={serial or '?'}). "
                "Set LOGA3_ALLOW_PM_CLEAR_ON_DEVICE=1 only if you really mean it."
            )
    print(
        f"pm-clear guard OK (emu={is_emulator(adb=adb, serial=serial)} serial={serial or 'default'})",
        flush=True,
    )


def pm_clear(pkg: str, adb: str | None = None, serial: str | None = None) -> subprocess.CompletedProcess[str]:
    """Run pm clear only after assert_pm_clear_allowed()."""
    adb = adb or _adb_bin()
    serial = serial if serial is not None else _serial()
    assert_pm_clear_allowed(adb=adb, serial=serial)
    cmd = [adb] + (["-s", serial] if serial else []) + ["shell", "pm", "clear", pkg]
    return subprocess.run(cmd, capture_output=True, text=True)


if __name__ == "__main__":
    # CLI: python3 tests/e2e/_pm_clear_guard.py [package]
    pkg = sys.argv[1] if len(sys.argv) > 1 else "com.fr4iser.loga3mobile"
    r = pm_clear(pkg)
    sys.exit(r.returncode)
