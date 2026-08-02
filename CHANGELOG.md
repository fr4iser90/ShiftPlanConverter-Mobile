# Änderungsprotokoll

Deutsch. Englische Fassung: [CHANGELOG.en.md](./CHANGELOG.en.md)

Format angelehnt an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/).

## 0.1.7 — 2026-08-02

### Hinzugefügt
- Einrichtung: Schritt **Mein Name** vor optionalem Portal; Google **trennen**
- Pack-Rollen: flache `dutyCodes`, `department`/`role`, OCR-/Payroll-Bezug pro Rolle

### Geändert
- Berufsgruppe **Ärzte** (kurz); Setup-Hinweis und „Einrichtung beenden“ klarer
- Arbeitgeber-Auswahl: bei mehreren Bereichen nicht mehr alles vorausfüllen

### Behoben
- Verdienst-Abruf nach Dienstplan: aus Zeiten zurück zum Dashboard, dann Private Cloud
- „Alle lokalen Daten löschen“ räumt jetzt auch OCR-Namen / Aliase mit weg

## 0.1.6 — 2026-08-01

### Hinzugefügt
- LOGA3 **Verdienstnachweis**-Abruf (Private Cloud → Generierte Dokumente → Monats-PDF)
- Import: Segment **Dienstplan / Verdienst**; Monate mit vorhandenem VN markiert
- Verdienst: laufender/zukünftiger Monat nicht wählbar; vorhandene VN werden behalten (kein erneutes Download)
- Fehlende Monatsordner in LOGA3 werden übersprungen statt den ganzen Abruf abzubrechen
- Nutzerhandbuch DE/EN: Produktmodell (Pack, optionale Quellen, Prüfung)

### Geändert
- LOGA3-Dienstplan: Grid-Aktualisierung zuverlässiger (Arm + Monatspfeile)
- Shell-Ready erkennt auch Private-Cloud / Generierte Dokumente (kein Hänger nach VN-Abruf)
- Import-Button „+ Sync“ nur wenn OAuth-Schnellsync wirklich läuft

### Behoben
- Verdienst-Abruf: falscher Pfad / Abbruch bei noch nicht veröffentlichten Monaten

## 0.1.5 — 2026-07-25

### Hinzugefügt
- Verschlüsselung at-rest (AES-GCM) für Schichten, Rohtext, Summaries und PDFs; Schlüssel im Secure Store
- Optionale Biometrie-/PIN-Sperre vor Abrufen und Passwort-Anzeige (Einstellungen → Sicherheit)
- Datenschutzerklärung auf shift.fr4iser.com/privacy (ShiftPlanConverter) und Link in About; Play-Store-Launch-Docs
- „Alle lokalen Daten löschen“ und HTTPS-only Tenant-URL

### Geändert
- WebView-Debug und Smoke-Credential-Deep-Links nur noch in Dev-Builds
- Downloads-PDF nach Android-Poll löschen; Advanced/Fixture nur in `__DEV__`
- Update-Check kann später auf Play Store umschalten (`PROJECT_PLAY_STORE`)

### Sicherheit
- Kein „security audited“-Claim in Store-Texten; Peer-Review-Paket unter `docs/dev/peer-review-packet.md`

## 0.1.4 — 2026-07-24

### Hinzugefügt
- Nutzerhandbuch und [docs/releases.md](./docs/releases.md) (GitHub-APK, Changelog-Pflicht vor Release)
- Einstellungen: GitHub-Update-Prüfung (`releases/latest`) und Changelog-Links
- Einstellungen: Sync-Erinnerung (Intervall, Stunde, Benachrichtigung, Nachfrage beim Öffnen, Widget-Hinweis)
- [docs/dev/schedule-and-updates.md](./docs/dev/schedule-and-updates.md) — Grenzen von Hintergrund-Abrufen
- System-Hell-/Dunkelmodus für die Produkt-UI; Statusleiste folgt dem Hintergrund
- Kalender: Umschalter Woche / Monat / Liste; AZK-Monatsübersicht darunter einklappbar
- Android-Widgets: „Nächste Schicht“ und „Diese Woche“; Theme in den Einstellungen
- Sicherheits-Audit-Checkliste und Scanner-Finding-Policy (`.scanning/`)

### Geändert
- Abrufen zuverlässiger (Layout-Fix, Wartezeiten); nach erfolgreichem Abrufen automatisch zum Kalender
- README-Feature-Tabelle (WebView, Zugangsdaten, ICS vs. Google erklärt)
- Abrufen-Tab: ein Button (Monatsfenster aus Einstellungen vorausgewählt); NextShift-Widget Standard 1 Zelle hoch

### Behoben
- Abrufen: Android öffnet PDFs nicht mehr im WebView-Viewer (Capture und weiter); Status zeigt Abrufen-Schritte statt „PDF erfasst“-Spam
- Abrufen: Servlet-/Download-URL-Blockade lud Login-HTML statt echter PDFs — nur noch `.pdf`/`blob:` blockieren
- Abrufen: PDF-Capture verlangt `%PDF`/`JVBERi`; Servlet-Klicks nicht mehr per preventDefault abfangen (DownloadManager ohne Cookies = Login-HTML); Status mit Schrittzeiten
- Abrufen: kein `clickOnceOrWait`-Retry; Content-Gate ohne Grid-Reload-Fallback; kurze Soft-Probes in Waits; Step-Metriken (`▶/✓` + Summary); GATE-Dumps nur still (kein Status-Spam)
- PDF-Text-Parse: kein Regex über ganze PDF-als-String (das war ~30–40 s/Monat, UI blieb auf „savePdf“) — Byte-Scan `stream`/`endstream`
- Widgets: feste Größe (~4×2) und kein Resize — WeekPlan jetzt **4×1**, resizebar; NextShift **2×1**; lesbare Schrift; kurze Dienstcodes; breites Preview-Bild (kein aufgeblasenes App-Icon)
- Changelog: Deutsch und Englisch getrennt (`CHANGELOG.md` / `CHANGELOG.en.md`)

## 0.1.2 — 2026-07-23

### Hinzugefügt
- Export-Ziele (`src/sync/targets`) — Google (OAuth) und ICS (Datei); Ein-Tipp führt aktivierte OAuth-Ziele aus
- Kalender in der App: Woche / Monat / Liste (Pack-Farben, gespeicherter Modus)
- Android-Homescreen-Widget **LOGA3 nächste Schicht**
- Nach Ein-Tipp-Abrufen: optional ICS teilen, wenn kein OAuth-Sync lief

### Geändert
- Ein-Tipp-Beschriftung: „Dienstplan abrufen“ vs. „Abrufen + Google“ je nach Ziel
- Einstellungen: Schalter „ICS anbieten, wenn kein Sync“

## 0.1.1 — 2026-07-22

### Behoben
- Live-Abrufen Emulator-Smoke: Juli 2026 → PDF + 14 Schichten (historisch mit erzwungener Displaygröße — inzwischen verboten; Emulator = echte Phone-Größe)
- Android-PDF-Capture: Viewer-Auslesen und nur echte PDF-Bytes; Text-Extraktion ohne Worker auf Hermes

### Geändert
- PLAN / `docs/dev/webview-fetch.md`: Live-Abrufen-DoD erfüllt
- README: kein Displaygrößen-Cheat; Emulator = natürliche Phone-Größe
- Mehrere Monate Smoke 06+07/2026 → 28 Schichten / 2 PDFs
- Google-Sync wie Desktop: eingebaute Client-ID (keine `EXPO_PUBLIC_GOOGLE_*`), Löschen im Datumsbereich; optional `GOOGLE_CLIENT_ID` in `.env`
- Kalender-Tab näher am Desktop: Tabelle Datum/Code/Start/Ende, Hervorhebung heute/Woche/Monat, AZK-Monatsübersicht, Auto-Scroll zum Fokus
- Früher gehen: Ist-Zeiten mit gleichem Start → bekannter Dienstcode (nicht mehr „fehlende Zeiten“); Mapping-UI nur für wirklich unbekannte Starts
- Sicherheit: Login nur Secure Store; Mandanten-URL nur Einstellungen/AsyncStorage — nichts davon im APK-Build; Arbeitgeber per Pack-Auswahl (Setup)
- Fetch-Automation: Warten auf Bedingungen statt Sleep/Retry-Orgie — Vorbedingung → eine Aktion → Nachbedingung; höchstens eine Wiederherstellung
- Eigenes **Setup-Fenster**: URL → Login → Pack; Abrufen nur Monate/Abrufen wenn Setup komplett
- Shell-Bereit: wartet auf Ende des LOGA3-Splash, bevor Zeiten geklickt wird

## 0.1.0 — 2026-07-21

### Hinzugefügt
- Expo (React Native) + TypeScript-App im Repo-Root mit Tabs: Abrufen, Vorschau, Export, Einstellungen
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
- Abrufen: Live-Pfad „Ausgewählte laden“ (Monat wählen + PDF-Capture); Fixture klar als Offline-Debug
- Desktop-Pre-Download-Prüfungen: Content-Gate, Dialog-Monat, PDF-Abrechnungsmonat; LOGA3-URL in den Einstellungen

### Hinzugefügt (Entwicklung)
- `shell.nix`: Node 22 + JDK 17 + Android-SDK/Emulator; Hilfen `loga3-emu` / `loga3-android` / `loga3-help`
- Abrufen-Kernmodule und aktualisierte Doku `webview-fetch.md`
