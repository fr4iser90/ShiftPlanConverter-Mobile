# Changelog

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

### Added (Dev)
- `shell.nix`: Node 22 + JDK 17 + Android SDK/Emulator; Hilfen `loga3-emu` / `loga3-android` / `loga3-help`
- `src/loga3/fetchJob.ts`, `bridge.ts`, `pdfStore.ts`; Docs `webview-fetch.md` aktualisiert
