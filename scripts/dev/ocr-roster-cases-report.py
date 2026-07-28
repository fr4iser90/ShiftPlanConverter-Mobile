#!/usr/bin/env python3
"""OCR all tmp/test-files via ocr-smoke, pull dumps from logcat, export overlays + drift.

  python3 -u scripts/dev/ocr-roster-cases-report.py

Cold-starts each case (force-stop + VIEW intent) so initialURL applies.
Dumps are assembled from [ocr-geometry-dump-*] logcat lines (release-safe).
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time
import urllib.parse
from pathlib import Path

PKG = "com.fr4iser.shiftplan"
REPO = Path(__file__).resolve().parents[2]
CASES = Path(os.environ.get("SHIFTPLAN_OCR_CASES", REPO / "tmp" / "test-files"))
DUMP_DIR = CASES / "dumps"
OUT_DIR = CASES / "out"
ADB_BIN = os.environ.get(
    "ADB",
    "/nix/store/qgpls420q0bm1h0isxz91njqnfra8ky4-androidsdk/libexec/android-sdk/platform-tools/adb",
)
EXT_DIR = f"/sdcard/Android/data/{PKG}/files"
EXT_IMG = f"{EXT_DIR}/ocr-smoke-case.jpg"

BEGIN_RE = re.compile(r"\[ocr-geometry-dump-begin\] id=(\S+) bytes=(\d+)")
CHUNK_RE = re.compile(r"\[ocr-geometry-dump\] id=(\S+) off=(\d+) (.*)$")
END_RE = re.compile(r"\[ocr-geometry-dump-end\] id=(\S+)")


def pick_serial() -> str:
    preferred = os.environ.get("ANDROID_SERIAL", "ZY22J3RHFC")
    r = subprocess.run([ADB_BIN, "devices"], text=True, capture_output=True, check=True)
    devices = [ln.split("\t")[0] for ln in r.stdout.splitlines()[1:] if "\tdevice" in ln]
    if preferred in devices:
        return preferred
    if devices:
        print(f"using device {devices[0]}", flush=True)
        return devices[0]
    raise SystemExit("FAIL: no adb device — plug phone in")


SERIAL = ""


def adb(*args: str, check: bool = True) -> subprocess.CompletedProcess:
    cmd = [ADB_BIN, "-s", SERIAL, *args]
    print("+", " ".join(cmd), flush=True)
    return subprocess.run(cmd, check=check, text=True, capture_output=True)


def ensure_device() -> None:
    global SERIAL
    SERIAL = pick_serial()
    print(f"device={SERIAL}", flush=True)


def push_case_image(local: Path) -> str:
    adb("shell", f"mkdir -p {EXT_DIR}", check=False)
    adb("push", str(local), EXT_IMG)
    return f"file://{EXT_IMG}"


def clear_logcat() -> None:
    adb("logcat", "-c", check=False)


def assemble_dump_from_logcat() -> dict | None:
    cp = adb("logcat", "-d", "-v", "brief", check=False)
    text = cp.stdout or ""
    begins: dict[str, int] = {}
    chunks: dict[str, dict[int, str]] = {}
    ended: set[str] = set()
    for line in text.splitlines():
        # Drop logcat prefix (I/ReactNativeJS(pid): ...)
        body = line
        if "]: " in line:
            body = line.split("]: ", 1)[1]
        m = BEGIN_RE.search(body)
        if m:
            begins[m.group(1)] = int(m.group(2))
            chunks[m.group(1)] = {}
            continue
        m = CHUNK_RE.search(body)
        if m:
            chunks.setdefault(m.group(1), {})[int(m.group(2))] = m.group(3)
            continue
        m = END_RE.search(body)
        if m:
            ended.add(m.group(1))

    # Prefer newest completed id
    done = [i for i in ended if i in begins and i in chunks]
    if not done:
        return None
    dump_id = sorted(done, key=lambda x: int(x) if x.isdigit() else 0)[-1]
    parts = chunks[dump_id]
    ordered = "".join(parts[k] for k in sorted(parts))
    expect = begins[dump_id]
    if len(ordered) != expect:
        print(
            f"WARN: dump id={dump_id} len={len(ordered)} expected={expect}",
            flush=True,
        )
    try:
        return json.loads(ordered)
    except json.JSONDecodeError as e:
        print(f"WARN: JSON parse failed for dump id={dump_id}: {e}", flush=True)
        return None


def pull_dump(dest: Path, timeout_s: float = 120.0) -> bool:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        payload = assemble_dump_from_logcat()
        if payload and isinstance(payload.get("lines"), list):
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
            return True
        time.sleep(2.0)
    return False


def fire_ocr_smoke_cold(file_uri: str, layout: str = "month-matrix") -> None:
    adb("shell", "input", "keyevent", "KEYCODE_WAKEUP", check=False)
    time.sleep(0.3)
    adb("shell", "input", "swipe", "540", "2000", "540", "400", "200", check=False)
    time.sleep(0.4)
    adb("shell", "wm", "dismiss-keyguard", check=False)
    # Fail fast if still locked — OCR never runs on keyguard.
    lock = adb(
        "shell",
        "dumpsys",
        "window",
        check=False,
    )
    blob = (lock.stdout or "") + (lock.stderr or "")
    if "mDreamingLockscreen=true" in blob or "isStatusBarKeyguard=true" in blob:
        raise SystemExit(
            "FAIL: phone lockscreen still active — unlock the device, then re-run"
        )
    adb("shell", "am", "force-stop", PKG, check=False)
    time.sleep(0.8)
    clear_logcat()
    q = urllib.parse.urlencode(
        {"uri": file_uri, "layout": layout, "t": str(int(time.time() * 1000))}
    )
    url = f"shiftplan://ocr-smoke?{q}"
    # Cold start: intent is getInitialURL
    adb("shell", f"am start -a android.intent.action.VIEW -d {json.dumps(url)}", check=False)


def dismiss_name_picker_if_any() -> None:
    import xml.etree.ElementTree as ET

    adb("shell", "uiautomator", "dump", "/sdcard/window_dump.xml", check=False)
    adb("pull", "/sdcard/window_dump.xml", str(OUT_DIR / "ui.xml"), check=False)
    ui = OUT_DIR / "ui.xml"
    if not ui.is_file():
        return
    root = ET.parse(ui).getroot()
    blob = " ".join((n.attrib.get("text") or "") for n in root.iter("node"))
    if "Wer bist du" not in blob and "Das bin ich" not in blob:
        return
    for n in root.iter("node"):
        t = (n.attrib.get("text") or "").strip()
        if "," in t and len(t) < 48 and n.attrib.get("clickable") == "true":
            m = re.match(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", n.attrib.get("bounds") or "")
            if not m:
                continue
            x1, y1, x2, y2 = map(int, m.groups())
            adb("shell", "input", "tap", str((x1 + x2) // 2), str((y1 + y2) // 2), check=False)
            time.sleep(0.5)
            break
    adb("shell", "uiautomator", "dump", "/sdcard/window_dump.xml", check=False)
    adb("pull", "/sdcard/window_dump.xml", str(OUT_DIR / "ui2.xml"), check=False)
    if not (OUT_DIR / "ui2.xml").is_file():
        return
    root = ET.parse(OUT_DIR / "ui2.xml").getroot()
    for n in root.iter("node"):
        t = n.attrib.get("text") or ""
        if "Das bin ich" in t:
            m = re.match(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", n.attrib.get("bounds") or "")
            if m:
                x1, y1, x2, y2 = map(int, m.groups())
                adb(
                    "shell",
                    "input",
                    "tap",
                    str((x1 + x2) // 2),
                    str((y1 + y2) // 2),
                    check=False,
                )
            break


def main() -> int:
    ensure_device()
    DUMP_DIR.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    cases = sorted(p for p in CASES.glob("*.json") if p.name != "package.json")
    if not cases:
        print(f"FAIL: no case JSON in {CASES}", file=sys.stderr)
        return 2

    ok_n = 0
    for case_path in cases:
        expect = json.loads(case_path.read_text(encoding="utf-8"))
        photo = CASES / expect["photo"]
        stem = photo.stem
        if not photo.is_file():
            print(f"FAIL: missing photo {photo}", file=sys.stderr)
            return 3
        print(f"\n=== {stem} ({expect.get('person')}) ===", flush=True)
        uri = push_case_image(photo)
        fire_ocr_smoke_cold(uri, "month-matrix")
        # OCR + ML Kit usually finishes in a few seconds; allow UI settle
        time.sleep(14.0)
        dismiss_name_picker_if_any()
        dest = DUMP_DIR / f"{stem}.json"
        if not pull_dump(dest, timeout_s=90):
            print(f"FAIL: no geometry dump in logcat for {stem}", file=sys.stderr)
            return 4
        meta = json.loads(dest.read_text(encoding="utf-8")).get("meta") or {}
        print("dump meta:", json.dumps(meta, ensure_ascii=False))
        ok_n += 1
        time.sleep(1.0)

    print(f"\nDumps OK: {ok_n}/{len(cases)} — exporting overlays…", flush=True)
    env = os.environ.copy()
    env["OCR_EXPORT_OVERLAYS"] = "1"
    r = subprocess.run(
        ["npx", "jest", "tests/unit/_exportRosterOverlays.test.ts", "--no-coverage"],
        cwd=str(REPO),
        env=env,
    )
    if r.returncode != 0:
        print("FAIL: overlay export jest", file=sys.stderr)
        return 5
    report = OUT_DIR / "REPORT.md"
    if report.is_file():
        print("\n===== REPORT =====", flush=True)
        print(report.read_text(encoding="utf-8"), flush=True)
    print(f"Overlays: {OUT_DIR}/*-overlay.jpg")
    return 0


if __name__ == "__main__":
    sys.exit(main())
