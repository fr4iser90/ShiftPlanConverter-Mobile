# Scripts

Die App braucht keins davon. Nur Dev/E2E.

## `scripts/dev/` (max. diese)

| Script | Was |
|--------|-----|
| `start-emu.sh` | Emulator + Metro + App (`npm run start:emu`) |
| `stop-metro.sh` | Metro stoppen (`npm stop`) |
| `loga3-emu-stable.sh` | Stabile AVD `pixel_6_phone` (1080×2400) — **kein** nixpkgs-Temp-AVD |
| `restart-emu-for-matrix.sh` | Emulator hart neu + APK falls fehlt |
| `run-android-emu.sh` | `expo run:android` |
| `google-sha1.sh` | Debug-SHA-1 für Google OAuth |
| `start-metro-and-open.sh` | Metro + Deep-Link |
| `launch-and-dump-ui.sh` | UI-Dump |

Keine weiteren One-off-Scripts anlegen. Repair = `restart-emu-for-matrix.sh`.

## `tests/e2e/`

Siehe [`tests/e2e/README.md`](../tests/e2e/README.md). Matrix: `bash tests/e2e/run-matrix.sh`.
