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
- [ ] `app/` Expo TypeScript + Expo Router
- [ ] Screens analog Desktop: **Holen** → **Kalender/Preview** → **Export** + Settings
- [ ] Secure Store für LOGA3-Zugangsdaten
- [ ] Builtin-Pack: St. Elisabeth · Pflege · OP · Anästhesie

### Phase A — Kern (wie Desktop)
- [ ] Login-UI → Session in WebView
- [ ] Monate wählen → PDFs in App-Speicher laden (Download/Blob aus WebView)
- [ ] Convert-Pipeline (Parser St. Elisabeth) → Preview
- [ ] Mapping freigeschaltet / validiert; User-Mappings speicherbar
- [ ] Export `.ics` (Share Sheet)
- [ ] Google Calendar (eigener Kalender empfohlen, Primary warnen)
- [ ] Support: anonymisierter Rohtext-Ausschnitt (`KO*`/`GE*`)

**Done wenn:** Emulator/Simulator: Login → Monate laden → Preview → ICS.

### Phase B — Komfort
- [ ] Packs: ZIP / GitHub-Katalog
- [ ] Update-Hinweis (Store/Release), Download nur mit Zustimmung
- [ ] Rich-Details, optionale Monatsübersicht
- [ ] Dark/Light nach System
- [ ] Optional: manueller PDF-Import als Zusatz

### Phase C — Härten Fetch-Automation
- [ ] Robustheit gegen LOGA3-UI-Änderungen (Selektoren, Retries)
- [ ] Klare Fehlerzustände (Login, Timeout, Download fehlgeschlagen)
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

- [ ] App läuft Android + iOS Simulator/Gerät  
- [ ] LOGA3-Fetch am Gerät (WebView) wie Desktop-Workflow  
- [ ] St. Elisabeth Anästhesie korrekt geparst  
- [ ] ICS + Google Sync  
- [ ] README Build-Anleitung  
- [ ] PLAN.md Phase A abgehakt  
