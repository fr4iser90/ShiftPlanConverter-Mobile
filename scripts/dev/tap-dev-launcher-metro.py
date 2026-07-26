#!/usr/bin/env python3
"""Tap Dev Launcher entry that points at Metro (8088 / localhost)."""
from __future__ import annotations

import re
import subprocess
import sys
import xml.etree.ElementTree as ET

SERIAL = sys.argv[1] if len(sys.argv) > 1 else "ZY22J3RHFC"
XML = sys.argv[2] if len(sys.argv) > 2 else "/tmp/devlaunch.xml"


def tap_bounds(bounds: str) -> None:
    m = re.match(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", bounds)
    if not m:
        raise SystemExit(f"bad bounds {bounds}")
    x1, y1, x2, y2 = map(int, m.groups())
    subprocess.check_call(
        ["adb", "-s", SERIAL, "shell", "input", "tap", str((x1 + x2) // 2), str((y1 + y2) // 2)]
    )


def main() -> int:
    root = ET.parse(XML).getroot()
    texts = []
    for n in root.iter("node"):
        t = (n.attrib.get("text") or "").strip()
        if t:
            texts.append(t)
    print("--- texts ---")
    for t in texts[:80]:
        print(t[:140])

    needles = ("8088", "localhost", "127.0.0.1", "http://", "Continue", "Weiter")
    for needle in needles:
        for n in root.iter("node"):
            blob = f"{n.attrib.get('text') or ''} {n.attrib.get('content-desc') or ''}"
            if needle.lower() not in blob.lower():
                continue
            if n.attrib.get("clickable") != "true":
                # climb to clickable parent? try anyway
                pass
            bounds = n.attrib.get("bounds") or ""
            if not bounds:
                continue
            print(f"tapping {needle!r} via {blob[:100]!r}")
            tap_bounds(bounds)
            return 0
    print("NO TAP MATCH", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
