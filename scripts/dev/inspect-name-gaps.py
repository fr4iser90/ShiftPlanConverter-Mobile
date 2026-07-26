#!/usr/bin/env python3
import json
import re
from pathlib import Path

d = json.loads(
    Path("/tmp/shiftplan-ocr-private/dumps/hires-3000.json").read_text()
)
name_max_x = 417
lines = [
    l
    for l in d["lines"]
    if (l["boundingBox"]["x"] + l["boundingBox"]["width"] / 2) < name_max_x
]


def ok(t: str) -> bool:
    t = t.strip()
    if len(t) < 2:
        return False
    if re.search(r"telefon|stationsleitung|fkt|februar|anästhesie", t, re.I):
        return False
    if not re.search(r"[A-Za-zÄÖÜäöüß]", t):
        return False
    return True


toks = [l for l in lines if ok(l["text"])]
ys = sorted(l["boundingBox"]["y"] + l["boundingBox"]["height"] / 2 for l in toks)
gaps = [ys[i] - ys[i - 1] for i in range(1, len(ys))]
print("n", len(toks), "gaps", [round(g, 1) for g in gaps])
print("median", sorted(gaps)[len(gaps) // 2], "mean", sum(gaps) / len(gaps))
for l in sorted(toks, key=lambda l: l["boundingBox"]["y"]):
    yc = l["boundingBox"]["y"] + l["boundingBox"]["height"] / 2
    print(f"{yc:7.1f} {l['text']!r}")
