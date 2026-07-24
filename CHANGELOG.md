# Änderungsprotokoll

Deutsch. Englische Fassung: [CHANGELOG.en.md](./CHANGELOG.en.md)

Format angelehnt an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/).

## 0.1.4 — 2026-07-24

### Hinzugefügt
- Nutzerhandbuch und [docs/releases.md](./docs/releases.md) (GitHub-APK, Changelog-Pflicht vor Release)
- Einstellungen: GitHub-Update-Prüfung (`releases/latest`) und Changelog-Links
- Einstellungen: Sync-Erinnerung (Intervall, Stunde, Benachrichtigung, Nachfrage beim Öffnen, Widget-Hinweis)
- [docs/schedule-and-updates.md](./docs/schedule-and-updates.md) — Grenzen von Hintergrund-Holen
- System-Hell-/Dunkelmodus für die Produkt-UI; Statusleiste folgt dem Hintergrund
- Kalender: Umschalter Woche / Monat / Liste; AZK-Monatsübersicht darunter einklappbar
- Android-Widgets: „Nächste Schicht“ und „Diese Woche“; Theme in den Einstellungen
- Sicherheits-Audit-Checkliste und Scanner-Finding-Policy (`.scanning/`)

### Geändert
- Holen zuverlässiger (Layout-Fix, Wartezeiten); nach erfolgreichem Holen automatisch zum Kalender
- README-Feature-Tabelle (WebView, Zugangsdaten, ICS vs. Google erklärt)
- Holen-UI: ein Button (Monatsfenster aus Einstellungen vorausgewählt); NextShift-Widget Standard 1 Zelle hoch

### Behoben
- Holen: Android öffnet PDFs nicht mehr im WebView-Viewer (Capture und weiter); Status zeigt Holen-Schritte statt „PDF erfasst“-Spam
- Sync-Erinnerung: Standard **aus** (kein Prompt beim Öffnen); nur nach bewusster Einstellung
- Holen: kompakte Statuszeile statt großer „Fetch läuft“-Karte
- Widgets: feste Größe (~4×2) und kein Resize — WeekPlan jetzt **4×1**, resizebar; NextShift **2×1**; lesbare Schrift; kurze Dienstcodes; breites Preview-Bild (kein aufgeblasenes App-Icon)
- Changelog: Deutsch und Englisch getrennt (`CHANGELOG.md` / `CHANGELOG.en.md`)

## 0.1.2 — 2026-07-23

### Hinzugefügt
- Export-Ziele (`src/sync/targets`) — Google (OAuth) und ICS (Datei); Ein-Tipp führt aktivierte OAuth-Ziele aus
- Kalender in der App: Woche / Monat / Liste (Pack-Farben, gespeicherter Modus)
- Android-Homescreen-Widget **LOGA3 nächste Schicht**
- Nach Ein-Tipp-Holen: optional ICS teilen, wenn kein OAuth-Sync lief

### Geändert
- Ein-Tipp-Beschriftung: „Dienstplan holen“ vs. „Holen + Google“ je nach Ziel
- Einstellungen: Schalter „ICS anbieten, wenn kein Sync“

## 0.1.1 — 2026-07-22

### Behoben
- Live-Holen Emulator-Smoke: Juli 2026 → PDF + 14 Schichten (historisch mit erzwungener Displaygröße — inzwischen verboten; Emulator = echte Phone-Größe)
- Android-PDF-Capture: Viewer-Auslesen und nur echte PDF-Bytes; Text-Extraktion ohne Worker auf Hermes

### Geändert
- PLAN / `docs/webview-fetch.md`: Live-Holen-DoD erfüllt
- README: kein Displaygrößen-Cheat; Emulator = natürliche Phone-Größe
- Mehrere Monate Smoke 06+07/2026 → 28 Schichten / 2 PDFs
- Google-Sync wie Desktop: eingebaute Client-ID (keine `EXPO_PUBLIC_GOOGLE_*`), Löschen im Datumsbereich; optional `GOOGLE_CLIENT_ID` in `.env`
- Kalender-Tab näher am Desktop: Tabelle Datum/Code/Start/Ende, Hervorhebung heute/Woche/Monat, AZK-Monatsübersicht, Auto-Scroll zum Fokus
- Früher gehen: Ist-Zeiten mit gleichem Start → bekannter Dienstcode (nicht mehr „fehlende Zeiten“); Mapping-UI nur für wirklich unbekannte Starts
- Sicherheit: Login nur Secure Store; Mandanten-URL nur Einstellungen/AsyncStorage — nichts davon im APK-Build; Arbeitgeber per Pack-Auswahl (Setup)
- Fetch-Automation: Warten auf Bedingungen statt Sleep/Retry-Orgie — Vorbedingung → eine Aktion → Nachbedingung; höchstens eine Wiederherstellung
- Eigenes **Setup-Fenster**: URL → Login → Pack; Holen nur Monate/Fetch wenn Setup komplett
- Shell-Bereit: wartet auf Ende des LOGA3-Splash, bevor Zeiten geklickt wird

## 0.1.0 — 2026-07-21

### Hinzugefügt
- Expo (React Native) + TypeScript-App im Repo-Root mit Tabs: Holen, Vorschau, Export, Einstellungen
- Converter-Port (St.-Elisabeth-Parser, Mapping Anästhesie, ICS, Anonymisierung)
- Eingebautes Pack: St. Elisabeth · Pflege · OP · Anästhesie (validiert)
- LOGA3-Login → Secure Store; In-App-WebView + Automation
- Vorschau mit Hervorhebung heute/Woche/Monat; Benutzer-Mappings für fehlende Zeiten
- ICS-Teilen; Google OAuth/Sync (Client-IDs über Umgebung)
- Support: anonymisierter Rohtext-Ausschnitt mit KO*/GE*
- Übersetzungen DE/EN
- Jest-Unit-Tests, Typprüfung, `eas.json` (development / preview / production)

### Geändert
- Expo-Projekt ins Repo-Root gelegt (`app/` nur noch Router, keine doppelte Projektstruktur)
- Holen: Live-Pfad „Ausgewählte laden“ (Monat wählen + PDF-Capture); Fixture klar als Offline-Debug
- Desktop-Pre-Download-Prüfungen: Content-Gate, Dialog-Monat, PDF-Abrechnungsmonat; LOGA3-URL in den Einstellungen

### Hinzugefügt (Entwicklung)
- `shell.nix`: Node 22 + JDK 17 + Android-SDK/Emulator; Hilfen `loga3-emu` / `loga3-android` / `loga3-help`
- Holen-Kernmodule und aktualisierte Doku `webview-fetch.md`
