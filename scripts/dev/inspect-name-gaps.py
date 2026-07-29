#!/usr/bin/env python3
import json
import re
import os
from pathlib import Path

private_root = os.environ.get("SHIFTPLAN_OCR_PRIVATE", "").strip()
hires_dump = os.environ.get("SHIFTPLAN_OCR_PRIVATE_DUMP_HIRES", "").strip()
if not private_root or not hires_dump:
    raise SystemExit("Set SHIFTPLAN_OCR_PRIVATE and SHIFTPLAN_OCR_PRIVATE_DUMP_HIRES first.")
d = json.loads(
    (Path(private_root) / "dumps" / f"{hires_dump}.json").read_text()
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
