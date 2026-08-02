#!/usr/bin/env python3
"""In-app wipe (no pm clear). Opens Metro Dev Client if needed."""
from __future__ import annotations

import re
import subprocess
import sys
import time

ADB = (
    subprocess.check_output(["which", "adb"], text=True).strip()
    if subprocess.call(["which", "adb"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) == 0
    else "/nix/store/qgpls420q0bm1h0isxz91njqnfra8ky4-androidsdk/bin/adb"
)
SERIAL = sys.argv[1] if len(sys.argv) > 1 else "ZY22J3RHFC"


def adb(*args: str, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(
        [ADB, "-s", SERIAL, *args], check=check, capture_output=True, text=True
    )


def dump() -> str:
    adb("shell", "uiautomator", "dump", "/sdcard/ui.xml")
    adb("pull", "/sdcard/ui.xml", "/tmp/wipe-ui.xml")
    return open("/tmp/wipe-ui.xml", encoding="utf-8", errors="ignore").read()


def texts() -> list[str]:
    return [t for t in re.findall(r'text="([^"]*)"', dump()) if t.strip()]


def tap(label: str, *, partial: bool = False, must: bool = True) -> bool:
    xml = dump()
    hit = None
    for n in re.findall(r"<node [^>]+>", xml):
        m = re.search(r'text="([^"]*)"', n)
        if not m:
            continue
        t = m.group(1)
        if not (t == label or (partial and label in t)):
            continue
        b = re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', n)
        if b:
            hit = tuple(map(int, b.groups()))
            break
    if not hit:
        if must:
            raise SystemExit(f"FAIL tap {label!r} seen={texts()[:40]}")
        return False
    x, y = (hit[0] + hit[2]) // 2, (hit[1] + hit[3]) // 2
    adb("shell", "input", "tap", str(x), str(y))
    print(f"TAP {label!r}")
    time.sleep(0.7)
    return True


def tap_lowest(label: str) -> None:
    hits = []
    for n in re.findall(r"<node [^>]+>", dump()):
        m = re.search(r'text="([^"]*)"', n)
        if not m or m.group(1) != label:
            continue
        b = re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', n)
        if b:
            hits.append(tuple(map(int, b.groups())))
    if not hits:
        raise SystemExit(f"FAIL lowest {label!r} {texts()[:30]}")
    hit = max(hits, key=lambda h: h[1])
    x, y = (hit[0] + hit[2]) // 2, (hit[1] + hit[3]) // 2
    adb("shell", "input", "tap", str(x), str(y))
    print(f"TAP_LOW {label!r}")
    time.sleep(1.0)


def open_app() -> None:
    adb("shell", "input", "keyevent", "KEYCODE_WAKEUP", check=False)
    adb("shell", "wm", "dismiss-keyguard", check=False)
    adb("shell", "am", "force-stop", "com.fr4iser.shiftplan", check=False)
    time.sleep(0.5)
    adb(
        "shell",
        "am",
        "start",
        "-a",
        "android.intent.action.VIEW",
        "-d",
        "shiftplan://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8091",
        check=False,
    )
    deadline = time.time() + 45
    while time.time() < deadline:
        ts = texts()
        if any("Development Build" in t for t in ts):
            tap("http://127.0.0.1:8091", must=False)
            time.sleep(4)
            continue
        if any(
            t in ts
            for t in (
                "Einrichtung",
                "Import",
                "Einstellungen",
                "Arbeitgeber",
                "Ohne Arbeitgeber",
            )
        ):
            for _ in range(2):
                tap("OK", must=False)
            print("APP", ts[:20])
            return
        time.sleep(1)
    raise SystemExit(f"FAIL open app {texts()[:30]}")


def wipe() -> None:
    open_app()
    ts = texts()
    if ("Ohne Arbeitgeber" in ts or "St. Elisabeth Leipzig" in ts) and not any(
        "Einrichtung ok" in t for t in ts
    ):
        if "Alle lokalen Daten löschen" not in ts and "Import" not in ts:
            print("ALREADY_FRESH")
            return

    if "Alle lokalen Daten löschen" not in texts():
        tap("Einstellungen", must=False)
        time.sleep(0.5)
    if "Alle lokalen Daten löschen" not in texts():
        tap("Einrichtung", must=False)
        time.sleep(0.8)
    if "Einrichtung öffnen" in texts():
        tap("Einrichtung öffnen")
        time.sleep(0.8)

    for _ in range(4):
        if "Alle lokalen Daten löschen" in texts():
            break
        adb("shell", "input", "swipe", "540", "1700", "540", "700", "280")
        time.sleep(0.3)

    if "Alle lokalen Daten löschen" not in texts():
        if any(t in texts() for t in ("Ohne Arbeitgeber", "Arbeitgeber")):
            print("FRESH_SETUP")
            return
        raise SystemExit(f"FAIL no wipe btn {texts()[:40]}")

    tap("Alle lokalen Daten löschen")
    time.sleep(1.0)
    tap_lowest("Alle lokalen Daten löschen")
    time.sleep(2.0)
    tap("OK", must=False)
    time.sleep(1.0)
    print("WIPE_DONE", texts()[:25])


if __name__ == "__main__":
    wipe()
