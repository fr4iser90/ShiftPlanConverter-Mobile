# E2E / Live-Smoke (Emulator + LOGA3)

Nicht Teil der App. Braucht: Emulator (`pixel_6_phone` 1080×2400), Metro (`:8091`), `.env` mit LOGA3-Zugang.

## Screenshots — ein Ort

| Pfad | Inhalt |
|------|--------|
| **`/tmp/loga3-shots/matrix/<profil>/`** | Matrix-Lauf (kanonisch) |
| `/tmp/loga3-shots/matrix/REPORT.md` | PASS/FAIL-Tabelle |
| `/tmp/loga3-shots/gate-debug/` | Gate-Debug |
| `/tmp/loga3-shots/live-smoke/` | Einzel-Smoke |
| `/tmp/loga3-shots/calendar/` | Kalender-Shots |
| `/tmp/loga3-shots/year-2026/` | Jahres-Smoke |

**Legacy / falsch (nicht nutzen, löschen ok):** `.screenshots/`, `tmp/shots-calendar/`, lose PNGs direkt unter `/tmp/loga3-shots/*.png` von alten Hand-Tests.

## Commands

```bash
# Emulator hart neu (stabile AVD 1080×2400 — NICHT run-test-emulator)
bash scripts/dev/restart-emu-for-matrix.sh

# Nur Moto G73 zuerst
nix-shell --run 'python3 -u tests/e2e/live-smoke-matrix.py --profiles moto_g73 --months 07 --year 2026 --ticks 80'

# Alle Profile (Metro + Matrix)
bash tests/e2e/run-matrix.sh
# oder:
npm run smoke:matrix
```

| Script | Was |
|--------|-----|
| `live-smoke-matrix.py` | Sequentiell Auflösungen in `resolution-matrix.json` |
| `run-matrix.sh` | Metro + Emulator-Check + Matrix |
| `run-gate-debug.sh` | Ein Profil + DOM/Screenshot pro Gate |
| `live-smoke-fetch.py` | Einzelner Live-Fetch-Smoke |
| `live-smoke-year-2026.py` | Jahres-Smoke |
| `shot-calendar*.py` | Screenshots Kalender-Tab |

**Ziel:** PDF-Holen (eigener Dienstplan) auf **jeder** Matrix-Größe. Exakte `wm size` Pflicht. Nur Eigenkalender-Pfad — siehe `docs/fetch-steps.md`.

**AVD:** `pixel_6_phone` unter `$HOME/.loga3-android/project-android-nix`. Nie `run-test-emulator` (Temp-AVD → 320×640).

**Unit-Tests:** `tests/unit/` via `npm test` (nicht `__tests__/`).
