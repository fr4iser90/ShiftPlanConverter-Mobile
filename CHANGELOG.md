# Changelog

## 0.1.4 — 2026-07-24

### Added
- Nutzerhandbuch / user guide + [docs/releases.md](./docs/releases.md) (GitHub-APK, Changelog-Pflicht)
- Settings: GitHub **Update-Check** (`releases/latest`) + Changelog-Links
- Settings: **Sync-Erinnerung** (Intervall, Stunde, Notification, Prompt beim Öffnen, Widget-Badge)
- [docs/schedule-and-updates.md](./docs/schedule-and-updates.md) — Grenzen Hintergrund-Holen
- System light/dark theme for product UI; status bar follows canvas
- Calendar: week / month / list chips; AZK monatsübersicht collapsible below
- Android widgets: polished next-shift + **Diese Woche**; widget theme in Settings
- Security audit checklist + scanner finding policy (`.scanning/`)

### Changed
- Holen reliability (layout fix, waits); auto-navigate to Kalender after successful fetch
- README features table (WebView / creds / ICS vs Google explained)

## 0.1.2 — 2026-07-23

### Added
- Export targets module (`src/sync/targets`) — Google (oauth) + ICS (file); one-tap runs enabled oauth targets
- In-app calendar views: week / month / list (pack colors, persisted mode)
- Android home-screen widget **LOGA3 nächste Schicht** (`react-native-android-widget`)
- After one-tap fetch: optional ICS share when no oauth sync ran

### Changed
- One-tap button labels: „Dienstplan holen“ vs „Holen + Google“ depending on configured target
- Settings: toggle „ICS anbieten, wenn kein Sync“

## 0.1.1 — 2026-07-22

### Fixed
- Live-Fetch Emulator-Smoke: Juli 2026 → PDF + 14 Schichten (historisch mit `wm size` — inzwischen verboten; natural AVD = Phone)
- Android PDF-Capture: Viewer-Scrape + nur `%PDF`-Blobs; Hermes-taugliche Text-Extraktion (`fflate` / Tj) statt pdfjs-Worker

### Changed
- PLAN / `docs/webview-fetch.md`: Live-Fetch DoD erfüllt
- README: kein `wm size`-Cheat; Emulator = natürliche Phone-Größe
- Multi-Month-Smoke 06+07/2026 → 28 Schichten / 2 PDFs
- Google Sync wie Desktop: Builtin-Client-ID (keine `EXPO_PUBLIC_GOOGLE_*`), Wipe im Datumsbereich; optional `GOOGLE_CLIENT_ID` in `.env`
- Kalender-Tab näher an Desktop: Tabelle Datum/Code/Start/Ende, Blau-Highlight heute/Woche/Monat, AZK-Monatsübersicht, Auto-Scroll zum Fokus
- Früher gehen: Ist-Zeiten mit gleichem Start → bekannter Dienstcode (nicht mehr „fehlende Zeiten“); Mapping-UI nur für wirklich unbekannte Starts
- Sicherheit: Login nur Secure Store; Tenant-URL nur Settings/AsyncStorage — nichts davon im APK-Build; Arbeitgeber per Pack-Auswahl (Setup)
- Fetch-Automation: `waitForCondition` statt Sleep/Retry-Orgie — precondition → eine Aktion → postcondition; max. ein Recovery
- Eigenes **Setup-Modal**: URL → Login → Pack; Holen nur Monate/Fetch wenn Setup komplett
- Shell-Ready-Gate: wartet auf Ende LOGA3-Splash bevor Zeiten geklickt wird (`assertShellReady`)

## 0.1.0 — 2026-07-21

### Added
- Expo (React Native) + TypeScript App im Repo-Root mit Expo Router Tabs: Holen, Preview, Export, Settings
- Converter-Port (St. Elisabeth Parser, Mapping Anästhesie, ICS, Anonymize)
- Builtin-Pack: St. Elisabeth · Pflege · OP · Anästhesie (`isValidated`)
- LOGA3 Login → Secure Store; In-App WebView + Automation-Stub
- Preview mit Hervorhebung heute/Woche/Monat; User-Mappings für fehlende Zeiten
- ICS Share Sheet; Google OAuth/Sync (Client IDs über Env)
- Support: anonymisierter Rohtext-Ausschnitt mit KO*/GE*
- i18n DE/EN
- Jest Unit-Tests, `tsc --noEmit`, `eas.json` (development / preview / production)

### Changed
- Expo-Projekt ins Repo-Root gelegt (`app/` nur noch Expo Router, keine doppelte Projekt-/LICENSE-Struktur)
- Holen: Live-Pfad „Ausgewählte laden“ (`fetchJob` + echtes `selectMonth` + PDF-Capture); Fixture klar als Offline-Debug
- Desktop Pre-Download-Gates: Content-Gate, Dialog-Monat, PDF-Abrechnungsmonat-Validate; LOGA3-URL in Settings

### Added (Dev)
- `shell.nix`: Node 22 + JDK 17 + Android SDK/Emulator; Hilfen `loga3-emu` / `loga3-android` / `loga3-help`
- `src/loga3/fetchJob.ts`, `bridge.ts`, `pdfStore.ts`, `contentGate.ts`; Docs `webview-fetch.md` aktualisiert
