#!/usr/bin/env python3
"""Push wall-plan photo → open gallery OCR path → pull geometry dump → assert matrix UI.

One path: fail clearly. No retries.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

PKG = "com.fr4iser.shiftplan"
DUMP_DEVICE = f"/data/data/{PKG}/cache/ocr-last-geometry.json"
# Also try Expo cache path under files
DUMP_GLOBS = [
    DUMP_DEVICE,
    f"/sdcard/Android/data/{PKG}/cache/ocr-last-geometry.json",
]
SERIAL = os.environ.get("ANDROID_SERIAL", "ZY22J3RHFC")
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
ASSETS = os.path.expanduser(
    "~/.cursor/projects/home-fr4iser-Documents-Git-ShiftPlanConverter-Mobile/assets"
)
PRIV = os.environ.get("SHIFTPLAN_OCR_PRIVATE", "/tmp/shiftplan-ocr-private")
PLAN_CANDIDATES = [
    os.path.join(PRIV, "photos/wallplan.jpg"),
    os.path.join(PRIV, "photos/wallplan.png"),
    os.path.join(PRIV, "photos/month-matrix-feb-wallplan.jpg"),
    os.path.join(PRIV, "photos/month-matrix-feb-wallplan.png"),
    os.path.join(ASSETS, "image-62bde807-dc2e-48fb-8be8-009b37af2b52.png"),
    os.path.join(ASSETS, "image-1068f39d-e425-4af6-9942-062eb7a688db.png"),
]
PLAN = next((p for p in PLAN_CANDIDATES if os.path.isfile(p)), PLAN_CANDIDATES[0])
EXPECTED = os.path.join(PRIV, "expected.json")

REMOTE_IMG = "/sdcard/Download/shiftplan-ocr-wallplan.png"
OUT_DIR = "/tmp/shiftplan-ocr-device"
UI = f"{OUT_DIR}/ui.xml"
# Raise when phone OCR improves; fail clearly below floor (no soft retry).
MIN_DUMP_ROWS = int(os.environ.get("OCR_E2E_MIN_ROWS", "8"))
MIN_EXPECTED_NAME_HITS = int(os.environ.get("OCR_E2E_MIN_NAME_HITS", "8"))


def run(cmd: list[str], check: bool = True) -> subprocess.CompletedProcess:
    print("+", " ".join(cmd), flush=True)
    return subprocess.run(cmd, check=check, text=True, capture_output=True)


def adb(*args: str, check: bool = True) -> subprocess.CompletedProcess:
    return run(["adb", "-s", SERIAL, *args], check=check)


def dump_ui() -> ET.Element:
    adb("shell", "uiautomator", "dump", "/sdcard/window_dump.xml")
    adb("pull", "/sdcard/window_dump.xml", UI)
    return ET.parse(UI).getroot()


def texts(root: ET.Element) -> list[str]:
    out: list[str] = []
    for n in root.iter("node"):
        t = (n.attrib.get("text") or "").strip()
        if t:
            out.append(t)
    return out


def find_node(root: ET.Element, *, text: str | None = None, contains: str | None = None):
    for n in root.iter("node"):
        t = n.attrib.get("text") or ""
        d = n.attrib.get("content-desc") or ""
        blob = f"{t} {d}"
        if text and t == text:
            return n
        if contains and contains.lower() in blob.lower():
            return n
    return None


def tap_node(n: ET.Element) -> None:
    bounds = n.attrib.get("bounds") or ""
    # [x1,y1][x2,y2]
    import re

    m = re.match(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", bounds)
    if not m:
        raise SystemExit(f"bad bounds: {bounds}")
    x1, y1, x2, y2 = map(int, m.groups())
    x, y = (x1 + x2) // 2, (y1 + y2) // 2
    adb("shell", "input", "tap", str(x), str(y))


def main() -> int:
    os.makedirs(OUT_DIR, exist_ok=True)
    if not os.path.isfile(PLAN):
        print(f"FAIL: missing plan image {PLAN}", file=sys.stderr)
        return 2

    adb("shell", "mkdir", "-p", "/sdcard/Download")
    adb("push", PLAN, REMOTE_IMG)
    adb(
        "shell",
        "am",
        "broadcast",
        "-a",
        "android.intent.action.MEDIA_SCANNER_SCAN_FILE",
        "-d",
        f"file://{REMOTE_IMG}",
        check=False,
    )

    # Launch app
    adb(
        "shell",
        "monkey",
        "-p",
        PKG,
        "-c",
        "android.intent.category.LAUNCHER",
        "1",
        check=False,
    )
    time.sleep(2.5)

    root = dump_ui()
    blob = "\n".join(texts(root))
    print("--- UI texts (head) ---")
    print("\n".join(texts(root)[:40]))

    # Navigate to Abrufen / Foto if needed
    for label in ("Abrufen", "Foto (OCR)", "Foto", "OCR"):
        n = find_node(root, contains=label)
        if n is not None and label in ("Foto (OCR)", "Foto", "OCR"):
            tap_node(n)
            time.sleep(1.0)
            root = dump_ui()
            break
        if n is not None and label == "Abrufen":
            tap_node(n)
            time.sleep(1.0)
            root = dump_ui()

    # Monatsmatrix chip
    n = find_node(root, contains="Monatsmatrix")
    if n is not None:
        tap_node(n)
        time.sleep(0.5)
        root = dump_ui()

    n = find_node(root, contains="Aus Galerie")
    if n is None:
        n = find_node(root, contains="Galerie")
    if n is None:
        print("FAIL: Galerie button not found", file=sys.stderr)
        print(blob, file=sys.stderr)
        return 3
    tap_node(n)
    time.sleep(2.0)

    # Picker: try to select Downloads / the image
    root = dump_ui()
    print("--- picker texts ---")
    print("\n".join(texts(root)[:50]))

    for needle in (
        "shiftplan-ocr-wallplan",
        "Download",
        "Downloads",
        "Recent",
        "Zuletzt",
        "Fotos",
        "Images",
    ):
        n = find_node(root, contains=needle)
        if n is not None:
            tap_node(n)
            time.sleep(1.2)
            root = dump_ui()
            break

    # Tap first clickable image-ish node in grid if still in picker
    root = dump_ui()
    picked = False
    for n in root.iter("node"):
        if n.attrib.get("clickable") == "true" and (n.attrib.get("class") or "").endswith("ImageView"):
            tap_node(n)
            picked = True
            break
    if not picked:
        # fallback: any node mentioning png / wallplan
        n = find_node(root, contains="png") or find_node(root, contains="wallplan")
        if n is not None:
            tap_node(n)
            picked = True
    if not picked:
        print("FAIL: could not select image in gallery picker", file=sys.stderr)
        adb("pull", "/sdcard/window_dump.xml", f"{OUT_DIR}/picker-fail.xml", check=False)
        return 4

    # Wait for OCR
    deadline = time.time() + 90
    last = ""
    while time.time() < deadline:
        time.sleep(2.0)
        root = dump_ui()
        last = "\n".join(texts(root))
        if "│" in last or "Tabelle nicht erkannt" in last or "Table not recognized" in last:
            break
        if "Wer bist du" in last or "Das bin ich" in last:
            # pick first plausible name chip then confirm
            for n in root.iter("node"):
                t = (n.attrib.get("text") or "").strip()
                if "," in t and len(t) < 48 and n.attrib.get("clickable") == "true":
                    tap_node(n)
                    time.sleep(0.4)
                    break
            conf = find_node(root, contains="Das bin ich") or find_node(root, contains="That’s me")
            if conf is not None:
                tap_node(conf)
            time.sleep(2.0)
            root = dump_ui()
            last = "\n".join(texts(root))
            break

    open(f"{OUT_DIR}/final-ui.txt", "w", encoding="utf-8").write(last)
    print("--- final UI ---")
    print(last[:2000])

    # Pull geometry dump (run-as)
    local_dump = f"{OUT_DIR}/ocr-last-geometry.json"
    pulled = False
    for path in DUMP_GLOBS:
        cp = adb(
            "shell",
            f"run-as {PKG} cat {path}",
            check=False,
        )
        if cp.returncode == 0 and cp.stdout.strip().startswith("{"):
            open(local_dump, "w", encoding="utf-8").write(cp.stdout)
            pulled = True
            print(f"pulled dump via run-as {path}")
            break
    if not pulled:
        # Expo Go / dev client cache under app_webview or files
        cp = adb(
            "shell",
            f"run-as {PKG} sh -c 'ls -la cache 2>/dev/null; ls -la files 2>/dev/null; find . -name ocr-last-geometry.json 2>/dev/null | head'",
            check=False,
        )
        print(cp.stdout)
        print(cp.stderr)

    ok_matrix = "│" in last or "Monatsmatrix" in last and "Graefe" in last
    fail_msg = "Tabelle nicht erkannt" in last or "Table not recognized" in last

    expected_names: list[str] = []
    if os.path.isfile(EXPECTED):
        expected_names = list(json.load(open(EXPECTED, encoding="utf-8")).get("expectedNames") or [])

    def name_hits(labels: list[str]) -> int:
        if not expected_names:
            return 0
        hits = 0
        for want in expected_names:
            last = want.split(",")[0].strip().lower()[:4]
            if any(last and last in (x or "").lower() for x in labels):
                hits += 1
        return hits

    if pulled:
        dump = json.load(open(local_dump, encoding="utf-8"))
        meta = dump.get("meta") or {}
        print("dump meta:", json.dumps(meta, ensure_ascii=False))
        rows = int(meta.get("rowCount") or 0)
        sample = list(meta.get("sampleNames") or [])
        # Prefer full row names from dump if present
        if isinstance(dump.get("rows"), list):
            sample = [str(r.get("name") or "") for r in dump["rows"] if r.get("name")]
        hits = name_hits(sample)
        print(f"name hits vs golden: {hits}/{len(expected_names)} sample={sample[:12]}")
        if not meta.get("gridOk") or rows < MIN_DUMP_ROWS:
            print(
                f"FAIL: dump gridOk={meta.get('gridOk')} rows={rows} (need ≥{MIN_DUMP_ROWS})",
                file=sys.stderr,
            )
            return 5
        if expected_names and hits < MIN_EXPECTED_NAME_HITS:
            print(
                f"FAIL: only {hits} expected-name hits (need ≥{MIN_EXPECTED_NAME_HITS})",
                file=sys.stderr,
            )
            return 8
        if fail_msg:
            print("FAIL: dump ok but UI shows table not recognized", file=sys.stderr)
            return 6
        print("PASS: device OCR dump meets golden floor")
        return 0

    if fail_msg:
        print("FAIL: UI shows table not recognized", file=sys.stderr)
        return 6
    if "│" in last:
        print("PASS: matrix characters visible in UI")
        return 0

    print("FAIL: inconclusive OCR result (no geometry dump — set EXPO_PUBLIC_OCR_DUMP_GEOMETRY=1)", file=sys.stderr)
    return 7


if __name__ == "__main__":
    sys.exit(main())
