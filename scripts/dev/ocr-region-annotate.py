#!/usr/bin/env python3
"""Tiny local annotator for OCR region ground truth (private photos under tmp/).

  python3 scripts/dev/ocr-region-annotate.py tmp/test-files/<stem>.jpg

Opens a window: draw 3 boxes (name column, day header, own row) with mouse.
Keys: 1=name  2=header  3=own-row  s=save  q=quit  u=undo
Writes <stem>.regions.json next to the photo (gitignored via tmp/).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

try:
    import cv2  # type: ignore
except ImportError:
    raise SystemExit("need opencv: pip install opencv-python-headless  (or opencv-python)")


KINDS = ["nameColumn", "dayHeader", "ownRow"]
COLORS = {
    "nameColumn": (40, 180, 160),
    "dayHeader": (20, 120, 220),
    "ownRow": (220, 120, 40),
}


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    photo = Path(sys.argv[1]).resolve()
    if not photo.is_file():
        print(f"missing {photo}")
        return 3
    img = cv2.imread(str(photo))
    if img is None:
        print("failed to read image")
        return 4
    h, w = img.shape[:2]
    out_path = photo.with_suffix("").parent / f"{photo.stem}.regions.json"
    boxes: dict[str, dict] = {}
    if out_path.is_file():
        prev = json.loads(out_path.read_text(encoding="utf-8"))
        for k in KINDS:
            if k in prev:
                boxes[k] = prev[k]

    state = {"kind_i": 0, "drag": None, "boxes": boxes}

    def redraw():
        vis = img.copy()
        for k, b in state["boxes"].items():
            x0 = int(b["x"] * w)
            y0 = int(b["y"] * h)
            x1 = int((b["x"] + b["width"]) * w)
            y1 = int((b["y"] + b["height"]) * h)
            cv2.rectangle(vis, (x0, y0), (x1, y1), COLORS[k], 2)
            cv2.putText(vis, k, (x0, max(20, y0 - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.6, COLORS[k], 2)
        kind = KINDS[state["kind_i"]]
        cv2.putText(
            vis,
            f"draw: {kind}  [1/2/3]  s=save  u=undo  q=quit",
            (12, 28),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            (0, 0, 0),
            3,
        )
        cv2.putText(
            vis,
            f"draw: {kind}  [1/2/3]  s=save  u=undo  q=quit",
            (12, 28),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            (255, 255, 255),
            1,
        )
        if state["drag"]:
            x0, y0, x1, y1 = state["drag"]
            cv2.rectangle(vis, (x0, y0), (x1, y1), COLORS[kind], 1)
        return vis

    def on_mouse(event, x, y, _flags, _param):
        if event == cv2.EVENT_LBUTTONDOWN:
            state["drag"] = [x, y, x, y]
        elif event == cv2.EVENT_MOUSEMOVE and state["drag"]:
            state["drag"][2] = x
            state["drag"][3] = y
        elif event == cv2.EVENT_LBUTTONUP and state["drag"]:
            x0, y0, x1, y1 = state["drag"]
            state["drag"] = None
            xa, xb = sorted([x0, x1])
            ya, yb = sorted([y0, y1])
            if xb - xa < 8 or yb - ya < 4:
                return
            kind = KINDS[state["kind_i"]]
            state["boxes"][kind] = {
                "x": xa / w,
                "y": ya / h,
                "width": (xb - xa) / w,
                "height": (yb - ya) / h,
            }

    win = f"ocr-regions {photo.name}"
    cv2.namedWindow(win, cv2.WINDOW_NORMAL)
    cv2.resizeWindow(win, min(1400, w), min(900, h))
    cv2.setMouseCallback(win, on_mouse)

    while True:
        cv2.imshow(win, redraw())
        key = cv2.waitKey(20) & 0xFF
        if key == ord("q") or key == 27:
            break
        if key == ord("1"):
            state["kind_i"] = 0
        elif key == ord("2"):
            state["kind_i"] = 1
        elif key == ord("3"):
            state["kind_i"] = 2
        elif key == ord("u"):
            kind = KINDS[state["kind_i"]]
            state["boxes"].pop(kind, None)
        elif key == ord("s"):
            payload = {
                "photo": photo.name,
                "imageWidth": w,
                "imageHeight": h,
                **state["boxes"],
            }
            out_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            print(f"saved {out_path}")

    cv2.destroyAllWindows()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
