#!/usr/bin/env python3
import json
from pathlib import Path

root = Path(__file__).resolve().parents[2]
hires = root / "/tmp/shiftplan-ocr-private/dumps/hires-3000.json"
src = Path("/tmp/shiftplan-ocr-device/ocr-last-geometry.json")
d = json.loads(src.read_text())
out = {k: d[k] for k in ("pageWidth", "pageHeight", "lines") if k in d}
out["meta"] = d.get("meta")
hires.write_text(json.dumps(out, ensure_ascii=False))
print("saved", hires, "lines", len(out["lines"]))

lines = out["lines"]
w = out["pageWidth"]
left = sorted(
    [l for l in lines if l["boundingBox"]["x"] < w * 0.28],
    key=lambda l: l["boundingBox"]["y"],
)
print("left texts:")
for l in left[:50]:
    b = l["boundingBox"]
    print(f"  x={b['x']:4d} y={b['y']:4d} {l['text']!r}")

days = [
    l
    for l in lines
    if any(str(l["text"]).startswith(d) for d in ("Sa", "So", "Mo", "Di", "Mi", "Do", "Fr"))
]
print("day-like", len(days), [d["text"] for d in days[:25]])
