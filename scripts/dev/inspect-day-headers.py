#!/usr/bin/env python3
import json
import re
from pathlib import Path

d = json.loads(
    Path("/tmp/shiftplan-ocr-private/dumps/hires-3000.json").read_text()
)
lines = d["lines"]
w = d["pageWidth"]
pat = re.compile(r"^(Mo|Di|Mi|Do|Fr|Sa|So)", re.I)
dayish = [
    l
    for l in lines
    if pat.search(str(l["text"]).strip())
    or re.match(r"^\d{1,2}$", str(l["text"]).strip())
]
dayish = sorted(dayish, key=lambda l: (l["boundingBox"]["y"], l["boundingBox"]["x"]))
print("page", w, d["pageHeight"], "lines", len(lines))
print("dayish count", len(dayish))
for l in dayish[:80]:
    b = l["boundingBox"]
    print(f"y={b['y']:4d} x={b['x']:4d} {l['text']!r}")
print("--- name col x<420 ---")
left = sorted(
    [l for l in lines if l["boundingBox"]["x"] < 420],
    key=lambda l: l["boundingBox"]["y"],
)
for l in left[:50]:
    b = l["boundingBox"]
    print(f"y={b['y']:4d} x={b['x']:4d} {l['text']!r}")
