# LOGA3 Automation Mobile

Android- & iOS-App — **derselbe Funktionsumfang wie die Desktop-App**, auf dem Gerät.

**Desktop-Referenz:** [LOGA3-Automation](https://github.com/fr4iser90/LOGA3-Automation)

## Features

1. LOGA3 Login (Credentials in Secure Store)  
2. Monate wählen → Zeitprotokoll (WebView)  
3. PDF/Text parsen → Preview  
4. Export `.ics` (Share) + Google Calendar Sync  

Playwright-Ersatz: **In-App WebView** + JS-Steuerung — siehe [docs/webview-fetch.md](./docs/webview-fetch.md).

## Voraussetzungen

- Node.js 20+ / npm  
- Für Gerät/Emulator: Android Studio (SDK + Emulator) bzw. **macOS + Xcode** für lokalen iOS-Build  
- Optional: Expo-Account (`eas login`) für Cloud-Builds  
- Optional: Google OAuth Mobile Client IDs  
- Optional: echte LOGA3-Zugangsdaten für Live-Fetch  

**iOS:** Auf Linux lokal nicht baubar — Config (`app.json` / `eas.json`) ist vorbereitet. Build auf Mac oder per EAS Cloud:

```bash
eas build --platform ios --profile preview
```

## Installation

```bash
npm install
cp .env.example .env   # optional: Google Client IDs / LOGA3 URL
```

## Nix-Shell (Android Emulator inklusive)

Voraussetzung: Nix, KVM (`/dev/kvm`) für brauchbare Emulator-Performance.  
Erster Einstieg lädt **~2.5 GiB** SDK + Emulator + System-Image (Nix-Cache).

```bash
nix-shell                 # oder: NIXPKGS_ALLOW_UNFREE=1 nix-shell
loga3-help                # Übersicht
loga3-emu                 # Emulator starten (Hintergrund)
loga3-android             # npm install + expo run:android
```

Smoke offline: Holen → **Offline-Fixture (Debug)** → Preview → Export → ICS.  
Live: Creds + `EXPO_PUBLIC_LOGA3_URL` in `.env` (Tenant-URL) → Monate → **Ausgewählte laden** (siehe [docs/webview-fetch.md](./docs/webview-fetch.md)).

Details: [`shell.nix`](./shell.nix)

## Entwicklung

```bash
npx expo start          # Metro + QR / Dev Tools
npm run android         # = npx expo run:android
npm run ios             # = npx expo run:ios (nur macOS)
npm test                # Jest Converter-Tests
npm run typecheck       # tsc --noEmit
```

### Smoke ohne Emulator

1. `npm test` und `npm run typecheck`  
2. `npx expo start`  
3. Holen-Tab → **Offline-Fixture (Debug)** → Preview → Export → ICS teilen  
4. Live-Fetch nur mit echten Creds + Tenant-URL (**Ausgewählte laden**)

Für volles WebView + Secure Store: Development Build (`eas build --profile development` oder `expo run:android`).

## EAS Build

```bash
npm install -g eas-cli   # einmalig
eas login
eas build:configure      # projectId setzen falls noch nicht

eas build --platform android --profile development
eas build --platform android --profile preview
eas build --platform ios --profile preview
eas build --platform android --profile production
```

Profile: siehe `eas.json` (`development` Dev Client, `preview` internal APK/Simulator, `production` AAB).

## Google OAuth

1. Google Cloud Console → OAuth Clients (Android + iOS, ggf. Web)  
2. `.env` im Repo-Root (nicht committen):

```bash
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=….apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=….apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=….apps.googleusercontent.com
```

3. Redirect-Scheme: `loga3mobile://` (in `app.json`)  
4. Sync: eigenen Kalender wählen; Primary wird gewarnt  

## Projektstruktur

```
app/                 # Expo Router Screens (Holen, Preview, Export, Settings)
src/                 # Converter, LOGA3-WebView, Sync, i18n, Packs
assets/ components/  # UI-Assets
fixtures/            # Parser-Fixtures
docs/                # Architektur & Handoff
```

## Dokumente

| Datei | Inhalt |
|--------|--------|
| [PLAN.md](./PLAN.md) | Phasen / DoD |
| [docs/architecture.md](./docs/architecture.md) | Architektur |
| [docs/webview-fetch.md](./docs/webview-fetch.md) | WebView vs Desktop |
| [CHANGELOG.md](./CHANGELOG.md) | Versionen |

## Lizenz

Siehe [LICENSE](./LICENSE).
