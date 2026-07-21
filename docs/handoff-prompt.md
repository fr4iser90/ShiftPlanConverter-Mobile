# Singleshot-Prompt — LOGA3 Mobile

Workspace: dieses Repo (`LOGA3-Automation-Mobile`).  
Desktop-Referenz lokal parallel klonen oder: `../LOGA3-Automation` bzw. https://github.com/fr4iser90/LOGA3-Automation

**Alles unten als eine Agent-Session ausführen.** Lies zuerst `PLAN.md` und `docs/architecture.md`, dann implementieren.

---

## PROMPT (kopieren ab hier)

```
Du bist im Repo LOGA3-Automation-Mobile. Arbeite autonom bis Definition of Done.
Lies zuerst: PLAN.md, docs/architecture.md, docs/handoff-prompt.md.

════════════════════════════════════════
PRODUKTZIEL
════════════════════════════════════════
Baue eine Expo (React Native) + TypeScript App für Android UND iOS mit demselben
Funktionsumfang wie die Desktop-App LOGA3-Automation, vollständig AUF DEM GERÄT:

1. LOGA3 Login (Credentials in Secure Store)
2. Monate wählen → Zeitprotokoll-PDFs holen
3. PDF parsen → Preview (Schichten)
4. Export .ics (Share) + Google Calendar Sync

Playwright-Ersatz: In-App WebView (Android System WebView / iOS WKWebView) +
JS-Steuerung von LOGA3 (analog Desktop-Workflow).

Desktop-Referenz (Verhalten + Port-Quellen):
- https://github.com/fr4iser90/LOGA3-Automation
- converter/ (Parse, Mapping, ICS, anonymize, eventDescription)
- converter/krankenhaeuser/st-elisabeth-leipzig/
- src/loga3-workflow.js (Fetch-Verhalten → als WebView-Automation neu)
- gui/ (nur UX-Vorbild, nicht 1:1 HTML kopieren)

Builtin-Scope wie Desktop: St. Elisabeth · Pflege · OP · Anästhesie (isValidated).

════════════════════════════════════════
TECH STACK
════════════════════════════════════════
- Expo + TypeScript + Expo Router
- expo-secure-store, expo-file-system, expo-sharing
- WebView: react-native-webview (Dev Client / prebuild wenn Downloads native brauchen)
- pdf.js / pdfjs-dist für Text-Extraktion
- Jest (oder Expo-Jest) Unit-Tests für Converter
- EAS Build für Android + iOS
- i18n DE/EN

App-Code im **Repo-Root** (Expo Router-Ordner heißt `app/` — kein verschachteltes Expo-Projekt).

════════════════════════════════════════
IMPLEMENTIERUNG (Reihenfolge)
════════════════════════════════════════
Phase 0 — Scaffold
- [ ] Expo App + Expo Router Tabs/Stack: Holen | Preview | Export | Settings
- [ ] package.json scripts: start, android, ios, test, lint, typecheck
- [ ] .env.example für Google Client IDs
- [ ] app.json / eas.json (Android + iOS profiles: development, preview, production)
- [ ] Builtin-Pack aus Desktop kopieren/portieren

Phase A — Kern
- [ ] Login-UI + Secure Store
- [ ] WebView-Fetch: Session, Monate, PDF in App-Speicher speichern
- [ ] Convert-Pipeline portieren (St. Elisabeth Parser + Mapping)
- [ ] Preview-Liste (aktueller Monat/Woche/heute hervorheben wenn machbar)
- [ ] User-Mappings für fehlende Zeiten
- [ ] ICS generieren + Share Sheet
- [ ] Google OAuth (Mobile Clients) + Sync in eigenen Kalender; Primary warnen
- [ ] Support: anonymisierter Rohtext-Ausschnitt mit KO*/GE*

Phase B (wenn Zeit) — Packs ZIP/Katalog, Update-Hinweis, Rich-Details, Dark/Light

════════════════════════════════════════
TESTS (Pflicht)
════════════════════════════════════════
1. Unit-Tests (Jest):
   - Parser gegen fixtures/sample-zeitprotokoll-snippet.txt
   - Mindestens 1 Schicht erkannt (KO*/GE*)
   - ICS-Generator: gültiger VCALENDAR/VEVENT Output
   - Anonymize: Namen/IDs weg, Schichtzeiten bleiben

2. Typecheck: tsc --noEmit (oder expo export typecheck) muss grün sein

3. Smoke auf Emulator/Simulator:
   - Android Emulator: npx expo run:android (oder eas build --profile development + install)
   - iOS Simulator (falls macOS verfügbar): npx expo run:ios
   - Mindestens: App startet, Navigation Holen→Preview→Export funktioniert
   - Convert-Smoke mit Fixture/Sample-Text → Preview zeigt Einträge
   - ICS Share-Sheet öffnet (soweit Emulator erlaubt)
   - WebView kann LOGA3-URL laden (Login mit echten Creds nur wenn User .env liefert;
     sonst Mock/Stub für Automation-Layer + manuelle WebView-Öffnung dokumentieren)

Wenn kein iOS-Host: Android vollständig testen, iOS Build-Config + eas.json trotzdem
fertig machen und in README vermerken „iOS auf Mac/EAS Cloud bauen“.

════════════════════════════════════════
BUILD / EAS
════════════════════════════════════════
- eas.json: development (Dev Client), preview (internal APK/AAB + iOS adhoc/simulator),
  production
- README: exakte Befehle
  - npm install / npx expo install
  - npx expo start
  - npx expo run:android
  - npx expo run:ios
  - eas build --platform android --profile preview
  - eas build --platform ios --profile preview
- App startet ohne committed Secrets

════════════════════════════════════════
DOKUMENTATION
════════════════════════════════════════
- README aktualisieren (Build, Emulator, EAS, Google OAuth Setup)
- PLAN.md Checkboxen abhaken was fertig ist
- CHANGELOG.md mit 0.1.0 oder 1.0.0-alpha anlegen
- Kurze docs/webview-fetch.md: wie Automation den Desktop-Workflow abbildet

════════════════════════════════════════
DEFINITION OF DONE (Singleshot)
════════════════════════════════════════
- [ ] App-Code im Repo-Root committed-ready (`app/` = Expo Router)
- [ ] Unit-Tests grün (npm test)
- [ ] typecheck grün
- [ ] Android Emulator: App startet + Convert-Smoke
- [ ] iOS: run:ios ODER EAS/iOS-Config dokumentiert + buildable
- [ ] eas.json vorhanden; mindestens ein Android preview/dev Build-Befehl verifiziert
  (lokaler run:android zählt; Cloud-EAS optional wenn Token fehlt — dann Config + README)
- [ ] PLAN.md Phase 0+A größtenteils abgehakt
- [ ] Keine Secrets in Git

Am Ende: kurze Zusammenfassung was läuft, welche Befehle du ausgeführt hast,
Testergebnisse, und was der User lokal noch braucht (Google Client IDs, EAS Login,
Apple Developer, echte LOGA3-Creds für Live-Fetch-Test).

Starte JETZT mit Phase 0 Scaffold, dann Tests für Converter, dann UI + WebView.
Committe sinnvolle Zwischenschritte wenn der User commits erlaubt; sonst alles
arbeitsfähig hinterlassen.
```

---

## So nutzen

1. Cursor → Ordner `LOGA3-Automation-Mobile` öffnen  
2. Optional parallel: Desktop-Repo nach `../LOGA3-Automation` klonen  
3. Agent-Modus → Prompt oben einfügen  
4. Agent arbeiten lassen  

## Was du bereithalten solltest

| Ding | Wofür |
|------|--------|
| Android Emulator / Gerät | `expo run:android` |
| Mac + Xcode (oder EAS Cloud) | iOS |
| Expo Account / `eas login` | Cloud Builds |
| Google Cloud OAuth Android/iOS Clients | Google Sync |
| LOGA3-Zugangsdaten | Live-Fetch-Test in WebView |
