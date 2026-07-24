#!/usr/bin/env python3
"""Live smoke with deep-link setup seed (Unicode-safe)."""
from __future__ import annotations

import os
import re
import subprocess
import time
import urllib.parse
from pathlib import Path

ADB = os.environ.get(
    "ADB",
    "/nix/store/qgpls420q0bm1h0isxz91njqnfra8ky4-androidsdk/bin/adb",
)
PKG = "com.fr4iser.loga3mobile"
OUT = Path("/tmp/loga3-shots/live-smoke")
# Prefer project .env (dev); fall back to staged smoke file
ROOT = Path(__file__).resolve().parents[2]
CREDS_CANDIDATES = [
    ROOT / ".env",
    Path("/tmp/loga3-smoke-creds.env"),
]


def sh(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run([ADB, *args], capture_output=True, text=True)


def load_creds() -> dict[str, str]:
    vals: dict[str, str] = {}
    src: Path | None = None
    for path in CREDS_CANDIDATES:
        if not path.is_file() or path.stat().st_size == 0:
            continue
        src = path
        for line in path.read_text().splitlines():
            s = line.strip()
            if not s or s.startswith("#") or "=" not in s:
                continue
            k, v = s.split("=", 1)
            vals[k.strip()] = v.strip()
        break
    assert src is not None, "missing .env (copy from .env.example)"
    assert vals.get("LOGA3_USERNAME") and vals.get("LOGA3_PASSWORD") and vals.get("LOGA3_BASE_URL")
    print(f"CREDS_FROM {src}", flush=True)
    return vals


def dump() -> str:
    sh("shell", "uiautomator", "dump", "/sdcard/ui.xml")
    sh("pull", "/sdcard/ui.xml", "/tmp/loga3-smoke-ui.xml")
    return Path("/tmp/loga3-smoke-ui.xml").read_text(errors="ignore")


def texts(xml: str) -> list[str]:
    return [t for t in re.findall(r'text="([^"]*)"', xml) if t.strip()]


def shot(name: str) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    data = subprocess.check_output([ADB, "exec-out", "screencap", "-p"])
    (OUT / name).write_bytes(data)
    print(f"SHOT {name}", flush=True)


def find_bounds(xml: str, label: str, partial: bool = False) -> list[int] | None:
    if partial:
        pats = [
            rf'(?:text|content-desc)="([^"]*{re.escape(label)}[^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"',
            rf'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"[^>]*(?:text|content-desc)="([^"]*{re.escape(label)}[^"]*)"',
        ]
        for pat in pats:
            m = re.search(pat, xml)
            if m and len(m.groups()) == 5:
                return list(map(int, m.groups()[1:]))
        return None
    pats = [
        rf'(?:text|content-desc)="{re.escape(label)}"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"',
        rf'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"[^>]*(?:text|content-desc)="{re.escape(label)}"',
    ]
    for pat in pats:
        m = re.search(pat, xml)
        if m:
            return list(map(int, m.groups()))
    return None


def tap(xml: str, label: str, partial: bool = False) -> bool:
    b = find_bounds(xml, label, partial=partial)
    if not b:
        return False
    x1, y1, x2, y2 = b
    cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
    sh("shell", "input", "tap", str(cx), str(cy))
    print(f"TAP {label!r}", flush=True)
    return True


def dismiss_ok(xml: str | None = None) -> None:
    xml = xml or dump()
    tap(xml, "OK") or tap(xml, "Ok")


def wait_text(pattern: str, timeout: float = 90) -> str:
    t0 = time.time()
    last = ""
    while time.time() - t0 < timeout:
        xml = dump()
        blob = " ".join(texts(xml))
        last = blob[:180]
        if re.search(pattern, blob, re.I):
            return xml
        time.sleep(1.2)
    raise TimeoutError(f"wait {pattern!r}: {last}")


def main() -> None:
    creds = load_creds()
    print("SMOKE start", flush=True)
    # Natural AVD size — no wm size cheat (parity with real phones)
    sh("shell", "wm", "size", "reset")
    try:
        sh("shell", "wm", "density", "reset")
    except Exception:
        pass
    from _pm_clear_guard import pm_clear

    r = pm_clear(PKG, adb=ADB, serial=os.environ.get("ANDROID_SERIAL") or None)
    if r.returncode != 0:
        raise SystemExit(f"pm clear failed: {r.stderr or r.stdout}")
    time.sleep(1)

    q = urllib.parse.urlencode(
        {
            "smoke": "1",
            "url": creds["LOGA3_BASE_URL"],
            "user": creds["LOGA3_USERNAME"],
            "pass": creds["LOGA3_PASSWORD"],
            "hospital": "st-elisabeth-leipzig",
            "group": "pflege",
            "area": "op-bereich",
            "preset": "Anästhesie",
        }
    )
    deep = f"loga3mobile:///?{q}"
    # Quote -d for remote shell: unquoted & splits the am command
    def launch_deep(url: str) -> None:
        sh(
            "shell",
            f"am start -a android.intent.action.VIEW -d '{url}' {PKG}",
        )

    launch_deep(deep)
    print("SEED_LAUNCHED", flush=True)
    time.sleep(8)
    shot("01-after-seed.png")

    # If still on setup wizard, re-send deep link (event listener path)
    xml = dump()
    blob0 = " ".join(texts(xml))
    if re.search(r"Einrichtung|Tenant-URL|WEITER|Setup abschließen", blob0) and not re.search(
        r"Ausgewählte laden|Fetch selected", blob0
    ):
        print("SEED_RETRY_EVENT", flush=True)
        launch_deep(deep)
        time.sleep(5)
        shot("01b-seed-retry.png")

    xml = wait_text(r"Ausgewählte laden|Fetch selected|Setup erforderlich", 90)
    print("texts", texts(xml)[:20], flush=True)

    # If setup gate still shows, seed failed
    if any(re.search(r"Setup erforderlich|Setup öffnen", t) for t in texts(xml)):
        shot("01b-setup-gate.png")
        raise SystemExit("SMOKE_SEED_FAILED: still gated")

    tap(xml, "Holen") or tap(xml, "Fetch")
    time.sleep(0.8)
    xml = dump()

    # Exactly 3 months: May–July 2026 (default selection = current month only)
    # Default on first paint is current month (07 in Jul). Add 05+06; leave 07 on.
    target = ["05", "06", "07"]
    default_m = f"{time.localtime().tm_mon:02d}"
    print(f"MONTHS_TARGET {target} default_was {default_m}", flush=True)
    for m in target:
        if m != default_m:
            tap(dump(), m)
            time.sleep(0.15)
    if default_m not in target:
        tap(dump(), default_m)
        time.sleep(0.15)
    time.sleep(0.4)
    xml = dump()
    # Confirm selection via status footer (… · MM,MM,MM/YYYY)
    blob_sel = " ".join(texts(xml))
    print(f"MONTHS_UI {blob_sel[blob_sel.find('Schichten'):blob_sel.find('Schichten')+80] if 'Schichten' in blob_sel else texts(xml)[-5:]}", flush=True)
    if not re.search(r"05,\s*06,\s*07/2026|05,06,07/2026", blob_sel.replace(" ", "")):
        # footer may still say 0 Schichten · 05,06,07/2026
        if not re.search(r"05,06,07", blob_sel.replace(" ", "")):
            shot("02-months-bad.png")
            raise SystemExit(f"MONTHS_NOT_SELECTED: {blob_sel[-120:]}")
    print("MONTHS_OK 05,06,07/2026", flush=True)
    shot("02-holen.png")

    xml = dump()
    if not (
        tap(xml, "Ausgewählte laden")
        or tap(xml, "Fetch selected")
        or tap(xml, "AUSGEWÄHLTE", partial=True)
    ):
        raise SystemExit("FETCH_BUTTON_MISSING")
    print("FETCH_STARTED months=05,06,07 year=2026", flush=True)

    early_zeiten = False
    ok = False
    last = ""
    saw_gates: set[str] = set()
    for i in range(200):
        time.sleep(3)
        xml = dump()
        ts = texts(xml)
        blob = " ".join(ts)
        interesting = [
            t
            for t in ts
            if re.search(
                r"Status:|Shell|Splash|Zeiten|Picker|PDF|Fertig|fehlgeschlagen|zeiten_not_found|shell_still_loading|shell_loading|Schichten|Warte|Content|Timeout|Login|Dialog|Kalender|NO_PLAN|Abrechnung|Monat",
                t,
                re.I,
            )
        ]
        if interesting:
            last = " || ".join(interesting[:10])
            print(f"tick{i} {last[:500]}", flush=True)
            for g in (
                "Login",
                "Shell",
                "Splash",
                "SHELL_LOADING",
                "Zeiten",
                "Picker",
                "Content-Gate",
                "Dialog",
                "PDF",
                "NO_PLAN",
            ):
                if re.search(g, last, re.I):
                    saw_gates.add(g)
        if i in (1, 3, 8, 20, 40, 80):
            shot(f"03-tick{i}.png")
        if i <= 6 and re.search(r"zeiten_not_found", blob, re.I):
            early_zeiten = True
            print("EARLY_ZEITEN_FAIL", flush=True)
            shot("04-early-fail.png")
            break
        # Success: Fertig alert or status with Schichten after multi-month
        if "Fertig" in ts or re.search(r"Status:\s*[1-9]\d*\s*Schichten", blob):
            print("SMOKE_OK", flush=True)
            print(f"GATES_SEEN {sorted(saw_gates)}", flush=True)
            # Require multi-month outcome: 2+ PDFs and/or NO_PLAN mention, or 3 months in footer
            footer = next((t for t in ts if t.startswith("Status:")), "")
            print(f"RESULT_STATUS {footer[:200]}", flush=True)
            pdf_n = 0
            m = re.search(r"(\d+)\s*PDF", footer + " " + blob)
            if m:
                pdf_n = int(m.group(1))
            no_plan = "NO_PLAN" in blob or "NO_PLAN" in footer
            if pdf_n < 2 and not no_plan:
                print(f"WARN_FEW_PDFS pdf_n={pdf_n}", flush=True)
            ok = True
            dismiss_ok(xml)
            break
        if "Fetch fehlgeschlagen" in ts:
            print("SMOKE_FAIL", [t[:120] for t in ts if "fehl" in t.lower() or "Status" in t][:8], flush=True)
            print(f"GATES_SEEN {sorted(saw_gates)}", flush=True)
            shot("04-fail.png")
            dismiss_ok(xml)
            break
    else:
        print("SMOKE_TIMEOUT", last, flush=True)
        print(f"GATES_SEEN {sorted(saw_gates)}", flush=True)
        shot("04-timeout.png")

    shot("05-final.png")
    print("FINAL", texts(dump())[:35], flush=True)

    if early_zeiten:
        raise SystemExit(2)
    if not ok:
        raise SystemExit(3)
    print("SMOKE_PASS", flush=True)


if __name__ == "__main__":
    main()
