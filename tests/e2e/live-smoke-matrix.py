#!/usr/bin/env python3
"""Live-Fetch Validierung über alle gängigen Phone- + Tablet-Auflösungen.

Pro Profil wird das Emulator-Display auf genau diese Auflösung gesetzt
(wm size/density = Matrix-Profil, NICHT der alte 1280-Cheat zum Durchdrücken).

Usage (nix-shell):
  python3 tests/e2e/live-smoke-matrix.py
  python3 tests/e2e/live-smoke-matrix.py --profiles common,tablet
  LOGA3_MATRIX_MONTHS=07 python3 tests/e2e/live-smoke-matrix.py
"""
from __future__ import annotations

import argparse
import json
import os
import random
import re
import subprocess
import time
import urllib.parse
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

ADB = os.environ.get(
    "ADB",
    "/nix/store/qgpls420q0bm1h0isxz91njqnfra8ky4-androidsdk/bin/adb",
)
PKG = "com.fr4iser.loga3mobile"
ROOT = Path(__file__).resolve().parents[2]
MATRIX_PATH = ROOT / "tests" / "e2e" / "resolution-matrix.json"
# Single canonical screenshot root for the matrix (do not scatter to .screenshots / tmp/).
OUT_ROOT = Path("/tmp/loga3-shots/matrix")
CREDS_CANDIDATES = [ROOT / ".env", Path("/tmp/loga3-smoke-creds.env")]


def sh(*args: str, check: bool = False, timeout: float = 20) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            [ADB, *args],
            capture_output=True,
            text=True,
            check=check,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        return subprocess.CompletedProcess([ADB, *args], 124, "", f"adb timeout: {' '.join(args)}")


def sh_out(*args: str, timeout: float = 20) -> str:
    p = sh(*args, timeout=timeout)
    out = ((p.stdout or "") + (p.stderr or "")).replace("\r", "").strip()
    return out


def default_months() -> list[str]:
    """Current calendar month + 2 other random months (diverse cases)."""
    env = os.environ.get("LOGA3_MATRIX_MONTHS", "").strip()
    if env and env.lower() not in ("auto", "random"):
        return [m.strip().zfill(2) for m in env.split(",") if m.strip()]
    cur = date.today().month
    others = random.sample([m for m in range(1, 13) if m != cur], 2)
    return [f"{m:02d}" for m in [cur, *sorted(others)]]


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
    assert src is not None, "missing .env"
    assert vals.get("LOGA3_USERNAME") and vals.get("LOGA3_PASSWORD") and vals.get("LOGA3_BASE_URL")
    print(f"CREDS_FROM {src}", flush=True)
    return vals


def load_matrix() -> list[dict]:
    data = json.loads(MATRIX_PATH.read_text())
    return list(data["profiles"])


def dump() -> str:
    remote = "/data/local/tmp/loga3-ui.xml"
    out = Path("/tmp/loga3-matrix-ui.xml")
    dump_r = sh("shell", "uiautomator", "dump", remote)
    # Prefer exec-out cat (avoids /sdcard pull permission issues)
    data = subprocess.run(
        [ADB, "exec-out", "cat", remote],
        capture_output=True,
    )
    if data.returncode == 0 and data.stdout and len(data.stdout) > 32:
        out.write_bytes(data.stdout)
        return out.read_text(errors="ignore")
    pull_r = sh("pull", remote, str(out))
    if out.is_file() and out.stat().st_size > 32:
        return out.read_text(errors="ignore")
    raise RuntimeError(
        "ui dump failed: "
        + (
            (dump_r.stdout or "")
            + (dump_r.stderr or "")
            + (pull_r.stderr or "")
            + (data.stderr.decode(errors="ignore") if data.stderr else "")
        )[:400]
    )


def texts(xml: str) -> list[str]:
    return [t for t in re.findall(r'text="([^"]*)"', xml) if t.strip()]


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
    print(f"  TAP {label!r}", flush=True)
    return True


def shot(outdir: Path, name: str) -> None:
    outdir.mkdir(parents=True, exist_ok=True)
    data = subprocess.check_output([ADB, "exec-out", "screencap", "-p"])
    (outdir / name).write_bytes(data)
    print(f"  SHOT {name}", flush=True)


def wm_size_line() -> str:
    return sh_out("shell", "wm", "size")


def wait_window_service(timeout: float = 120) -> str:
    """Emulator sometimes loses window service after wm spam — wait or fail clear."""
    t0 = time.time()
    last = ""
    while time.time() - t0 < timeout:
        last = wm_size_line()
        if re.search(r"\d+x\d+", last) and "Can't find service" not in last:
            return last
        time.sleep(2)
    raise RuntimeError(f"window service not ready: {last[:120]}")


def apply_profile(width: int, height: int, density: int) -> str:
    """Set display once to this matrix profile. No retries."""
    wait_window_service(90)
    sh_out("shell", "wm", "size", "reset")
    sh_out("shell", "wm", "density", "reset")
    time.sleep(1.0)
    base = wm_size_line()
    if "Can't find service" in base:
        raise RuntimeError(f"window service dead: {base[:120]}")
    if "Physical size: 320x640" in base and "Override" not in base:
        raise RuntimeError(
            "broken AVD Physical size 320x640 — use scripts/dev/loga3-emu-stable.sh"
        )
    if f"{width}x{height}" in base.replace(" ", ""):
        dens = sh_out("shell", "wm", "density")
        if str(density) not in dens.replace(" ", ""):
            sh_out("shell", "wm", "density", str(density))
            time.sleep(0.5)
            dens = sh_out("shell", "wm", "density")
        print(f"  DISPLAY {base} | {dens} (natural match)", flush=True)
        return base
    sh_out("shell", "wm", "size", f"{width}x{height}")
    sh_out("shell", "wm", "density", str(density))
    time.sleep(1.2)
    reported = wm_size_line()
    dens = sh_out("shell", "wm", "density")
    print(f"  DISPLAY {reported} | {dens}", flush=True)
    return reported


def reset_display() -> None:
    sh_out("shell", "wm", "size", "reset")
    sh_out("shell", "wm", "density", "reset")


def launch_seed(
    creds: dict[str, str],
    months: list[str] | None = None,
    year: int | None = None,
    autofetch: bool = False,
) -> None:
    q: dict[str, str] = {
        "smoke": "1",
        "url": creds["LOGA3_BASE_URL"],
        "user": creds["LOGA3_USERNAME"],
        "pass": creds["LOGA3_PASSWORD"],
        "hospital": "st-elisabeth-leipzig",
        "group": "pflege",
        "area": "op-bereich",
        "preset": "Anästhesie",
    }
    if months:
        q["months"] = ",".join(months)
    if year is not None:
        q["year"] = str(year)
    if autofetch:
        q["autofetch"] = "1"
    deep = f"loga3mobile:///?{urllib.parse.urlencode(q)}"
    sh("shell", f"am start -a android.intent.action.VIEW -d '{deep}' {PKG}")


def size_matches(reported: str, width: int, height: int) -> bool:
    """Require exact WxH (Physical or Override). No height-clamp compromise."""
    text = reported.replace(" ", "")
    if f"{width}x{height}" in text:
        return True
    m = re.search(r"Overridesize:(\d+)x(\d+)", text, re.I)
    if m and int(m.group(1)) == width and int(m.group(2)) == height:
        return True
    m = re.search(r"Physicalsize:(\d+)x(\d+)", text, re.I)
    if m and int(m.group(1)) == width and int(m.group(2)) == height:
        return True
    print(f"  FAIL size want {width}x{height} got {reported}", flush=True)
    return False


def read_matrix_status_file() -> str:
    for cmd in (
        ["shell", "run-as", PKG, "cat", "cache/matrix-status.txt"],
        ["shell", "run-as", PKG, "cat", "files/matrix-status.txt"],
        ["shell", "run-as", PKG, "cat", "/data/data/" + PKG + "/cache/matrix-status.txt"],
        ["shell", "run-as", PKG, "cat", "/data/user/0/" + PKG + "/cache/matrix-status.txt"],
        ["shell", "run-as", PKG, "cat", "/data/user/0/" + PKG + "/files/matrix-status.txt"],
    ):
        fr = sh(*cmd)
        text = ((fr.stdout or "") + (fr.stderr or "")).strip()
        for line in text.splitlines():
            line = line.strip()
            if line.startswith("MATRIX_"):
                return line
    return ""


def wait_matrix_done(timeout: float) -> str:
    """Wait for MATRIX_FETCH_PASS/FAIL via status file (primary) + logcat."""
    sh("logcat", "-c")
    proc = subprocess.Popen(
        [ADB, "logcat", "-v", "brief"],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
        bufsize=1,
    )
    assert proc.stdout is not None
    t0 = time.time()
    buf: list[str] = []
    saw_start = False
    try:
        while time.time() - t0 < timeout:
            text = read_matrix_status_file()
            if text:
                if (
                    "MATRIX_FETCH_START" in text or "MATRIX_INTENT_SET" in text
                ) and not saw_start:
                    saw_start = True
                    print(f"  file {text[:220]}", flush=True)
                if "MATRIX_FETCH_PASS" in text or "MATRIX_FETCH_FAIL" in text:
                    print(f"  file {text[:220]}", flush=True)
                    return text

            try:
                import select

                ready, _, _ = select.select([proc.stdout], [], [], 0.5)
                if ready:
                    line = proc.stdout.readline()
                    if line:
                        line = line.rstrip()
                        if "MATRIX_" in line:
                            print(f"  log {line[:220]}", flush=True)
                            buf.append(line)
                        if re.search(r"MATRIX_FETCH_(PASS|FAIL)", line):
                            return line
            except Exception:
                time.sleep(0.4)
        raise TimeoutError(
            f"matrix wait: saw_start={saw_start} last_file={read_matrix_status_file()[:120]!r} logs={buf[-5:]}"
        )
    finally:
        proc.kill()
        try:
            proc.wait(timeout=2)
        except Exception:
            pass


@dataclass
class ProfileResult:
    id: str
    label: str
    size: str
    status: str  # PASS | FAIL | ERROR
    detail: str = ""
    gates: list[str] = field(default_factory=list)


def dismiss_blockers(width: int, height: int) -> None:
    """Dismiss ANR / Expo Continue with taps only — never uiautomator (hangs on ANR)."""
    sh("shell", "input", "tap", str(int(width * 0.68)), str(int(height * 0.52)), timeout=3)
    time.sleep(0.15)
    sh("shell", "input", "tap", str(int(width * 0.55)), str(int(height * 0.55)), timeout=3)
    time.sleep(0.15)
    sh("shell", "input", "tap", str(width // 2), str(int(height * 0.72)), timeout=3)


def wait_js_ready(width: int, height: int, timeout: float = 90) -> bool:
    """Wait until Metro actually loaded JS. No time-based fake ready."""
    t0 = time.time()
    sh("logcat", "-c", timeout=5)
    last_tap = -10.0
    while True:
        elapsed = time.time() - t0
        if elapsed >= timeout:
            return False

        if elapsed - last_tap >= 2.5:
            dismiss_blockers(width, height)
            last_tap = elapsed

        try:
            lc = subprocess.run(
                [ADB, "logcat", "-d", "-t", "80"],
                capture_output=True,
                text=True,
                timeout=3,
            )
            text = ((lc.stdout or "") + (lc.stderr or "")).replace("\r", "")
        except Exception:
            text = ""

        if re.search(r"isn't responding|ANR in|Pixel Launcher", text, re.I):
            sh(
                "shell",
                "input",
                "tap",
                str(int(width * 0.68)),
                str(int(height * 0.52)),
                timeout=3,
            )

        # Real JS only — splash alone is not ready (never time-skip to seed).
        if re.search(r"MATRIX_INTENT_SET|MATRIX_FETCH_", text):
            print("  JS_READY (log MATRIX_*)", flush=True)
            return True
        if re.search(
            r"Android Bundled|Running \"main\"|Bundling complete|ReactNativeJS:.*Running",
            text,
        ):
            print(f"  JS_READY (bundle) t={elapsed:.0f}s", flush=True)
            return True
        if re.search(r"ConnectException|ENETUNREACH|Failed to connect to", text):
            print(f"  JS_FAIL metro unreachable t={elapsed:.0f}s", flush=True)
            return False
        time.sleep(0.5)


def soft_reset_app() -> None:
    """Stop app without pm clear (pm clear → Pixel Launcher ANR on stressed AVDs)."""
    sh("shell", "am", "force-stop", PKG, timeout=10)
    time.sleep(0.5)

def seed_seen_in_logcat(proc_stdout) -> str:
    try:
        import select

        ready, _, _ = select.select([proc_stdout], [], [], 0.3)
        if not ready:
            return ""
        line = proc_stdout.readline()
        if not line:
            return ""
        if "MATRIX_" in line:
            print(f"  log {line.rstrip()[:220]}", flush=True)
            return line
    except Exception:
        pass
    return ""


def run_profile(
    profile: dict,
    creds: dict[str, str],
    months: list[str],
    year: int,
    tick_limit: int,
) -> ProfileResult:
    """One resolution at a time — never parallel with other profiles."""
    pid = profile["id"]
    label = profile["label"]
    w, h, d = int(profile["width"]), int(profile["height"]), int(profile["density"])
    outdir = OUT_ROOT / pid
    # wipe prior shots for this profile
    if outdir.exists():
        for old in outdir.glob("*.png"):
            old.unlink(missing_ok=True)
    print(f"\n======== PROFILE {pid} ({label}) {w}x{h}@{d} ========", flush=True)

    try:
        reported = apply_profile(w, h, d)
        if not size_matches(reported, w, h):
            return ProfileResult(pid, label, reported, "FAIL", f"size mismatch want {w}x{h} got {reported}")

        # pm clear causes Pixel Launcher ANR — soft reset by default
        if os.environ.get("LOGA3_MATRIX_PM_CLEAR", "").strip() in ("1", "true", "yes"):
            sh("shell", "pm", "clear", PKG)
            time.sleep(2)
        else:
            soft_reset_app()

        # 10.0.2.2 is ENETUNREACH on this AVD; adb reverse → device localhost:8091
        metro = "http://127.0.0.1:8091"
        enc = urllib.parse.quote(metro, safe="")
        sh("reverse", "tcp:8091", "tcp:8091", timeout=10)
        dismiss_blockers(w, h)
        sh(
            "shell",
            f"am start -a android.intent.action.VIEW -d 'loga3mobile://expo-development-client/?url={enc}' {PKG}",
        )
        print("  waiting for Metro/JS…", flush=True)
        if not wait_js_ready(w, h, timeout=90):
            shot(outdir, "00-no-js.png")
            return ProfileResult(pid, label, reported, "FAIL", "JS never ready within 90s")

        # Start logcat BEFORE seed so we cannot miss MATRIX_INTENT_SET
        sh("logcat", "-c")
        logproc = subprocess.Popen(
            [ADB, "logcat", "-v", "brief"],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            bufsize=1,
        )
        assert logproc.stdout is not None

        launch_seed(creds, months=months, year=year, autofetch=True)
        print(f"  FETCH_STARTED months={','.join(months)}/{year} (autofetch)", flush=True)
        time.sleep(2)
        dismiss_blockers(w, h)
        shot(outdir, "01-seed.png")

        seed_deadline = time.time() + 40
        try:
            while time.time() < seed_deadline:
                st = read_matrix_status_file()
                if st and ("MATRIX_INTENT_SET" in st or "MATRIX_FETCH_" in st):
                    print(f"  seed_ok file {st[:200]}", flush=True)
                    break
                ll = seed_seen_in_logcat(logproc.stdout)
                if ll and ("MATRIX_INTENT_SET" in ll or "MATRIX_FETCH_" in ll):
                    print("  seed_ok log", flush=True)
                    break
                time.sleep(0.5)
            else:
                shot(outdir, "02-no-seed.png")
                return ProfileResult(pid, label, reported, "FAIL", "smoke seed never wrote MATRIX_* status")
        finally:
            logproc.kill()
            try:
                logproc.wait(timeout=2)
            except Exception:
                pass

        # Budget: ≤120s for 3 months (current + 2 random)
        n_months = max(1, len(months))
        timeout_s = min(120, 40 + 25 * n_months)
        print(f"  fetch_budget={timeout_s}s for {n_months} month(s)", flush=True)
        try:
            line = wait_matrix_done(timeout_s)
        except TimeoutError as e:
            shot(outdir, "04-timeout.png")
            return ProfileResult(pid, label, reported, "FAIL", str(e)[:240])

        shot(outdir, "05-final.png")
        if "MATRIX_FETCH_PASS" in line:
            return ProfileResult(pid, label, reported, "PASS", line[-180:])
        if "MATRIX_FETCH_FAIL" in line:
            return ProfileResult(pid, label, reported, "FAIL", line[-180:])
        return ProfileResult(pid, label, reported, "FAIL", f"unexpected: {line[-160:]}")
    except Exception as e:
        try:
            shot(outdir, "04-error.png")
        except Exception:
            pass
        return ProfileResult(pid, label, wm_size_line(), "ERROR", str(e)[:200])


def write_report(results: list[ProfileResult]) -> Path:
    OUT_ROOT.mkdir(parents=True, exist_ok=True)
    report = OUT_ROOT / "REPORT.md"
    lines = [
        "# Resolution matrix — Live-Fetch",
        "",
        f"Generated: {time.strftime('%Y-%m-%d %H:%M:%S')}",
        "",
        "| Profil | Label | Display | Status | Detail |",
        "|--------|-------|---------|--------|--------|",
    ]
    for r in results:
        detail = r.detail.replace("|", "/").replace("\n", " ")
        lines.append(f"| `{r.id}` | {r.label} | {r.size} | **{r.status}** | {detail} |")
    lines.append("")
    lines.append("Screenshots: `/tmp/loga3-shots/matrix/<profile>/`")
    lines.append("")
    report.write_text("\n".join(lines) + "\n")
    # machine-readable
    (OUT_ROOT / "REPORT.json").write_text(
        json.dumps([r.__dict__ for r in results], indent=2, ensure_ascii=False) + "\n"
    )
    print(f"\nREPORT {report}", flush=True)
    return report


def main() -> None:
    ap = argparse.ArgumentParser(description="Live-Fetch over phone+tablet resolution matrix")
    ap.add_argument("--profiles", default="", help="comma ids, default=all")
    ap.add_argument(
        "--months",
        default="auto",
        help="comma months, or 'auto' = current month + 2 random (default)",
    )
    ap.add_argument("--year", type=int, default=date.today().year)
    ap.add_argument("--ticks", type=int, default=120, help="legacy; fetch budget is fixed ≤120s")
    args = ap.parse_args()

    if args.months.strip().lower() in ("", "auto", "random"):
        months = default_months()
    else:
        months = [m.strip().zfill(2) for m in args.months.split(",") if m.strip()]
    creds = load_creds()
    profiles = load_matrix()
    if args.profiles.strip():
        want = {p.strip() for p in args.profiles.split(",") if p.strip()}
        profiles = [p for p in profiles if p["id"] in want]
        missing = want - {p["id"] for p in profiles}
        if missing:
            raise SystemExit(f"unknown profiles: {sorted(missing)}")

    # Metro reverse (dev client)
    sh("reverse", "tcp:8091", "tcp:8091", timeout=10)

    print("MATRIX start", [p["id"] for p in profiles], flush=True)
    print(f"MONTHS {months}/{args.year} (current+2 random if auto)", flush=True)
    results: list[ProfileResult] = []
    try:
        for p in profiles:
            results.append(run_profile(p, creds, months, args.year, args.ticks))
            print(f"  → {results[-1].status}: {results[-1].detail[:120]}", flush=True)
            # Stop early on first fail only if LOGA3_MATRIX_FAIL_FAST=1
            if (
                results[-1].status != "PASS"
                and os.environ.get("LOGA3_MATRIX_FAIL_FAST", "").strip() in ("1", "true")
            ):
                break
    finally:
        print("\n→ reset display to AVD default", flush=True)
        reset_display()
        print(f"  {wm_size_line()}", flush=True)

    write_report(results)
    print("\n======== SUMMARY ========", flush=True)
    for r in results:
        print(f"  {r.status:5}  {r.id:12}  {r.size}", flush=True)

    if any(r.status != "PASS" for r in results):
        raise SystemExit(1)
    print("MATRIX_ALL_PASS", flush=True)


if __name__ == "__main__":
    main()
