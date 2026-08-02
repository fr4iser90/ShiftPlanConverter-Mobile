#!/usr/bin/env python3
"""One-shot: if wipe confirm dialog is open, tap ALL-CAPS confirm. No retries."""
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


def sh(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run([ADB, "-s", SERIAL, *args], capture_output=True, text=True)


sh("shell", "uiautomator", "dump", "/sdcard/ui.xml")
sh("pull", "/sdcard/ui.xml", "/tmp/demo-rec/pre.xml")
xml = open("/tmp/demo-rec/pre.xml", encoding="utf-8", errors="ignore").read()
texts = [t for t in re.findall(r'text="([^"]*)"', xml) if t.strip()]
print("PRE", texts[:30])
for label in ("ALLE LOKALEN DATEN LÖSCHEN", "Alle lokalen Daten löschen"):
    hits = []
    for n in re.findall(r"<node [^>]+>", xml):
        m = re.search(r'text="([^"]*)"', n)
        if not m or m.group(1) != label:
            continue
        b = re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', n)
        if b:
            hits.append(tuple(map(int, b.groups())))
    if not hits:
        continue
    hit = max(hits, key=lambda h: h[1])
    x, y = (hit[0] + hit[2]) // 2, (hit[1] + hit[3]) // 2
    sh("shell", "input", "tap", str(x), str(y))
    print("TAPPED", label)
    time.sleep(1.5)
    break
else:
    print("NO_CONFIRM_DIALOG")
