# PLAN — LOGA3 Mobile (Android + iOS)

Stand: 2026-07-21  
Desktop-Referenz: https://github.com/fr4iser90/LOGA3-Automation (v1.1.0+)

## 1. Ziel

Mobile App (Android **und** iOS), mit der Nutzer Dienstplan-PDFs (LOGA3 Zeitprotokoll) in Kalender-Events überführen können.

**MVP = Phase A.** Voller LOGA3-Browser-Fetch am Gerät ist **kein** MVP.

## 2. Stack

| Entscheidung | Wahl |
|--------------|------|
| Framework | **Expo (React Native) + TypeScript** |
| Navigation | Expo Router |
| PDF-Text | `pdfjs-dist` oder `react-native-pdf` + Text-Extraktion (wie Desktop `pdf.js`) |
| Storage | `expo-secure-store` (Tokens), AsyncStorage/MMKV (Prefs, Packs) |
| Kalender | `.ics` Share + Google Calendar REST (Mobile OAuth) |
| i18n | DE/EN analog Desktop |

**Nicht** Flutter (außer explizit umentschieden) — Converter ist JS.

## 3. Phasen

### Phase 0 — Scaffold (1 Sitzung)
- [ ] `app/` mit Expo TypeScript Template
- [ ] Expo Router: Screens `import` → `preview` → `export`
- [ ] CI-Skizze: EAS Build Android (intern), iOS später
- [ ] Builtin-Pack: St. Elisabeth · Pflege · OP · Anästhesie (aus Desktop `converter/krankenhaeuser/…` kopieren/portieren)

### Phase A — MVP (Kern)
- [ ] PDF wählen / Share-Intent empfangen
- [ ] Text extrahieren → Parser (St. Elisabeth) → Einträge
- [ ] Preview-Liste (aktueller Monat/Woche hervorheben)
- [ ] Mapping nur freigeschaltet: Anästhesie; fehlende Zeiten → User-Mapping speichern
- [ ] Export `.ics` (Share Sheet)
- [ ] Google Calendar verbinden + Sync in **eigenen** Kalender (Primary warnen)
- [ ] Support-Anfrage: anonymisierter Rohtext-Ausschnitt mit echten `KO*`/`GE*`-Zeiten (mailto / Share Text)

**Done wenn:** Auf Android-Emulator + iOS-Simulator: PDF → Preview → ICS funktioniert; Google-Sync zumindest auf einem Gerät getestet.

### Phase B — Komfort
- [ ] Packs: ZIP import / GitHub-Katalog (`packs/manifest.json` vom Desktop-Repo)
- [ ] Update-Hinweis (GitHub Releases / Store), Download nur mit Zustimmung
- [ ] Rich-Details Toggle, Monatsübersicht (AZK) optional
- [ ] Dark/Light nach System

### Phase C — „Voller“ Fetch (optional, später)
**Bevorzugt:** App steuert Desktop/Backend (`LOGA3-Automation` GUI-API oder dedizierte Headless-API) über LAN/VPN/Tailscale.  
**Nicht** Playwright in der APK einbetten, außer als separates Forschungsprojekt.

- [ ] Pairing: Gerät ↔ Desktop-Server (URL + Token)
- [ ] Job starten: Monate laden
- [ ] PDFs zurück → lokale Convert-Pipeline

## 4. Shared Code mit Desktop

### Wiederverwenden / portieren
Aus `LOGA3-Automation/converter/`:
- `convert.js`, `anonymize.js`, `eventDescription.js`, `icsGenerator.js` (Browser-APIs anpassen)
- `krankenhaeuser/st-elisabeth-leipzig/` (config + parser + mapping Anästhesie)
- Pack-ZIP-Format (`config.json` + `mappings/` + optional `parser.js`)

### Nicht übernehmen
- `playwright`, `loga3-workflow.js`, `loga3-gui-server.js`, `scripts/build-desktop.js`
- Desktop-HTML/CSS 1:1

### Langfristig
Optional npm-Package `@fr4iser/loga3-convert` aus Desktop extrahieren; Mobile + Desktop + Website konsumieren es. **Nicht** Blocker für Phase A — erst kopieren/portieren ist ok.

## 5. UX-Flow (analog Desktop)

1. **Import** — PDF(s)  
2. **Arbeitgeber / Bereich** — nur freigeschaltete Optionen  
3. **Preview** — Schichten, Missing Codes editierbar  
4. **Export** — ICS / Google Sync  

Settings: Sprache, Rich-Details, Google, Packs, Support.

## 6. Sicherheit / Datenschutz

- Keine Roh-PDFs an Support ohne Anonymisierung  
- Google OAuth: Redirect-URIs für Mobile Client  
- Credentials für Phase C nur lokal / Secure Store  
- Kein stilles Auto-Update  

## 7. Nicht-Ziele

- Kein eingebettetes Chromium/Playwright im MVP  
- Kein reines Desktop-Repo-Clone  
- Keine freigeschalteten Stationen ohne validierte Mappings  
- Kein Windows/Linux-Desktop in diesem Repo  

## 8. Releases

| Artefakt | Tool |
|----------|------|
| Android APK/AAB | EAS Build |
| iOS | EAS + Apple Developer Account |
| Version | SemVer, CHANGELOG.md |

Desktop-Releases bleiben in `LOGA3-Automation`. Mobile-Releases hier.

## 9. Reihenfolge für Implementierer

1. Phase 0 Scaffold  
2. Port Parser + Mapping Anästhesie + eine Fixture-PDF (aus Desktop `downloads/` Testfile, anonymisiert)  
3. Preview Screen  
4. ICS  
5. Google  
6. Polish Phase B  

## 10. Definition of Done (Gesamt-MVP)

- [ ] Expo-App läuft Android + iOS Simulator  
- [ ] St. Elisabeth Anästhesie-PDF wird korrekt geparst (Smoke mit Fixture)  
- [ ] ICS Share funktioniert  
- [ ] Google Sync dokumentiert (Client-IDs, Redirects)  
- [ ] README mit Build-Anleitung  
- [ ] PLAN.md abgehakt bis Phase A  
