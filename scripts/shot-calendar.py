#!/usr/bin/env python3
"""Launch-ish UI flow: fixture → Kalender → screenshots under /tmp/loga3-shots/calendar."""
from __future__ import annotations

import re
import subprocess
import time
from pathlib import Path

ADB = "/nix/store/qgpls420q0bm1h0isxz91njqnfra8ky4-androidsdk/bin/adb"
OUT = Path("/tmp/loga3-shots/calendar")


def sh(*args: str, check: bool = False) -> subprocess.CompletedProcess[str]:
    return subprocess.run([ADB, *args], check=check, capture_output=True, text=True)


def dump() -> str:
    sh("shell", "uiautomator", "dump", "/sdcard/ui.xml")
    sh("pull", "/sdcard/ui.xml", "/tmp/loga3-ui-cal.xml")
    return Path("/tmp/loga3-ui-cal.xml").read_text(errors="ignore")


def texts(xml: str) -> list[str]:
    return [t for t in re.findall(r'text="([^"]+)"', xml) if t.strip()]


def shot(name: str) -> Path:
    OUT.mkdir(parents=True, exist_ok=True)
    p = OUT / name
    data = subprocess.check_output([ADB, "exec-out", "screencap", "-p"])
    p.write_bytes(data)
    print(f"SHOT {p} bytes={len(data)}", flush=True)
    return p


def find_bounds(xml: str, label: str, partial: bool = False) -> list[int] | None:
    if partial:
        pats = [
            rf'(?:text|content-desc)="([^"]*{re.escape(label)}[^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"',
            rf'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"[^>]*(?:text|content-desc)="([^"]*{re.escape(label)}[^"]*)"',
        ]
        for pat in pats:
            m = re.search(pat, xml)
            if not m:
                continue
            g = m.groups()
            nums = g[1:] if len(g) == 5 and not g[0].isdigit() else g[:4]
            # normalize: when first pattern, groups are (text,x1,y1,x2,y2)
            if len(g) == 5:
                return list(map(int, g[1:]))
            return list(map(int, g[:4]))
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


def swipe(x1: int, y1: int, x2: int, y2: int, ms: int = 350) -> None:
    sh("shell", "input", "swipe", str(x1), str(y1), str(x2), str(y2), str(ms))


def wait_ready(timeout: float = 90) -> str:
    t0 = time.time()
    while time.time() - t0 < timeout:
        xml = dump()
        ts = texts(xml)
        blob = " ".join(ts)
        print("wait:", [t[:50] for t in ts[:10]], flush=True)
        if re.search(
            r"Ausgewählte laden|Offline-Fixture|LOGA3 Login|Kalender|Holen|Preview|Calendar|Fetch",
            blob,
        ):
            return xml
        time.sleep(2)
    return dump()


def main() -> None:
    print("waiting UI…", flush=True)
    xml = wait_ready()
    shot("01-launch.png")

    tap_label(xml, "Holen") or tap_label(xml, "Fetch")
    time.sleep(1)
    xml = dump()
    shot("02-holen.png")

    found = False
    for _ in range(12):
        xml = dump()
        if tap_label(xml, "Offline-Fixture", partial=True) or tap_label(
            xml, "Offline fixture", partial=True
        ):
            found = True
            break
        swipe(640, 1800, 640, 700, 350)
        time.sleep(0.35)
    print("fixture_found", found, flush=True)
    time.sleep(2.2)

    xml = dump()
    blob = " ".join(texts(xml))
    if "OK" in texts(xml) or "Fixture" in blob or "Einträge" in blob:
        tap_label(xml, "OK")
        time.sleep(0.7)
    shot("03-after-fixture.png")

    xml = dump()
    ok = (
        tap_label(xml, "Kalender")
        or tap_label(xml, "Calendar")
        or tap_label(xml, "Preview")
    )
    print("calendar_tab", ok, flush=True)
    time.sleep(1.8)
    xml = dump()
    print("calendar texts:", [t[:90] for t in texts(xml)[:30]], flush=True)
    shot("04-kalender.png")

    # Pull toward top (show Monatsübersicht + header)
    swipe(640, 900, 640, 1600, 300)
    time.sleep(0.7)
    shot("05-kalender-top.png")

    swipe(640, 1700, 640, 900, 350)
    time.sleep(0.7)
    shot("06-kalender-scroll.png")

    xml = dump()
    interesting = [
        t
        for t in texts(xml)
        if re.search(
            r"Kalender|Monats|Datum|Code|Start|Ende|Schicht|Übertrag|Periode|heute|Heute|2026|Mapping|Keine",
            t,
            re.I,
        )
    ]
    print("INTERESTING:", interesting[:50], flush=True)
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
