#!/usr/bin/env python3
"""Scroll Kalender to top + load fixture for Monatsübersicht shots."""
from __future__ import annotations

import re
import subprocess
import time
from pathlib import Path

ADB = "/nix/store/qgpls420q0bm1h0isxz91njqnfra8ky4-androidsdk/bin/adb"
OUT = Path("/tmp/loga3-shots/calendar")


def sh(*args: str) -> None:
    subprocess.run([ADB, *args], check=False, capture_output=True, text=True)


def dump() -> str:
    sh("shell", "uiautomator", "dump", "/sdcard/ui.xml")
    sh("pull", "/sdcard/ui.xml", "/tmp/loga3-ui-cal.xml")
    return Path("/tmp/loga3-ui-cal.xml").read_text(errors="ignore")


def texts(xml: str) -> list[str]:
    return [t for t in re.findall(r'text="([^"]+)"', xml) if t.strip()]


def shot(name: str) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    p = OUT / name
    data = subprocess.check_output([ADB, "exec-out", "screencap", "-p"])
    p.write_bytes(data)
    print(f"SHOT {p} bytes={len(data)}", flush=True)


def find_bounds(xml: str, label: str, partial: bool = False) -> list[int] | None:
    if partial:
        pats = [
            rf'(?:text|content-desc)="([^"]*{re.escape(label)}[^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"',
            rf'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"[^>]*(?:text|content-desc)="([^"]*{re.escape(label)}[^"]*)"',
        ]
        for pat in pats:
            m = re.search(pat, xml)
            if m and len(m.groups()) == 5:
                return list(map(int, m.groups()[1:]))
        return None
    pats = [
        rf'(?:text|content-desc)="{re.escape(label)}"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"',
        rf'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"[^>]*(?:text|content-desc)="{re.escape(label)}"',
    ]
    for pat in pats:
        m = re.search(pat, xml)
        if m:
            return list(map(int, m.groups()))
    return None


def tap_label(xml: str, label: str, partial: bool = False) -> bool:
    b = find_bounds(xml, label, partial=partial)
    if not b:
        return False
    x1, y1, x2, y2 = b
    cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
    sh("shell", "input", "tap", str(cx), str(cy))
    print(f"TAP {label!r} @ {cx},{cy}", flush=True)
    return True


def swipe(x1: int, y1: int, x2: int, y2: int, ms: int = 250) -> None:
    sh("shell", "input", "swipe", str(x1), str(y1), str(x2), str(y2), str(ms))


def main() -> None:
    xml = dump()
    # Ensure Kalender
    tap_label(xml, "Kalender") or tap_label(xml, "Calendar")
    time.sleep(1)

    # Aggressive fling to top
    for i in range(18):
        swipe(640, 400, 640, 1850, 180)
        time.sleep(0.25)
        xml = dump()
        ts = texts(xml)
        print(f"top-scroll {i}:", ts[:6], flush=True)
        if any("Monatsübersicht" in t or "Month summary" in t for t in ts):
            print("FOUND summary header", flush=True)
            break
        if any(t in ("Datum", "Date") for t in ts) and any(
            "hervorgehoben" in t or "highlighted" in t for t in ts
        ):
            print("FOUND table header area", flush=True)
            break
        # If we see May earliest + Kalender title near top content, stop
        if ts and ts[0] == "Kalender" and any(re.match(r"^\d+\.\d+\.2026$", t) for t in ts[1:4]):
            # still may have scrolled past header - keep going a bit
            pass

    shot("07-kalender-header.png")
    xml = dump()
    print("HEADER TEXTS:", texts(xml)[:35], flush=True)

    # Go Holen, find fixture
    tap_label(dump(), "Holen") or tap_label(dump(), "Fetch")
    time.sleep(0.8)
    found = False
    for i in range(16):
        xml = dump()
        ts = texts(xml)
        print(f"holen-scroll {i}:", [t[:55] for t in ts if "Offline" in t or "Fixture" in t or "laden" in t.lower()], flush=True)
        if tap_label(xml, "Offline-Fixture", partial=True) or tap_label(
            xml, "Offline fixture", partial=True
        ) or tap_label(xml, "FIXTURE", partial=True):
            found = True
            break
        # also try uppercase button label from RN Button
        if tap_label(xml, "OFFLINE-FIXTURE", partial=True):
            found = True
            break
        swipe(640, 1700, 640, 500, 300)
        time.sleep(0.3)
    print("fixture_found", found, flush=True)
    time.sleep(2.5)
    xml = dump()
    if "OK" in texts(xml):
        tap_label(xml, "OK")
        time.sleep(0.6)
    shot("08-after-fixture2.png")

    tap_label(dump(), "Kalender") or tap_label(dump(), "Calendar")
    time.sleep(1.5)
    # Wait for auto-scroll then pull to top again
    time.sleep(1.0)
    for i in range(20):
        swipe(640, 400, 640, 1850, 160)
        time.sleep(0.2)
        xml = dump()
        ts = texts(xml)
        if any("Monatsübersicht" in t or "Month summary" in t for t in ts):
            print("summary visible", flush=True)
            break
        if "Datum" in ts and any("hervorgehoben" in t for t in ts):
            print("header visible", flush=True)
            break
    shot("09-kalender-after-fixture-top.png")
    print("FINAL TEXTS:", texts(dump())[:40], flush=True)
    swipe(640, 1600, 640, 800, 300)
    time.sleep(0.5)
    shot("10-kalender-after-fixture-mid.png")
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
