# Nutzerhandbuch

ShiftPlan Converter lädt deine **Zeitprotokolle aus LOGA3** oder importiert **PDF / CSV / ICS** von deinem Gerät, speichert alles **nur lokal**, zeigt Schichten im Kalender und kann sie als **ICS** teilen oder optional nach **Google Calendar** schreiben.

Die App ist noch experimentell und derzeit für **einen Arbeitgeber und eine Berufsgruppe** (Pack) ausgelegt. Anderer Arbeitgeber oder Bereich kann fehlschlagen, bis ein passendes Pack existiert.

---

## 1. Die Tabs

| Tab | Wozu |
|-----|------|
| **Abrufen** | Monate wählen und Zeitprotokolle aus LOGA3 laden **oder** Dateien (PDF/CSV/ICS) importieren |
| **Kalender** | Schichten prüfen (Woche / Monat / Liste) |
| **Export** | ICS teilen oder Google synchronisieren |
| **Einstellungen** | Einrichtung, Abrufen-Fenster, Erinnerungen, Darstellung, Hilfe |

Es gibt **keinen** Fr4iser-Server für dein Passwort oder deinen Dienstplan.

---

## 2. Erste Einrichtung

Unter **Einstellungen → Einrichtung** (oder beim ersten Start):

1. **Tenant-URL** — die LOGA3-Adresse deiner Einrichtung (oft im Browser-Lesezeichen).
2. **Kennung / Kennwort** — wie im Browser; bleiben lokal im Secure Store.
3. **Arbeitgeber / Pack** — z. B. St. Elisabeth · Anästhesie. Falsches Pack → falsche Codes oder Zeiten.
4. **Google** — optional, kannst du später unter Export nachholen.

Für **Datei-Import** reicht der Arbeitgeber/Pack. **LOGA3-Abruf** braucht zusätzlich Tenant-URL und Login.

---

## 3. Zeitprotokolle abrufen

### Aus LOGA3

1. Tab **Abrufen** öffnen.
2. Oben die **Quelle** wählen: **LOGA3** oder **Datei (PDF / CSV / ICS)**.
3. Bei LOGA3: gewünschte **Monate** anhaken (Vorauswahl kommt aus **Einstellungen → Abrufen**: Vorgänger-/Folgemonate).
4. **Zeitprotokolle laden** tippen.

Die App öffnet LOGA3 in einer eingebetteten Ansicht, meldet dich an und exportiert die Monats-PDFs. Das kann etwas dauern; die Ansicht kann dabei sichtbar sein.

### Datei importieren

Unter **Abrufen** → Quelle **Datei** → **Datei wählen & importieren**: Datei(en) vom Gerät wählen.  
PDF wird mit dem gewählten Pack geparst; CSV braucht Spalten `date,type` (optional `start,end,allDay`); ICS liest `VEVENT`.

Nach Erfolg siehst du die Schichten typischerweise unter **Kalender**.

**Hinweis:** LOGA3-Abrufen funktioniert nur, während die App offen ist — es gibt keinen zuverlässigen stillen Abruf mitten in der Nacht ohne App.

---

## 4. Kalender

- Umschalter **Woche / Monat / Liste**.
- Darunter oft eine **Monatsübersicht** (AZK, Übertrag, …), einklappbar.
- Farben und Dienst-Codes kommen aus deinem Pack. Unbekannte Zeiten kannst du ggf. zuordnen.

---

## 5. Export

| Weg | Was passiert |
|-----|----------------|
| **ICS teilen** | Datei erzeugen und über das Share-Menü in Apple Kalender, Outlook, Samsung, Nextcloud, … importieren |
| **Google Sync** | Nach Anmeldung in einen **eigenen** Schicht-Kalender schreiben (nicht den Primärkalender) |

Google und ICS steuerst du unter **Einstellungen → Abrufen** bzw. im Export-Tab.

---

## 6. Erinnerungen

Unter **Einstellungen → Erinnerungen**:

- **Sync fällig** — Intervall und Uhrzeit, optional Benachrichtigung oder Frage beim Öffnen der App, optional Hinweis im Widget.
- **Schicht-Erinnerungen** — pro Dienst aus dem Mapping eine Uhrzeit setzen (z. B. 06:00 vor dem Frühdienst). Liegt die Uhrzeit nicht vor dem Schichtstart, fragt die App, ob es eine **Vorabend**-Erinnerung sein soll.

---

## 7. Widgets & Darstellung

Unter **Einstellungen → Darstellung**: App-Theme und Widget-Theme (System / Hell / Dunkel).

Auf dem Homescreen (Android) kannst du hinzufügen:

- **LOGA3 nächste Schicht**
- **LOGA3 diese Woche**

Tippen öffnet die App. Die Widgets zeigen den zuletzt abgerufenen Plan (kein eigener Netzwerkabruf).

---

## 8. App aktualisieren

Die App kommt bisher als **APK über GitHub Releases** (kein Play-Store-Auto-Update).

Unter **Einstellungen → App & Support**:

- installierte Version sehen  
- nach Updates suchen  
- bei neuer Version die Release-Seite öffnen und das Changelog lesen  
- dieses Handbuch erneut öffnen  

---

## 9. Privatsphäre & Grenzen

| Daten | Ort |
|-------|-----|
| Passwort | Secure Store auf dem Gerät |
| URL, Schichten, Einstellungen | App-Speicher auf dem Gerät |
| PDFs | App-Dokumentordner |
| Google-Anmeldung | Google Sign-In auf dem Gerät |

**Grenzen (ehrlich):**

- Ein Pack live verifiziert; andere Einrichtungen brauchen ggf. ein neues Pack.
- Ändert sich die LOGA3-Oberfläche, kann Abrufen kaputtgehen — dann hilft ein App-Update.
- Fokus der Tests bisher Android; iOS-Build ist möglich, aber weniger erprobt.

Bei Problemen: **Einstellungen → App & Support** → Support-Mail (anonymisierte Probe möglich).
