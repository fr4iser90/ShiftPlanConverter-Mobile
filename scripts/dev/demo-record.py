#!/usr/bin/env python3
"""
Record demo videos on a physical Android device (USB).

Unicode (Umlaute etc.) via scrcpy clipboard autosync + KEYCODE_PASTE — no ATX/IME apps.

Usage (from nix-shell, phone plugged in):
  python3 scripts/dev/demo-record.py 1
  python3 scripts/dev/demo-record.py 2
  python3 scripts/dev/demo-record.py both

In-app wipe ("Alle lokalen Daten löschen") runs before each demo — Demo #2 is clean too.
Env: ANDROID_SERIAL (default first USB device), reads repo .env DEMO_* / LOGA3_*.
One path per step — FAIL clearly (no retries). Never pm clear.
"""
from __future__ import annotations

import os
import re
import signal
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(os.environ.get("DEMO_REC_OUT", str(ROOT / "artifacts" / "demo-rec")))
OUT.mkdir(parents=True, exist_ok=True)
XML = OUT / "ui.xml"
PID_FILE = OUT / "demo-record.pid"
WIN_TITLE = "shiftplan-demo-rec"

PKG = "com.fr4iser.shiftplan"


def write_pid_file() -> None:
    """So stop uses kill $(cat pid) — never pkill -f (self-kills the launcher)."""
    PID_FILE.write_text(str(os.getpid()), encoding="utf-8")
    print(f"PID {os.getpid()} → {PID_FILE}")


def clear_pid_file() -> None:
    try:
        if PID_FILE.is_file() and PID_FILE.read_text(encoding="utf-8").strip() == str(
            os.getpid()
        ):
            PID_FILE.unlink()
    except OSError:
        pass


def which(name: str) -> str | None:
    from shutil import which as w

    return w(name)


def resolve_adb() -> str:
    return os.environ.get("ADB") or which("adb") or ""


def resolve_scrcpy() -> str:
    return os.environ.get("SCRCPY") or which("scrcpy") or ""


ADB = resolve_adb()
SCRCPY = resolve_scrcpy()


def require(env: dict[str, str], key: str) -> str:
    v = (env.get(key) or "").strip()
    if not v:
        raise SystemExit(f"FAIL: missing {key} in .env")
    return v


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    path = ROOT / ".env"
    if not path.is_file():
        raise SystemExit(f"FAIL: missing {path}")
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def pick_serial() -> str:
    if os.environ.get("ANDROID_SERIAL"):
        return os.environ["ANDROID_SERIAL"]
    cp = subprocess.run([ADB, "devices"], capture_output=True, text=True, check=True)
    usb = []
    for line in cp.stdout.splitlines()[1:]:
        parts = line.split()
        if len(parts) >= 2 and parts[1] == "device":
            serial = parts[0]
            # Prefer USB physical over emulator
            if serial.startswith("emulator-"):
                continue
            usb.append(serial)
    if not usb:
        raise SystemExit("FAIL: no USB Android device (refusing emulator-only)")
    return usb[0]


SERIAL = ""


def adb(*args: str, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(
        [ADB, "-s", SERIAL, *args],
        check=check,
        capture_output=True,
        text=True,
    )


def dump() -> str:
    """Pull UI hierarchy. Some devices return 137 even when the dump file is valid."""
    deadline = time.time() + 25
    last_err = ""
    while time.time() < deadline:
        cp = adb("shell", "uiautomator", "dump", "/sdcard/ui.xml", check=False)
        pull = adb("pull", "/sdcard/ui.xml", str(XML), check=False)
        if XML.is_file() and XML.stat().st_size > 200:
            body = XML.read_text(encoding="utf-8", errors="ignore")
            if "<hierarchy" in body:
                return body
        last_err = (
            (cp.stderr or cp.stdout or f"dump_rc={cp.returncode}").strip()
            + f" pull_rc={pull.returncode}"
        )
        time.sleep(0.8)
    raise SystemExit(f"FAIL: uiautomator dump: {last_err}")


def texts() -> list[str]:
    return [t for t in re.findall(r'text="([^"]*)"', dump()) if t.strip()]


def nodes_with(substr: str) -> list[tuple[str, tuple[int, int, int, int]]]:
    xml = dump()
    out: list[tuple[str, tuple[int, int, int, int]]] = []
    for n in re.findall(r"<node [^>]+/?>", xml):
        if substr not in n:
            continue
        m = re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', n)
        if not m:
            continue
        b = tuple(int(x) for x in m.groups())
        out.append((n, b))  # type: ignore[arg-type]
    return out


def tap_xy(x: int, y: int) -> None:
    adb("shell", "input", "tap", str(x), str(y))
    time.sleep(0.45)


def tap_label(label: str, *, must: bool = True, partial: bool = False) -> bool:
    exact = nodes_with(f'text="{label}"')
    hits = exact
    if not hits and partial:
        hits = nodes_with(label)
    if not hits:
        if must:
            raise SystemExit(f"FAIL: UI label not found: {label!r}\nSeen: {texts()[:40]}")
        return False
    _n, b = hits[0]
    tap_xy((b[0] + b[2]) // 2, (b[1] + b[3]) // 2)
    print(f"TAP {label!r}")
    return True


def swipe(x1: int, y1: int, x2: int, y2: int, ms: int = 280) -> None:
    adb("shell", "input", "swipe", str(x1), str(y1), str(x2), str(y2), str(ms))
    time.sleep(0.55)


def key(code: str) -> None:
    adb("shell", "input", "keyevent", code)
    time.sleep(0.3)


def shot(name: str) -> None:
    p = OUT / name
    with open(p, "wb") as f:
        subprocess.run(
            [ADB, "-s", SERIAL, "exec-out", "screencap", "-p"], stdout=f, check=True
        )
    print(f"SHOT {p}")


def set_host_clipboard(text: str) -> None:
    """Put unicode on host clipboard so scrcpy autosyncs to the phone."""
    xclip = which("xclip")
    if not xclip:
        raise SystemExit("FAIL: xclip required for unicode paste (nix: xclip)")
    subprocess.run(
        [xclip, "-selection", "clipboard"],
        input=text.encode("utf-8"),
        check=True,
    )
    # primary too (some WMs)
    subprocess.run(
        [xclip, "-selection", "primary"],
        input=text.encode("utf-8"),
        check=True,
    )


def paste_into_focused_field(text: str) -> None:
    """Focus must already be in an EditText. Uses scrcpy clipboard sync + PASTE."""
    set_host_clipboard(text)
    time.sleep(0.7)  # autosync
    adb("shell", "input", "keyevent", "KEYCODE_PASTE")
    time.sleep(0.35)


def clear_focused_field(max_del: int = 48) -> None:
    adb("shell", "input", "keyevent", "KEYCODE_MOVE_END", check=False)
    for _ in range(max_del):
        adb("shell", "input", "keyevent", "KEYCODE_DEL", check=False)


def edit_texts() -> list[tuple[str, tuple[int, int, int, int]]]:
    out = []
    for n, b in nodes_with('class="android.widget.EditText"'):
        m = re.search(r'text="([^"]*)"', n)
        out.append((m.group(1) if m else "", b))
    return out


def fill_edit(index: int, value: str, *, placeholders: set[str] | None = None) -> None:
    edits = edit_texts()
    if index >= len(edits):
        raise SystemExit(f"FAIL: EditText[{index}] missing (have {len(edits)})")
    cur, b = edits[index]
    ph = placeholders or set()
    if cur == value:
        return
    tap_xy((b[0] + b[2]) // 2, (b[1] + b[3]) // 2)
    clear_focused_field(max_del=64)
    paste_into_focused_field(value)


def scrcpy_window_id() -> str:
    cp = subprocess.run(
        ["xdotool", "search", "--name", WIN_TITLE],
        capture_output=True,
        text=True,
        check=False,
    )
    ids = [x for x in cp.stdout.split() if x.strip()]
    if not ids:
        raise SystemExit(f"FAIL: scrcpy window {WIN_TITLE!r} not found (need SDL_VIDEODRIVER=x11)")
    return ids[0]


def adb_type_ascii(s: str) -> None:
    """Type ASCII via adb (updates RN controlled TextInput). No unicode."""
    for ch in s:
        if ch == " ":
            adb("shell", "input", "text", "%s", check=False)
        elif ch == "#":
            adb("shell", "input", "keyevent", "KEYCODE_POUND", check=False)
        elif ch == "!":
            adb("shell", "input", "text", "!", check=False)
        elif ch == "@":
            adb("shell", "input", "text", "@", check=False)
        elif ch in ".-_:/?&=%+":
            adb("shell", "input", "text", ch, check=False)
        elif ch.isascii() and ch.isprintable():
            adb("shell", "input", "text", ch, check=False)
        else:
            raise SystemExit(f"FAIL: non-ascii for adb_type_ascii: {ch!r}")
        time.sleep(0.02)


def fill_edit_adb_or_paste(index: int, value: str, *, password: bool = False) -> None:
    edits = edit_texts()
    if index >= len(edits):
        raise SystemExit(f"FAIL: EditText[{index}] missing")
    cur, b = edits[index]
    if not password and cur == value:
        return
    tap_xy((b[0] + b[2]) // 2, (b[1] + b[3]) // 2)
    clear_focused_field(max_del=80)
    if all(c.isascii() for c in value):
        adb_type_ascii(value)
    else:
        paste_into_focused_field(value)
    time.sleep(0.25)
    if not password:
        got = edit_texts()[index][0]
        if got != value and value not in got:
            raise SystemExit(f"FAIL: fill EditText[{index}] got {got!r}")


class Recorder:
    """scrcpy record + clipboard bridge (small X11 window for autosync)."""

    def __init__(self, path: Path):
        self.path = path
        self.proc: subprocess.Popen | None = None

    def start(self) -> None:
        if not SCRCPY:
            raise SystemExit("FAIL: scrcpy not in PATH (nix-shell -p scrcpy)")
        if self.path.exists():
            self.path.unlink()
        env = os.environ.copy()
        # Wayland-native window is invisible to our tooling; force X11 for clipboard path
        env.setdefault("SDL_VIDEODRIVER", "x11")
        self.proc = subprocess.Popen(
            [
                SCRCPY,
                "-s",
                SERIAL,
                "--window-title",
                WIN_TITLE,
                "--window-width",
                "320",
                "--window-height",
                "640",
                "--max-fps",
                "30",
                "--video-bit-rate",
                "4M",
                f"--record={self.path}",
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            env=env,
        )
        time.sleep(2.5)
        if self.proc.poll() is not None:
            out = self.proc.stdout.read() if self.proc.stdout else ""
            raise SystemExit(f"FAIL: scrcpy died early:\n{out}")
        print(f"REC start {self.path} serial={SERIAL}")

    def stop(self) -> None:
        if not self.proc:
            return
        self.proc.send_signal(signal.SIGINT)
        try:
            out, _ = self.proc.communicate(timeout=25)
        except subprocess.TimeoutExpired:
            self.proc.kill()
            out, _ = self.proc.communicate(timeout=5)
        size = self.path.stat().st_size if self.path.exists() else 0
        print(f"REC stop rc={self.proc.returncode} size={size}")
        if out:
            print(out[-600:])


def go_calendar_widget_page(*, hold_s: float = 2.5) -> None:
    key("KEYCODE_HOME")
    time.sleep(0.7)
    for i in range(6):
        ts = texts()
        if "August" in ts or "September" in ts or "Oktober" in ts:
            if "M" in ts and ("D" in ts or "F" in ts or "S" in ts):
                print(f"ON calendar widget page (swipe {i})")
                time.sleep(hold_s)
                return
        if any("Mariä" in t or "Assumption" in t for t in ts):
            print(f"ON calendar widget page (swipe {i})")
            time.sleep(hold_s)
            return
        swipe(900, 1200, 180, 1200)
    raise SystemExit(f"FAIL: Google Calendar widget page not found. Seen: {texts()[:25]}")


def require_fresh_setup(employer_label: str) -> None:
    """Cold demo: must land on workplace picker, not a finished profile."""
    ts = texts()
    if any("Einrichtung ok" in t for t in ts):
        raise SystemExit(
            "FAIL: app still configured — wipe local data before clean demo recording"
        )
    if employer_label in ts or "Ohne Arbeitgeber" in ts or "Arbeitgeber" in ts:
        return
    raise SystemExit(f"FAIL: expected fresh setup workplace step. Seen: {ts[:40]}")


def tap_lowest_label(label: str) -> None:
    """Confirm dialogs often duplicate the wipe label — tap the lowest match."""
    hits = []
    for n in re.findall(r"<node [^>]+>", dump()):
        m = re.search(r'text="([^"]*)"', n)
        if not m or m.group(1) != label:
            continue
        b = re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', n)
        if b:
            hits.append(tuple(map(int, b.groups())))
    if not hits:
        raise SystemExit(f"FAIL: lowest label missing: {label!r}. Seen: {texts()[:30]}")
    hit = max(hits, key=lambda h: h[1])
    tap_xy((hit[0] + hit[2]) // 2, (hit[1] + hit[3]) // 2)
    print(f"TAP_LOW {label!r}")


def open_app_via_deeplink() -> None:
    """Force-stop + Expo Dev Client deep link to Metro 8091."""
    adb("shell", "am", "force-stop", PKG, check=False)
    time.sleep(1.2)
    adb(
        "shell",
        "am",
        "start",
        "-a",
        "android.intent.action.VIEW",
        "-d",
        "shiftplan://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8091",
        check=False,
    )
    time.sleep(3.0)  # let activity + uiautomator settle before first dump
    deadline = time.time() + 50
    while time.time() < deadline:
        ts = texts()
        dismiss_alerts()
        if any("Development Build" in t for t in ts):
            tap_label("http://127.0.0.1:8091", must=False)
            time.sleep(4.0)
            continue
        if any(
            t in ts
            for t in (
                "Einrichtung",
                "Import",
                "Einstellungen",
                "Arbeitgeber",
                "Ohne Arbeitgeber",
                "Kalender",
            )
        ):
            print(f"APP open: {ts[:18]}")
            return
        time.sleep(1.0)
    raise SystemExit(f"FAIL: app did not open for wipe. Seen: {texts()[:30]}")


def wipe_local_data() -> None:
    """In-app wipe only — never pm clear. Required before every clean demo.

    Path (exact):
      Einstellungen → Einrichtung (hub row) → scroll → „Alle lokalen Daten löschen“
    NEVER tap „Einrichtung öffnen“ — that opens /setup wizard (no wipe button).
    """
    print("WIPE: start (in-app)")
    open_app_via_deeplink()
    dismiss_alerts()

    def has_wipe_btn() -> bool:
        return "Alle lokalen Daten löschen" in texts()

    def on_settings_wipe_screen() -> bool:
        # settings/setup.tsx shows both openSetup + wipe; wizard does not.
        ts = texts()
        return "Einrichtung öffnen" in ts or has_wipe_btn()

    def on_setup_wizard() -> bool:
        ts = texts()
        if "Einrichtung öffnen" in ts or has_wipe_btn():
            return False
        return any(
            t in ts
            for t in ("Ohne Arbeitgeber", "LOGA3-Portal", "Fertig ohne Sync")
        )

    def open_settings_wipe_screen() -> None:
        if has_wipe_btn():
            return
        if not tap_label("Einstellungen", must=False):
            # NEVER „Fertig ohne Sync“ — that saves without employer.
            raise SystemExit(
                "FAIL: Einstellungen missing for wipe (still on setup wizard?). "
                "Do not use Fertig ohne Sync. Seen: "
                f"{texts()[:40]}"
            )
        time.sleep(0.7)
        if not has_wipe_btn():
            if not tap_label("Einrichtung", must=False):
                raise SystemExit(
                    f"FAIL: Einrichtung hub row missing. Seen: {texts()[:40]}"
                )
            time.sleep(0.8)
        # Wrong screen = wizard — back out. Never open wizard via „Einrichtung öffnen“.
        if on_setup_wizard():
            key("KEYCODE_BACK")
            time.sleep(0.6)
            if not on_settings_wipe_screen():
                tap_label("Einstellungen", must=False)
                time.sleep(0.5)
                tap_label("Einrichtung", must=False)
                time.sleep(0.8)
        if on_setup_wizard() or not on_settings_wipe_screen():
            raise SystemExit(
                "FAIL: wipe needs Settings→Einrichtung (not wizard). "
                f"Seen: {texts()[:40]}"
            )
        for _ in range(6):
            if has_wipe_btn():
                return
            swipe(540, 1700, 540, 700)
            time.sleep(0.25)
        if not has_wipe_btn():
            raise SystemExit(f"FAIL: wipe button missing. Seen: {texts()[:40]}")

    ts = texts()
    # Fresh workplace picker (after wipe / first launch): nothing to wipe.
    # "+ Profil" means leftover workplaces — must wipe via Settings, never Fertig ohne Sync.
    blank = (
        ("Ohne Arbeitgeber" in ts or "Arbeitgeber" in ts)
        and "+ Profil" not in ts
        and not any("Einrichtung ok" in t for t in ts)
        and "Import" not in ts
        and "Einstellungen" not in ts
    )
    if blank and not has_wipe_btn():
        print("WIPE: already fresh (empty setup)")
        return

    open_settings_wipe_screen()
    # Confirm we never navigate into the wizard from here.
    if "Einrichtung öffnen" in texts():
        print("WIPE: on settings/setup (Einrichtung öffnen visible — not tapping it)")
    tap_label("Alle lokalen Daten löschen")
    time.sleep(1.0)
    # Android Alert often exposes the destructive action in ALL CAPS.
    if "ALLE LOKALEN DATEN LÖSCHEN" in texts():
        tap_lowest_label("ALLE LOKALEN DATEN LÖSCHEN")
    elif "Alle lokalen Daten löschen" in texts():
        tap_lowest_label("Alle lokalen Daten löschen")
    else:
        raise SystemExit(f"FAIL: wipe confirm missing. Seen: {texts()[:30]}")
    time.sleep(2.0)
    dismiss_alerts()
    # Confirm dialog must be gone.
    if "ABBRECHEN" in texts() or "ALLE LOKALEN DATEN LÖSCHEN" in texts():
        raise SystemExit(f"FAIL: wipe confirm still open. Seen: {texts()[:30]}")
    time.sleep(0.8)
    print(f"WIPE: done — {texts()[:20]}")


def select_workplace_scope(
    employer: str, group_label: str, area_label: str, role_label: str = ""
) -> None:
    """Pick employer + group/area on workplace step. Pack may auto-pick on employer tap."""
    ensure_workplace_step(employer)
    tap_label(employer)
    time.sleep(0.7)
    ts = texts()
    # hydrateFields may jump to portal once workplaceOk — go back to show chips.
    if group_label not in ts and area_label not in ts:
        if any("LOGA3" in t or "Portal" in t for t in ts) or "Überspringen" in ts:
            tap_label("Zurück", must=False) or tap_label("Arbeitgeber", must=False)
            time.sleep(0.6)
            ts = texts()
    if group_label not in texts():
        # Retry employer if still on pack list
        if employer in texts():
            tap_label(employer, must=False)
            time.sleep(0.5)
    if not (
        tap_label(group_label, must=False)
        or (group_label == "Ärzte" and tap_label("Arzt", must=False))
    ):
        # Auto-pick may already be correct (Pflege first) — verify area chip or continue.
        if area_label not in texts() and group_label not in texts():
            raise SystemExit(
                f"FAIL: group {group_label!r} missing. Seen: {texts()[:40]}"
            )
    time.sleep(0.35)
    if area_label and area_label not in ("",):
        if not tap_label(area_label, must=False):
            if area_label not in texts():
                raise SystemExit(
                    f"FAIL: area {area_label!r} missing. Seen: {texts()[:40]}"
                )
    if role_label:
        tap_label(role_label, must=False)
    if "Weiter" in texts():
        tap_label("Weiter")
        time.sleep(0.7)


def dismiss_alerts() -> None:
    for _ in range(3):
        if tap_label("OK", must=False) or tap_label("Ok", must=False):
            time.sleep(0.4)
            continue
        break


def open_app_from_left_of_calendar() -> None:
    swipe(180, 1200, 900, 1200)  # page to the left of calendar
    time.sleep(0.4)
    if not tap_label("ShiftPlan Converter", must=False):
        if not tap_label("ShiftPlan", must=False, partial=True):
            raise SystemExit(f"FAIL: app icon missing. Seen: {texts()[:20]}")
    deadline = time.time() + 35
    while time.time() < deadline:
        dismiss_alerts()
        ts = texts()
        # Expo Dev Client launcher — jump to Metro
        if any("Development Build" in t or "DEVELOPMENT SERVERS" in t for t in ts):
            if not tap_label("http://127.0.0.1:8091", must=False):
                adb(
                    "shell",
                    "am",
                    "start",
                    "-a",
                    "android.intent.action.VIEW",
                    "-d",
                    "shiftplan://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8091",
                    check=False,
                )
            time.sleep(5.0)
            continue
        if any(t in ts for t in ("Einrichtung", "Import", "Kalender", "Einstellungen", "Arbeitgeber")):
            return
        time.sleep(0.6)
    raise SystemExit(f"FAIL: app did not open. Seen: {texts()[:30]}")


def ensure_workplace_step(employer_label: str) -> None:
    ts = texts()
    if employer_label in ts or "Ohne Arbeitgeber" in ts:
        return
    # Prefer step header over spamming Zurück
    if tap_label("Arbeitgeber", must=False):
        time.sleep(0.6)
        ts = texts()
        if employer_label in ts or "Ohne Arbeitgeber" in ts:
            return
    if tap_label("Zurück", must=False):
        time.sleep(0.5)
    ts = texts()
    if employer_label in ts or "Ohne Arbeitgeber" in ts:
        return
    raise SystemExit(f"FAIL: workplace step not reachable. Seen: {texts()[:40]}")


def ui_group_label(group_id: str) -> str:
    """Map pack group id from .env to on-screen chip (no extra env keys)."""
    g = (group_id or "").strip().lower()
    if g in ("pflege",):
        return "Pflege"
    if g in ("arzt", "ärzte", "aerzte", "ärztinnen und ärzte"):
        return "Ärzte"
    if g in ("service",):
        return "Service"
    return group_id


def ui_area_label(group_id: str, area: str, role: str) -> str:
    """Map .env area/role to on-screen Bereich chip."""
    g = (group_id or "").strip().lower()
    role_u = (role or "").strip().upper()
    area_s = (area or "").strip()
    if g == "pflege" and role_u == "ATA":
        return "OP · ATA"
    if g in ("arzt", "ärzte", "aerzte", "ärztinnen und ärzte"):
        return area_s  # e.g. OP / Anästhesist/in via bereich+rolle in UI
    return area_s or role


def demo1(env: dict[str, str]) -> Path:
    out = OUT / "demo1-pflege-loga3.mp4"
    rec = Recorder(out)
    rec.start()
    try:
        employer = require(env, "DEMO_EMPLOYER1")
        group_label = ui_group_label(require(env, "DEMO_GROUP1"))
        area_label = ui_area_label(
            env.get("DEMO_GROUP1", ""),
            env.get("DEMO_AREA1", ""),
            env.get("DEMO_ROLE1", ""),
        )
        role_label = (env.get("DEMO_AREA1") or "").strip()  # preset e.g. Anästhesie
        last = require(env, "DEMO_NAME1")
        first = require(env, "DEMO_SURNAME1")
        url = require(env, "DEMO_LOGA3_BASE_URL") if env.get("DEMO_LOGA3_BASE_URL") else require(env, "LOGA3_BASE_URL")
        user = require(env, "DEMO_LOGA3_USERNAME") if env.get("DEMO_LOGA3_USERNAME") else require(env, "LOGA3_USERNAME")
        pw = require(env, "DEMO_LOGA3_PASSWORD") if env.get("DEMO_LOGA3_PASSWORD") else require(env, "LOGA3_PASSWORD")

        go_calendar_widget_page(hold_s=3.0)
        open_app_from_left_of_calendar()
        time.sleep(0.8)
        dismiss_alerts()

        # Cold start: must be first-time workplace picker (not finished profile)
        ts = texts()
        if any("Einrichtung ok" in t for t in ts):
            raise SystemExit(
                "FAIL: still configured — wipe local data before clean demo"
            )
        if "Ohne Arbeitgeber" not in ts and employer not in ts:
            tap_label("Einstellungen", must=False)
            time.sleep(0.4)
            if not (
                tap_label("Einrichtung öffnen", must=False)
                or tap_label("Einrichtung", must=False)
            ):
                raise SystemExit(f"FAIL: cannot open Einrichtung. Seen: {texts()[:40]}")
            time.sleep(0.8)
            if "Einrichtung öffnen" in texts():
                tap_label("Einrichtung öffnen")
                time.sleep(0.8)
            if any("Einrichtung ok" in t for t in texts()):
                raise SystemExit(
                    "FAIL: still configured after open — wipe before clean demo"
                )

        require_fresh_setup(employer)
        select_workplace_scope(employer, group_label, area_label, role_label)

        shot("demo1-portal.png")
        edits = edit_texts()
        if len(edits) < 3:
            raise SystemExit(f"FAIL: portal fields missing. Seen: {texts()[:30]}")
        url_cur, user_cur, pw_cur = edits[0][0], edits[1][0], edits[2][0]
        pw_empty = (not pw_cur) or pw_cur in {"Passwort", "Password"}
        need_fill = (
            not url_cur.startswith("https://")
            or user_cur != user
            or pw_empty
        )
        if need_fill:
            fill_edit_adb_or_paste(0, url)
            fill_edit_adb_or_paste(1, user)
            fill_edit_adb_or_paste(2, pw, password=True)
        tap_label("LOGA3-Portal", must=False)
        time.sleep(0.35)
        tap_label("Weiter")
        time.sleep(1.2)
        if tap_label("OK", must=False) or tap_label("Ok", must=False):
            shot("demo1-portal-alert.png")
            raise SystemExit(
                f"FAIL: portal Weiter showed alert. Seen: {texts()[:40]}"
            )
        ts = texts()
        if any("LOGA3-Portal" in t for t in ts) and not any(
            "Name auf dem Dienstplan" in t or "Nachname" in t or "Vorname" in t for t in ts
        ):
            raise SystemExit(f"FAIL: still on portal after Weiter. Seen: {ts[:35]}")

        edits = edit_texts()
        if len(edits) >= 2:
            fill_edit(0, last, placeholders={"Nachname", ""})
            fill_edit(1, first, placeholders={"Vorname", ""})
        tap_label("Weiter")
        time.sleep(1.0)
        ts = texts()
        if "LOGA3-Portal" in ts:
            raise SystemExit(f"FAIL: expected calendars step, still portal. Seen: {ts[:35]}")

        shot("demo1-google.png")
        # Calendar chips only from existing .env keys — never invent DEMO_GOOGLE_ACCOUNT.
        cal_name = (env.get("DEMO_NEW_CALENDAR_NAME") or "").strip()
        cal_ext = (env.get("DEMO_EXTERNAL_GOOGLE_CALENDAR_ID") or "").replace('"', "").strip()
        if cal_name:
            tap_label(cal_name, must=False)
        if cal_ext:
            tap_label(cal_ext, must=False, partial=True)

        if not (
            tap_label("Einrichtung abschließen", must=False)
            or tap_label("Fertig ohne Sync", must=False)
        ):
            raise SystemExit(f"FAIL: cannot finish setup. Seen: {texts()[:40]}")

        time.sleep(2.0)
        shot("demo1-after-setup.png")

        if not tap_label("Import", must=False):
            raise SystemExit(f"FAIL: Import tab missing. Seen: {texts()[:40]}")
        time.sleep(0.8)
        tap_label("LOGA3", must=False)
        tap_label("Dienstplan", must=False)
        if not tap_label("Aus LOGA3 abrufen", must=False):
            raise SystemExit(f"FAIL: LOGA3 fetch missing. Seen: {texts()[:40]}")

        deadline = time.time() + 240
        done = False
        while time.time() < deadline:
            dismiss_alerts()
            joined = " | ".join(texts())
            if any(s in joined for s in ("Schichten", "fertig", "Fertig", "Fehler", "Error", "Abrufen fertig")):
                print("FETCH: (status line ok)")
                done = True
                break
            time.sleep(2.0)
        if not done:
            raise SystemExit(f"FAIL: LOGA3 fetch no signal. Seen: {texts()[:40]}")
        dismiss_alerts()
        time.sleep(0.5)
        if "Fehler" in " | ".join(texts()) or "Error" in " | ".join(texts()):
            raise SystemExit(f"FAIL: LOGA3 fetch error. Seen: {texts()[:40]}")

        dismiss_alerts()
        if not tap_label("Mit Google Calendar syncen", must=False):
            # Sync may live on Google card / Export
            tap_label("Export", must=False)
            time.sleep(0.5)
            if not tap_label("Mit Google Calendar syncen", must=False):
                print("WARN: sync button missing")
        time.sleep(8.0)
        dismiss_alerts()
        tap_label("Import", must=False)
        time.sleep(0.4)
        tap_label("Verdienst", must=False)
        time.sleep(0.8)
        # Closed months only (no extra .env keys) — last 2 calendar months before current.
        now = time.localtime()
        last_m = now.tm_mon - 1 if now.tm_mon > 1 else 12
        tap_label(f"{last_m:02d}", must=False)
        time.sleep(0.25)
        if last_m > 1:
            tap_label(f"{last_m - 1:02d}", must=False)
            time.sleep(0.25)
        if tap_label("Verdienstnachweis laden", must=False):
            deadline = time.time() + 180
            while time.time() < deadline:
                dismiss_alerts()
                joined = " | ".join(texts()).lower()
                if "fertig" in joined or "nachweis" in joined or "fehler" in joined or "ok" in joined:
                    break
                time.sleep(2.0)
        dismiss_alerts()

        if not tap_label("Kalender", must=False):
            raise SystemExit(f"FAIL: Kalender tab missing. Seen: {texts()[:30]}")
        time.sleep(2.0)
        shot("demo1-caltab.png")
        if not tap_label("Prüfung", must=False):
            raise SystemExit(f"FAIL: Prüfung tab missing. Seen: {texts()[:30]}")
        time.sleep(2.0)
        shot("demo1-pruefer.png")

        key("KEYCODE_HOME")
        go_calendar_widget_page()
        time.sleep(2.0)
        shot("demo1-widget-end.png")
        time.sleep(1.2)
        key("KEYCODE_BACK")
        time.sleep(1.2)
    finally:
        rec.stop()
    if not out.exists() or out.stat().st_size < 10_000:
        raise SystemExit(f"FAIL: demo1 recording too small: {out}")
    return out


def demo2(env: dict[str, str]) -> Path:
    out = OUT / "demo2-arzt-pdf.mp4"
    rec = Recorder(out)
    rec.start()
    try:
        employer = require(env, "DEMO_EMPLOYER2")
        group_label = ui_group_label(require(env, "DEMO_GROUP2"))
        area_label = ui_area_label(
            env.get("DEMO_GROUP2", ""),
            require(env, "DEMO_AREA2"),
            env.get("DEMO_ROLE2", ""),
        )
        last = require(env, "DEMO_NAME2")
        first = require(env, "DEMO_SURNAME2")
        # PDF on device named from area — no DEMO_PDF2 key
        pdf_needle = f"DP {require(env, 'DEMO_AREA2')}"

        go_calendar_widget_page(hold_s=1.5)
        open_app_from_left_of_calendar()
        time.sleep(0.8)
        dismiss_alerts()

        ts = texts()
        if any("Einrichtung ok" in t for t in ts):
            raise SystemExit(
                "FAIL: still configured — wipe before demo2 (pipeline should have wiped)"
            )
        if "Ohne Arbeitgeber" not in ts and employer not in ts:
            tap_label("Einstellungen", must=False)
            time.sleep(0.4)
            if not (
                tap_label("Einrichtung öffnen", must=False)
                or tap_label("Einrichtung", must=False)
            ):
                raise SystemExit(f"FAIL: cannot open Einrichtung. Seen: {texts()[:40]}")
            time.sleep(0.8)
            if "Einrichtung öffnen" in texts():
                tap_label("Einrichtung öffnen")
                time.sleep(0.8)

        require_fresh_setup(employer)
        select_workplace_scope(employer, group_label, area_label)

        # Skip portal + Google — PDF-only persona
        if not tap_label("Überspringen", must=False):
            if any("LOGA3" in t or "Portal" in t for t in texts()):
                raise SystemExit(f"FAIL: cannot skip portal. Seen: {texts()[:30]}")

        edits = edit_texts()
        if len(edits) >= 2:
            fill_edit(0, last, placeholders={"Nachname", ""})
            fill_edit(1, first, placeholders={"Vorname", ""})
        tap_label("Weiter", must=False) or tap_label("Überspringen", must=False)
        time.sleep(0.5)

        if not (
            tap_label("Fertig ohne Sync", must=False)
            or tap_label("Überspringen", must=False)
            or tap_label("Einrichtung abschließen", must=False)
        ):
            raise SystemExit(f"FAIL: cannot finish demo2 setup. Seen: {texts()[:40]}")

        time.sleep(1.5)
        shot("demo2-after-setup.png")

        if not tap_label("Import", must=False):
            raise SystemExit(f"FAIL: Import tab missing. Seen: {texts()[:30]}")
        time.sleep(0.6)
        tap_label("Datei & Foto", must=False)
        if not tap_label("PDF / CSV / ICS wählen", must=False):
            raise SystemExit(f"FAIL: file picker button missing. Seen: {texts()[:40]}")
        time.sleep(2.0)
        shot("demo2-picker.png")
        import unicodedata

        def norm(s: str) -> str:
            return unicodedata.normalize("NFC", s)

        needle = norm(pdf_needle)
        matched = False
        for t in texts():
            if needle in norm(t) or norm(t).startswith(needle[:8]):
                if tap_label(t, must=False, partial=True):
                    matched = True
                    break
        if not matched:
            for frag in ("September 2026", "September", pdf_needle[:6]):
                if tap_label(frag, must=False, partial=True):
                    matched = True
                    break
        if not matched:
            raise SystemExit(
                f"FAIL: PDF for DEMO_AREA2 not in picker (looked for {pdf_needle!r}). Seen: {texts()[:40]}"
            )
        time.sleep(1.0)
        tap_label("Auswählen", must=False) or tap_label("Öffnen", must=False)

        deadline = time.time() + 90
        while time.time() < deadline:
            ts = texts()
            if any(last in t or first in t for t in ts):
                break
            if any("Fehler" in t or "Error" in t for t in ts):
                raise SystemExit(f"FAIL: import error. Seen: {ts[:40]}")
            time.sleep(1.5)
        shot("demo2-detect.png")
        if not any(last in t or first in t for t in texts()):
            print("WARN: roster name from .env not visible in accessibility texts")

        if not tap_label("Kalender", must=False):
            raise SystemExit(f"FAIL: Kalender tab missing. Seen: {texts()[:30]}")
        time.sleep(0.8)
        tap_label("Monat", must=False)
        time.sleep(2.0)
        shot("demo2-month.png")
        key("KEYCODE_HOME")
        time.sleep(1.0)
    finally:
        rec.stop()
    if not out.exists() or out.stat().st_size < 10_000:
        raise SystemExit(f"FAIL: demo2 recording too small: {out}")
    return out


def main() -> None:
    global SERIAL, ADB, SCRCPY
    write_pid_file()
    try:
        ADB = resolve_adb()
        SCRCPY = resolve_scrcpy()
        if not ADB:
            raise SystemExit("FAIL: adb not found — use project nix-shell")
        SERIAL = pick_serial()
        if SERIAL.startswith("emulator-"):
            raise SystemExit("FAIL: emulator serial — demos run on physical phone only")

        which_demo = sys.argv[1] if len(sys.argv) > 1 else "both"
        env = load_env()

        adb("shell", "input", "keyevent", "KEYCODE_WAKEUP", check=False)
        adb("shell", "wm", "dismiss-keyguard", check=False)
        adb("reverse", "tcp:8091", "tcp:8091", check=False)
        time.sleep(0.4)

        paths: list[Path] = []
        if which_demo in ("1", "demo1", "both"):
            wipe_local_data()
            paths.append(demo1(env))
        if which_demo in ("2", "demo2", "both"):
            wipe_local_data()
            paths.append(demo2(env))

        print("DONE (phone only)")
        for p in paths:
            print(f"  {p} ({p.stat().st_size} bytes)")
    finally:
        clear_pid_file()


if __name__ == "__main__":
    main()
