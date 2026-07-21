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
| PDF-Text | `pdfjs-dist` o.ä. (wie Desktop) |
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
- [ ] Monate wählen → PDFs in App-Speicher laden (Live) — **Pipeline verdrahtet** (`fetchJob` + PDF-Capture); DoD erst nach Emulator-Smoke mit echten Creds
- [x] Convert-Pipeline (Parser St. Elisabeth) → Preview *(Fixture + Live-Pfad nach PDF)*
- [x] Mapping freigeschaltet / validiert; User-Mappings speicherbar
- [x] Export `.ics` (Share Sheet)
- [x] Google Calendar (eigener Kalender empfohlen, Primary warnen)
- [x] Support: anonymisierter Rohtext-Ausschnitt (`KO*`/`GE*`)

**Done wenn:** Emulator/Simulator: Login → Monate laden → Preview → ICS.  
*(Convert/ICS fertig. Live-Fetch: UI + Orchestrator + selectMonth portiert — noch nicht als „fertig“ markiert bis Creds-Smoke grün.)*

### Phase B — Komfort
- [ ] Packs: ZIP / GitHub-Katalog
- [ ] Update-Hinweis (Store/Release), Download nur mit Zustimmung
- [ ] Rich-Details, optionale Monatsübersicht
- [x] Dark/Light nach System
- [ ] Optional: manueller PDF-Import als Zusatz

### Phase C — Härten Fetch-Automation
- [ ] Robustheit gegen LOGA3-UI-Änderungen (Selektoren, Retries)
- [x] Klare Fehlerzustände (Login, Timeout, Download, NO_PLAN) — Status + Alert; weiter härten
- [ ] ggf. Hintergrund-WebView wo OS es erlaubt

## 4. Shared Code mit Desktop

### Portieren
- `converter/` (Parse, Mapping, ICS, Anonymize, Event-Description)
- UX-Flow / Job-Ideen aus `loga3-workflow.js` → als WebView-Automation
- Pack-ZIP-Format

### Desktop-only (bleibt im Desktop-Repo)
- Playwright / Chromium-Bundle, `loga3-gui-server.js`, `scripts/build-desktop.js`

## 5. UX-Flow (wie Desktop)

1. **Holen** — Login, Monate, Download  
2. **Arbeitgeber / Bereich** — freigeschaltete Optionen  
3. **Preview** — Schichten, Missing Codes  
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

