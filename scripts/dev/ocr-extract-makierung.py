#!/usr/bin/env python3
"""Extract <stem>.regions.json from <stem>_makierung.jpg.

Marking colors (highlighter on the photo):
  - cyan/teal  → nameColumn  (whole name gutter)
  - orange     → dayHeader   (date strip Mo1…)
  - blue       → ownRow      (your person row: name + shifts)
  - red        → ownName     (optional: only YOUR name cell inside the row)

  nix-shell -p python3 python3Packages.numpy python3Packages.opencv4 --run \\
    'python3 scripts/dev/ocr-extract-makierung.py'

  # single stem:
  nix-shell -p python3 python3Packages.numpy python3Packages.opencv4 --run \\
    'python3 scripts/dev/ocr-extract-makierung.py boehme_patrick'

Then compare auto overlays:

  OCR_EXPORT_OVERLAYS=1 OCR_CHECK_REGIONS=1 npx jest tests/unit/_exportRosterOverlays.test.ts
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import cv2
import numpy as np

REPO = Path(__file__).resolve().parents[2]
CASES = Path(__import__("os").environ.get("SHIFTPLAN_OCR_CASES", REPO / "tmp" / "test-files"))

# OpenCV HSV ranges for highlighter paints (on pixels that differ from original).
# Red is separate from orange so a red own-name cell does not pollute dayHeader.
RANGES = {
    "nameColumn": [(np.array([80, 80, 80]), np.array([105, 255, 255]))],
    "dayHeader": [(np.array([8, 100, 100]), np.array([25, 255, 255]))],
    "ownRow": [(np.array([100, 80, 80]), np.array([130, 255, 255]))],
    "ownName": [
        (np.array([0, 100, 100]), np.array([7, 255, 255])),
        (np.array([170, 100, 100]), np.array([180, 255, 255])),
    ],
}


def largest_bbox(mask: np.ndarray):
    n, _labels, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), 8)
    if n <= 1:
        return None
    areas = stats[1:, cv2.CC_STAT_AREA]
    i = 1 + int(np.argmax(areas))
    if stats[i, cv2.CC_STAT_AREA] < 800:
        return None
    x, y, w, h, a = (int(stats[i, k]) for k in range(5))
    return x, y, w, h, a


def extract_stem(stem: str) -> dict | None:
    orig_p = CASES / f"{stem}.jpg"
    mark_p = CASES / f"{stem}_makierung.jpg"
    if not mark_p.is_file() or not orig_p.is_file():
        return None
    orig = cv2.imread(str(orig_p))
    mark = cv2.imread(str(mark_p))
    if orig is None or mark is None:
        return None
    oh, ow = orig.shape[:2]
    if mark.shape[:2] != (oh, ow):
        mh, mw = mark.shape[:2]
        if (oh > ow) != (mh > mw) and abs(oh / ow - mw / mh) < 0.1:
            mark = cv2.rotate(mark, cv2.ROTATE_90_CLOCKWISE)
        if mark.shape[:2] != (oh, ow):
            mark = cv2.resize(mark, (ow, oh), interpolation=cv2.INTER_AREA)

    H, W = orig.shape[:2]
    diff = cv2.absdiff(mark, orig)
    changed = (diff.sum(axis=2) > 45).astype(np.uint8) * 255
    changed = cv2.morphologyEx(changed, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    hsv = cv2.cvtColor(mark, cv2.COLOR_BGR2HSV)

    out: dict = {"photo": f"{stem}.jpg", "imageWidth": W, "imageHeight": H}
    for kind, ranges in RANGES.items():
        m = np.zeros((H, W), np.uint8)
        for lo, hi in ranges:
            m |= cv2.inRange(hsv, lo, hi)
        m = cv2.bitwise_and(m, changed)
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
        m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
        bb = largest_bbox(m)
        if not bb:
            print(f"  {stem} {kind}: (no region)", flush=True)
            continue
        x, y, w, h, a = bb
        out[kind] = {"x": x / W, "y": y / H, "width": w / W, "height": h / H}
        print(
            f"  {stem} {kind}: area={a} "
            f"norm=({out[kind]['x']:.3f},{out[kind]['y']:.3f},"
            f"{out[kind]['width']:.3f},{out[kind]['height']:.3f})",
            flush=True,
        )
    return out


def main() -> int:
    # Optional: only one stem, e.g. boehme_patrick
    only = [a for a in sys.argv[1:] if not a.startswith("-")]
    marks = sorted(CASES.glob("*_makierung.jpg"))
    if only:
        marks = [CASES / f"{s}_makierung.jpg" for s in only]
        marks = [m for m in marks if m.is_file()]
    if not marks:
        print(f"FAIL: no *_makierung.jpg in {CASES}", file=sys.stderr)
        return 2
    n = 0
    for mark in marks:
        stem = mark.name[: -len("_makierung.jpg")]
        print(f"=== {stem} ===", flush=True)
        payload = extract_stem(stem)
        if not payload:
            print(f"  skip (missing pair)", flush=True)
            continue
        out = CASES / f"{stem}.regions.json"
        out.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"  wrote {out}", flush=True)
        n += 1
    print(f"OK: {n} region files", flush=True)
    return 0 if n else 3


if __name__ == "__main__":
    raise SystemExit(main())
