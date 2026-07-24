# PLAN — LOGA3 Mobile (Android + iOS)

Stand: 2026-07-21  
Desktop-Referenz: https://github.com/fr4iser90/LOGA3-Automation (v1.1.0+)

## 1. Ziel

Mobile App (Android **und** iOS) mit **demselben Funktionsumfang wie die Desktop-App**, vollständig **auf dem Gerät**:

1. In LOGA3 einloggen  
2. Monate wählen → Zeitprotokoll-PDFs holen  
3. Schichten parsen → Preview  
4. Export `.ics` / Google Calendar  

Playwright-Ersatz: **eingebettete Browser-Engine (WebView) + JS-Steuerung von LOGA3**.

## 2. Stack

| Entscheidung | Wahl |
|--------------|------|
| Framework | **Expo (React Native) + TypeScript** (native Module ok, wo WebView/Downloads es brauchen) |
| Navigation | Expo Router |
| LOGA3-Fetch | **In-App WebView** (Android System WebView / WKWebView); Automation analog Desktop-Workflow |
| PDF-Text | FlateDecode/`Tj` via `fflate` (Hermes); Fixture/Converter wie Desktop |
| Storage | `expo-secure-store` (Login/Tokens), App-Storage (Prefs, Packs, PDFs) |
| Kalender | `.ics` Share + Google Calendar REST (Mobile OAuth) |
| i18n | DE/EN analog Desktop |

## 3. Phasen

### Phase 0 — Scaffold
- [x] Expo TypeScript + Expo Router im **Repo-Root** (`app/` = nur Router-Screens)
- [x] Screens analog Desktop: **Holen** → **Kalender/Preview** → **Export** + Settings
- [x] Secure Store für LOGA3-Zugangsdaten
- [x] Builtin-Pack: St. Elisabeth · Pflege · OP · Anästhesie

### Phase A — Kern (wie Desktop)
- [x] Login-UI → Session in WebView
- [ ] Monate wählen → PDFs laden (Live) — re-validate without `wm size` cheat (natural AVD = phone); old 2026-07-22 smoke used artificial 1280 viewport
- [x] Convert-Pipeline (Parser St. Elisabeth) → Preview *(Fixture + Live)*
- [x] Mapping freigeschaltet / validiert; User-Mappings speicherbar
- [x] Export `.ics` (Share Sheet)
- [x] Google Calendar (eigener Kalender empfohlen, Primary warnen)
- [x] Support: anonymisierter Rohtext-Ausschnitt (`KO*`/`GE*`)

**Done wenn:** Emulator: Login → Monate laden → Preview → ICS.  
*(Live-Fetch Emulator-Smoke grün 2026-07-22; Tiny-AVD 320×640 ungeeignet — siehe `docs/webview-fetch.md`.)*

### Phase B — Komfort
- [ ] Packs: ZIP / GitHub-Katalog
- [ ] Update-Hinweis (Store/Release), Download nur mit Zustimmung
- [ ] Rich-Details, optionale Monatsübersicht
- [x] Dark/Light nach System
- [ ] Optional: manueller PDF-Import als Zusatz
- [x] LOGA3-URL in Settings (Override für `.env`)

### Phase C — Härten Fetch-Automation
- [x] Content-Gate / Dialog-Monat / PDF-Period-Validate (Desktop-Port)
- [ ] Robustheit gegen LOGA3-UI-Änderungen (Retries weiter härten)
- [x] Klare Fehlerzustände (Login, NO_PLAN, Content-Gate, PDF mismatch)
- [x] PDF-Capture Android/iOS stabil genug für Live-Smoke (Blob/XHR + Viewer-Scrape + `%PDF`-Gate; DownloadManager-Poll Fallback)
- [ ] ggf. Hintergrund-WebView wo OS es erlaubt

## 4. Shared Code mit Desktop

### Portieren
- `converter/` (Parse, Mapping, ICS, Anonymize, Event-Description)
- UX-Flow / Job-Ideen aus `loga3-workflow.js` → als WebView-Automation
- Pack-ZIP-Format

### Desktop-only (bleibt im Desktop-Repo)
- Playwright / Chromium-Bundle, `loga3-gui-server.js`, `scripts/build-desktop.js`

## 5. UX-Flow (wie Desktop)

1. **Setup** — Tenant-URL, Login, Arbeitgeber/Pack (einmalig)  
2. **Holen** — Monate, Download  
3. **Preview / Kalender** — Schichten  
4. **Export** — ICS / Google Sync  

Settings: Sprache, Rich-Details, Google, Packs, Support.

## 6. Sicherheit / Datenschutz

- Zugangsdaten lokal (Secure Store)  
- Support nur mit Anonymisierung  
- Google OAuth: Mobile Client IDs / Redirects  
- Updates nur mit Zustimmung  

## 7. Releases

| Artefakt | Tool |
|----------|------|
| Android APK/AAB | EAS Build (ggf. Dev Client / Prebuild wegen WebView-Downloads) |
| iOS | EAS + Apple Developer Account |
| Version | SemVer, CHANGELOG.md |

## 8. Reihenfolge

1. Scaffold + Holen/Kalender-Screens  
2. WebView-Login + Monats-Download speichern  
3. Converter-Port + Preview  
4. ICS + Google  
5. Automation härten (Phase C) + Packs (Phase B)  

## 9. Definition of Done

- [x] App läuft Android + iOS Simulator/Gerät *(Code + EAS/iOS-Config; lokaler Android-Lauf abhängig von SDK)*  
- [ ] LOGA3-Fetch am Gerät (WebView) wie Desktop-Workflow — **verdrahtet, Live-Smoke offen** (siehe `docs/webview-fetch.md`)  
- [x] St. Elisabeth Anästhesie korrekt geparst  
- [x] ICS + Google Sync  
- [x] README Build-Anleitung  
- [ ] PLAN.md Phase A Live-Fetch abgehakt *(erst nach Creds-Smoke)*  

