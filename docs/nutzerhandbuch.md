# Nutzerhandbuch

## Was ist ShiftPlan Converter?

Eine **on-device** App, die deinen **Dienstplan** (und optional den **Verdienstnachweis**) aus verschiedenen Quellen einliest, Schichten lokal speichert, im Kalender zeigt und als **ICS** / optional **Google Calendar** exportiert.

**Kernidee:**

1. **Arbeitgeber-Pack** (Pflicht) — Mapping von Codes, Zeiten, Parsern, optional Payroll-Profil. Ohne passendes Pack sind Codes/Zeiten oft falsch.
2. **Quellen** — alles **optional**, was das Pack anbietet:
   - **Datei / Foto / OCR** — PDF, CSV, ICS, Kamera; generische Engines + Pack-Mapping (Listen, Monat-Matrix, …).
   - **Portal / WebView** (z. B. **LOGA3**) — nur wenn das Pack das vorsieht. Kann getrennte Jobs haben: **Dienstplan** und/oder **Verdienstnachweis**.
3. **Export** — ICS und/oder Google; unabhängig vom Abrufweg.

Kein Fr4iser-Server für Passwort oder Plan. Login nur lokal (Secure Store); Schichten und Verdienstnachweise verschlüsselt at rest.

Die App ist experimentell. Ein Pack (z. B. St. Elisabeth · Pflege · OP) ist live verifiziert; **andere Arbeitgeber** brauchen ein eigenes Pack (JSON: Mapping/Parser). Dieselbe LOGA3-Technik lässt sich oft wiederverwenden — die Codes und PDFs nicht.

---

## 1. Die Tabs

| Tab | Wozu |
|-----|------|
| **Import** | Quelle wählen (Datei/OCR und/oder LOGA3), Monate, Dienstplan oder Verdienst laden |
| **Kalender** | Schichten prüfen (Woche / Monat / Liste) |
| **Prüfung** | Nur wenn das Pack ein **Payroll-Profil** hat: Verdienstnachweis ↔ importierte Dienste |
| **Export** | ICS teilen oder Google synchronisieren |
| **Einstellungen** | Einrichtung, Abruf-Fenster, Erinnerungen, Darstellung, Hilfe |

**Prüfung** erscheint nur, wenn für deinen gewählten Bereich `payroll.supported` + Profil hinterlegt ist (nicht nur weil du irgendwann PDF importiert hast). Ohne VN-Daten zeigt die Prüfung Hinweise zum Nachladen.

---

## 2. Erste Einrichtung

Unter **Einstellungen → Einrichtung** (oder beim ersten Start):

1. **Arbeitgeber / Pack** — Gruppe, Bereich, Preset. **Pflicht.**
2. **Portal-Login** (optional) — z. B. LOGA3-URL + Kennung, nur wenn du WebView-Abruf nutzt. Für reinen Datei-/OCR-Import überspringen.
3. **Google** — optional, später unter Export möglich.

Pack ohne Portal-Anbindung → in der Import-UI nur Datei/OCR. Pack mit LOGA3 → Segment **Dienstplan** / **Verdienst** (Verdienst nur bei Payroll-Support).

---

## 3. Import

### Datei / OCR

Quelle **Datei & Foto** → PDF/CSV/ICS wählen oder Kamera/Galerie.  
PDF/OCR nutzen Pack-Parser und -Mapping (verschiedene Layouts: Liste, Monat-Matrix, …). Unklare Dokumente fragt die App (Dienstplan vs. Verdienstnachweis), wenn Payroll unterstützt wird.

### LOGA3 (wenn im Pack)

1. Quelle **LOGA3**, Job **Dienstplan** oder **Verdienst**.
2. Abgeschlossene Monate wählen (bei Verdienst: laufender/zukünftiger Monat deaktiviert).
3. Laden — eingebettetes Portal, Automatisierung, PDF-Capture.

Schon gespeicherte Verdienstnachweise werden **behalten** (kein erneutes Download), sofern nichts fehlt. Monate ohne Ordner in LOGA3 werden übersprungen.

Nach Erfolg: Schichten → **Kalender**; Verdienst → oft **Prüfung**.

**Hinweis:** Portal-Abruf nur bei offener App — kein zuverlässiger stiller Nachtabruf.

---

## 4. Kalender

- Umschalter **Woche / Monat / Liste**.
- Oft **Monatsübersicht** (AZK, Übertrag, …).
- Farben und Codes kommen aus dem Pack.

---

## 5. Abrechnungsprüfung (Tab Prüfung)

Vergleicht **Verdienstnachweis** (Zeilen/Tarif) mit **importierten Diensten** des zugehörigen Zeitraums.  
Voraussetzung: Pack mit Payroll-Profil **und** passender VN (Import oder LOGA3 Verdienst). Fehlen Dienste → Hinweis und Link zurück zum Import.

---

## 6. Export

| Weg | Was passiert |
|-----|----------------|
| **ICS teilen** | Datei → Share-Menü (Apple, Outlook, Samsung, …) |
| **Google Sync** | Eigener Schicht-Kalender (nicht Primärkalender) |

---

## 7. Erinnerungen

Unter **Einstellungen → Erinnerungen**: Sync-fällig, Schicht-Erinnerungen (inkl. Vorabend-Option).

---

## 8. Widgets & Darstellung

Theme unter **Einstellungen → Darstellung**. Android-Homescreen-Widgets zeigen den zuletzt geladenen Plan (kein eigener Netzwerkabruf).

---

## 9. App aktualisieren

Bisher oft **APK / Play**; unter **Einstellungen → App & Support** Version, Updates, Handbuch.

---

## 10. Privatsphäre & Grenzen

| Daten | Ort |
|-------|-----|
| Passwort | Secure Store |
| AES-Schlüssel | Secure Store |
| Schichten / Verdienstnachweise | AsyncStorage, **AES-GCM** (`enc:v1:`) |
| PDFs (Dienstplan-Capture) | App-Dokumentordner (verschlüsselt wo vorgesehen) |
| Google | Sign-In auf dem Gerät |

**Grenzen:** Anderer AG braucht Pack; Portal-UI-Änderungen können Abruf brechen; Fokus der Tests Android.

Bei Problemen: **Einstellungen → App & Support** → Support-Mail.
