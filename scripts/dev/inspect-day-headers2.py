#!/usr/bin/env python3
import json
import re
from pathlib import Path

d = json.loads(
    Path("/tmp/shiftplan-ocr-private/dumps/hires-3000.json").read_text()
)
lines = d["lines"]
wd = re.compile(r"^(Mo|Di|Mi|Do|Fr|Sa|So)(\d{1,2})?$", re.I)
mashed = re.compile(r"^(Mo|Di|Mi|Do|Fr|Sa|So).*\d", re.I)
items = []
for l in lines:
    t = str(l["text"]).strip()
    if wd.match(t) or mashed.match(t) or re.match(r"^\d{1,2}$", t):
        items.append(l)
items = sorted(items, key=lambda l: l["boundingBox"]["y"])

print("=== y 820-900 ===")
for l in items:
    y = l["boundingBox"]["y"]
    x = l["boundingBox"]["x"]
    if 820 <= y <= 900:
        print(f"y={y:4d} x={x:4d} {l['text']!r}")

print("=== weekday-like (no bare digits) ===")
for l in items:
    t = str(l["text"]).strip()
    if re.match(r"^\d{1,2}$", t):
        continue
    if wd.match(t) or mashed.match(t):
        y = l["boundingBox"]["y"]
        x = l["boundingBox"]["x"]
        print(f"y={y:4d} x={x:4d} {t!r}")
