# LOGA3 Automation Mobile

Android & iOS app — **the same feature set as the desktop app**, running on-device.

**Desktop reference:** [LOGA3-Automation](https://github.com/fr4iser90/LOGA3-Automation)

## Features

1. LOGA3 login (credentials in Secure Store)
2. One-tap **Update** (month window → fetch → optional Google sync / ICS offer)
3. Parse PDF/text → **week / month / list** calendar preview
4. Export `.ics` (share sheet) + Google Calendar sync (pluggable export targets)
5. Android home-screen widget: next shift

Playwright replacement: **in-app WebView** + injected JS — see [docs/webview-fetch.md](./docs/webview-fetch.md).

## Requirements

- Node.js 20+ / npm
- Device/emulator: Android Studio (SDK + emulator), or **macOS + Xcode** for local iOS builds
- Optional: Expo account (`eas login`) for cloud builds
- Optional: Google OAuth client IDs
- Optional: real LOGA3 credentials for live fetch

**iOS:** Not buildable locally on Linux — config (`app.json` / `eas.json`) is ready. Build on a Mac or via EAS:

```bash
eas build --platform ios --profile preview
```

## Install

```bash
npm install
cp .env.example .env   # optional: Google client IDs / notes
```

## Nix shell (Android emulator included)

Requires: Nix, KVM (`/dev/kvm`) for usable emulator performance.  
First enter downloads **~2.5 GiB** SDK + emulator + system image (Nix cache).

```bash
nix-shell                 # or: NIXPKGS_ALLOW_UNFREE=1 nix-shell
loga3-help                # overview
loga3-emu                 # start emulator (background)
loga3-android             # npm install + expo run:android
```

Offline smoke: Fetch tab → **Offline fixture (debug)** → Preview → Export → ICS.  
Live: After install, run **Setup** (tenant URL, login, employer pack), then months → **Fetch selected**. See [docs/webview-fetch.md](./docs/webview-fetch.md).

**Resolution matrix (Phone + Tablet):** validate Holen on every common size before release:

```bash
npm run smoke:matrix
# subset:  python3 tests/e2e/live-smoke-matrix.py --profiles common,tablet,tablet_10
```

Profiles: `tests/e2e/resolution-matrix.json` (720×1280 … 1440×3200 + Tablets).  
Report: `/tmp/loga3-shots/matrix/REPORT.md`.  
**Forbidden:** only forcing `wm size 1280x800` so GWT “passes”. Matrix sets each profile’s real size on purpose; WebView CSS `width=1280`+scale stays in-app.

Dev vs smoke scripts: [`scripts/README.md`](./scripts/README.md), [`tests/e2e/README.md`](./tests/e2e/README.md).

Details: [`shell.nix`](./shell.nix)

## Development

```bash
npm start               # Metro only :8091
npm run start:emu       # emulator (if needed) + Metro + open app
npm stop                # stop Metro/Expo
npm run android         # npx expo run:android
npm run ios             # npx expo run:ios (macOS only)
npm test                # Jest converter tests
npm run typecheck       # tsc --noEmit
```

`start:emu` needs `adb` (preferably inside `nix-shell`). If an emulator is already running → Metro + deep link only.

### Smoke without an emulator

1. `npm test` and `npm run typecheck`
2. `npx expo start`
3. Fetch tab → **Offline fixture (debug)** → Preview → Export → share ICS
4. Live fetch only with real credentials + tenant URL (**Fetch selected**) — same natural screen size as a phone

For full WebView + Secure Store: a development build (`eas build --profile development` or `expo run:android`).

## EAS Build

```bash
npm install -g eas-cli   # once
eas login
eas build:configure      # set projectId if needed

eas build --platform android --profile development
eas build --platform android --profile preview
eas build --platform ios --profile preview
eas build --platform android --profile production
```

Profiles: see `eas.json` (`development` Dev Client, `preview` internal APK/simulator, `production` AAB).

## Google OAuth

**Android:** Native Google Sign-In (Play Services). Custom-scheme redirects (`loga3mobile://`) on a **Web** OAuth client are **rejected** by Google Cloud Console.

Guide: [docs/google-oauth-android.md](docs/google-oauth-android.md)

Short version:

1. GCP: create an **Android** OAuth client — package `com.fr4iser.loga3mobile`, SHA-1 via `./scripts/dev/google-sha1.sh`
2. Keep the existing **Web** client (built-in desktop ID)
3. Enable Calendar API · add test users
4. Rebuild the APK (native module)

Optional `.env`:

```bash
GOOGLE_CLIENT_ID=….apps.googleusercontent.com   # Web client override
GOOGLE_IOS_CLIENT_ID=….apps.googleusercontent.com
```

Sync matches desktop: wipe the date range, then rewrite. Prefer a dedicated calendar; primary is warned.

## Project layout

```
app/                 # Expo Router screens (Fetch, Preview, Export, Settings)
src/                 # Converter, LOGA3 WebView, sync, i18n, packs
assets/ components/  # UI assets
fixtures/            # Parser fixtures
docs/                # Architecture & handoff
```

## Documents

| File | Content |
|------|---------|
| [PLAN.md](./PLAN.md) | Phases / definition of done |
| [docs/architecture.md](./docs/architecture.md) | Architecture |
| [docs/webview-fetch.md](./docs/webview-fetch.md) | WebView vs desktop |
| [docs/google-oauth-android.md](./docs/google-oauth-android.md) | Android Google Sign-In |
| [CHANGELOG.md](./CHANGELOG.md) | Versions |

## License

See [LICENSE](./LICENSE).
