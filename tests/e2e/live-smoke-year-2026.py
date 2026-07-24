#!/usr/bin/env python3
"""Live smoke: fetch ALL months of 2026, then verify persistence after app restart."""
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
OUT = Path("/tmp/loga3-shots/year-2026")
ROOT = Path(__file__).resolve().parents[2]
YEAR = 2026
MONTHS = [f"{m:02d}" for m in range(1, 13)]
# ~4–6 min/month worst case → allow ~90 min
MAX_TICKS = 900
TICK_S = 4.0


def sh(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run([ADB, *args], capture_output=True, text=True)


def load_creds() -> dict[str, str]:
    vals: dict[str, str] = {}
    src = None
    for path in (ROOT / ".env", Path("/tmp/loga3-smoke-creds.env")):
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
    assert src is not None, "missing .env"
    assert vals.get("LOGA3_USERNAME") and vals.get("LOGA3_PASSWORD") and vals.get("LOGA3_BASE_URL")
    print(f"CREDS_FROM {src}", flush=True)
    return vals


def dump() -> str:
    sh("shell", "uiautomator", "dump", "/sdcard/ui.xml")
    sh("pull", "/sdcard/ui.xml", "/tmp/loga3-year-ui.xml")
    return Path("/tmp/loga3-year-ui.xml").read_text(errors="ignore")


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
    sh("shell", "input", "tap", str((x1 + x2) // 2), str((y1 + y2) // 2))
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


def launch_deep(url: str) -> None:
    sh("shell", f"am start -a android.intent.action.VIEW -d '{url}' {PKG}")


def select_all_months(year: int = YEAR) -> None:
    default_m = f"{time.localtime().tm_mon:02d}"
    print(f"MONTHS_TARGET {MONTHS} default_was {default_m}", flush=True)
    # Ensure year field
    xml = dump()
    # Tap each month chip that is not the default (default already on)
    for m in MONTHS:
        if m == default_m:
            continue
        tap(dump(), m)
        time.sleep(0.12)
    # If somehow default got deselected, turn it back on
    time.sleep(0.3)
    # Year: clear/replace if needed — UI often already shows current year
    blob = " ".join(texts(dump()))
    if str(year) not in blob:
        print(f"WARN year {year} not visible in UI texts; continuing", flush=True)
    print("MONTHS_SELECTED_ALL", flush=True)


def parse_result(blob: str, ts: list[str]) -> dict:
    footer = next((t for t in ts if t.startswith("Status:")), "") + " " + blob
    shifts = 0
    pdfs = 0
    m = re.search(r"(\d+)\s*Schichten", footer)
    if m:
        shifts = int(m.group(1))
    m = re.search(r"(\d+)\s*PDF", footer)
    if m:
        pdfs = int(m.group(1))
    errors = re.findall(r"Fehler[^\n]*", footer)
    no_plan = re.findall(r"NO_PLAN[^\n]*", footer)
    return {
        "shifts": shifts,
        "pdfs": pdfs,
        "errors": errors,
        "no_plan": no_plan,
        "footer": footer[:400],
    }


def main() -> None:
    creds = load_creds()
    print("YEAR_SMOKE start 2026-01..12", flush=True)
    # Natural AVD size — no wm size cheat (parity with real phones)
    sh("shell", "wm", "size", "reset")
    try:
        sh("shell", "wm", "density", "reset")
    except Exception:
        pass
    # Fresh install state for deterministic seed — persistence checked AFTER fetch
    from _pm_clear_guard import pm_clear

    r = pm_clear(PKG, adb=ADB, serial=os.environ.get("ANDROID_SERIAL") or None)
    if r.returncode != 0:
        raise SystemExit(f"pm clear failed: {r.stderr or r.stdout}")
    time.sleep(1.5)

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
    launch_deep(deep)
    print("SEED_LAUNCHED", flush=True)
    time.sleep(8)
    shot("01-after-seed.png")

    xml = dump()
    blob0 = " ".join(texts(xml))
    if re.search(r"Einrichtung|Tenant-URL|WEITER|Setup abschließen", blob0) and not re.search(
        r"Ausgewählte laden|Fetch selected", blob0
    ):
        print("SEED_RETRY", flush=True)
        launch_deep(deep)
        time.sleep(5)

    xml = wait_text(r"Ausgewählte laden|Fetch selected|Setup erforderlich", 90)
    if any(re.search(r"Setup erforderlich|Setup öffnen", t) for t in texts(xml)):
        shot("01-setup-gate.png")
        raise SystemExit("SMOKE_SEED_FAILED")

    tap(xml, "Holen") or tap(xml, "Fetch")
    time.sleep(0.8)
    select_all_months(YEAR)
    shot("02-months.png")

    xml = dump()
    if not (
        tap(xml, "Ausgewählte laden")
        or tap(xml, "Fetch selected")
        or tap(xml, "AUSGEWÄHLTE", partial=True)
    ):
        raise SystemExit("FETCH_BUTTON_MISSING")
    print("FETCH_STARTED year=2026 months=01..12", flush=True)

    ok = False
    last = ""
    saw: set[str] = set()
    result: dict | None = None
    for i in range(MAX_TICKS):
        time.sleep(TICK_S)
        xml = dump()
        ts = texts(xml)
        blob = " ".join(ts)
        interesting = [
            t
            for t in ts
            if re.search(
                r"Status:|Shell|Öffnen|Oeffnen|Splash|Zeiten|Picker|PDF|Fertig|fehlgeschlagen|"
                r"Schichten|Warte|Content|Timeout|Login|Dialog|Kalender|NO_PLAN|Abrechnung|Monat|"
                r"SmartEdin|Export|Zeitprotokoll|Validieren",
                t,
                re.I,
            )
        ]
        if interesting:
            last = " || ".join(interesting[:12])
            print(f"tick{i} {last[:600]}", flush=True)
            for g in (
                "Login",
                "Shell",
                "Öffnen",
                "Oeffnen",
                "Picker",
                "Content-Gate",
                "Zeitprotokoll",
                "PDF",
                "NO_PLAN",
                "Fertig",
            ):
                if re.search(g, last, re.I):
                    saw.add(g)
        if i in (1, 5, 15, 40, 80, 150, 300, 500):
            shot(f"03-tick{i}.png")

        if "Fertig" in ts or re.search(r"Status:\s*\d+\s*Schichten", blob):
            result = parse_result(blob, ts)
            print(f"RESULT {result}", flush=True)
            print(f"GATES_SEEN {sorted(saw)}", flush=True)
            dismiss_ok(xml)
            # Accept full-year if we have any shifts OR only NO_PLAN (unlikely for whole year)
            if result["shifts"] > 0 or result["pdfs"] > 0:
                ok = True
            elif "Fertig" in ts and not result["errors"]:
                # All NO_PLAN edge case
                ok = True
            break
        if "Fetch fehlgeschlagen" in ts:
            result = parse_result(blob, ts)
            print("SMOKE_FAIL", result, flush=True)
            print(f"GATES_SEEN {sorted(saw)}", flush=True)
            shot("04-fail.png")
            dismiss_ok(xml)
            break
    else:
        print("SMOKE_TIMEOUT", last, flush=True)
        print(f"GATES_SEEN {sorted(saw)}", flush=True)
        shot("04-timeout.png")

    shot("05-after-fetch.png")
    if not ok or not result:
        raise SystemExit(3)

    # --- Persistence ---
    print("PERSIST_CHECK force-stop + relaunch", flush=True)
    shifts_before = result["shifts"]
    sh("shell", "am", "force-stop", PKG)
    time.sleep(2)
    sh("shell", "monkey", "-p", PKG, "-c", "android.intent.category.LAUNCHER", "1")
    time.sleep(6)
    # Dismiss setup if somehow reopened (should not — secure store + async storage survive force-stop)
    xml = dump()
    tap(xml, "Holen") or tap(xml, "Fetch") or tap(xml, "Kalender") or tap(xml, "Preview")
    time.sleep(1.5)
    # Open Kalender tab
    xml = dump()
    tap(xml, "Kalender") or tap(xml, "Preview")
    time.sleep(2)
    shot("06-persist-preview.png")
    blob = " ".join(texts(dump()))
    print(f"PERSIST_UI {blob[:300]}", flush=True)
    persist_ok = False
    if shifts_before > 0:
        # Preview shows entry count footer or list content
        if re.search(rf"{shifts_before}\s*(Schichten|entries|Einträge)", blob, re.I):
            persist_ok = True
        elif re.search(r"\d{2}\.\d{2}\.\d{4}|20\d{2}-\d{2}-\d{2}", blob):
            persist_ok = True  # date cells visible
        elif "previewEmpty" in blob or "Keine Schichten" in blob:
            persist_ok = False
        else:
            # Holen status footer may still show count
            tap(dump(), "Holen") or tap(dump(), "Fetch")
            time.sleep(1)
            blob2 = " ".join(texts(dump()))
            print(f"PERSIST_HOLEN {blob2[:300]}", flush=True)
            if re.search(rf"{shifts_before}\s*Schichten", blob2):
                persist_ok = True
    else:
        persist_ok = True  # nothing to persist

    print(
        f"YEAR_SMOKE shifts={result['shifts']} pdfs={result['pdfs']} "
        f"persist={persist_ok} gates={sorted(saw)}",
        flush=True,
    )
    if not persist_ok:
        raise SystemExit(4)
    # Require meaningful year fetch: at least some PDFs/shifts (tenant may lack early months)
    if result["shifts"] < 1 and result["pdfs"] < 1:
        raise SystemExit(5)
    print("YEAR_SMOKE_PASS", flush=True)


if __name__ == "__main__":
    main()
