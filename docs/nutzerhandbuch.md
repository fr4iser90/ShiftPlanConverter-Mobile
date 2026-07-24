# Nutzerhandbuch — LOGA3 Automation Mobile

**Status:** experimentell · getestet für einen Arbeitgeber + eine Berufsgruppe (Pack).  
**Desktop:** [LOGA3-Automation](https://github.com/fr4iser90/LOGA3-Automation)

Kurze Antwort auf „Was macht die App?“: Sie holt deinen **Dienstplan aus LOGA3**, speichert ihn **nur auf dem Gerät**, zeigt ihn als Kalender und kann ihn als **ICS** teilen oder optional nach **Google Calendar** schreiben.

---

## 1. Überblick der Features

| Feature | Was du siehst | Wozu |
|---------|---------------|------|
| **Setup** | URL, Login, Arbeitgeber-Pack, optional Google | Einmalig einrichten |
| **Holen** | Monate wählen → Aktualisieren / Ausgewählte laden | Dienstplan von LOGA3 holen |
| **Kalender** | Woche / Monat / Liste + AZK-Monatsübersicht | Schichten prüfen |
| **Export** | ICS teilen · Google sync | In andere Kalender bringen |
| **Widgets** | Nächste Schicht · Diese Woche (Android) | Homescreen ohne App zu öffnen |
| **Einstellungen** | Fenster, Sync-Prefs, Widget-Theme, Update-Links | Feintuning + App-Update |

Alles läuft **on-device**. Es gibt **keinen** Fr4iser-Server, der dein Passwort oder den Dienstplan speichert.

---

## 2. Warum WebView? (Holen)

LOGA3 ist eine **Browser-Webanwendung** (kein öffentliches Schicht-API). Die Desktop-App steuert den Browser mit Playwright. Auf dem Handy macht dasselbe eine **eingebettete WebView**:

1. Du loggst dich (einmal) mit Kennung/Kennwort ein → gespeichert im **Secure Store**.
2. Die App öffnet die Tenant-URL in der WebView (wie Chrome, aber in der App).
3. Automatisierung klickt denselben Pfad wie Desktop: Zeiten → Monat → Export **Zeitprotokoll (PDF)** → PDF speichern → Parser → Schichten.

**Deshalb brauchst du Credentials:** Ohne Login kann die WebView den persönlichen Buchungsplan nicht laden. Die App sendet sie nur an **deine** LOGA3-URL, nicht an uns.

Technische Details: [webview-fetch.md](./webview-fetch.md).

---

## 3. Setup Schritt für Schritt

1. **Tenant-URL** — die LOGA3-Adresse deiner Einrichtung (steht oft im Browser-Lesezeichen).
2. **Kennung / Kennwort** — wie im Browser; nur lokal im Secure Store.
3. **Arbeitgeber / Pack** — Parser- und Farb-Mapping (z. B. St. Elisabeth · Anästhesie). Falsches Pack → falsche Zeiten/Codes.
4. **Google (optional)** — später unter Export nachholen.

Ohne abgeschlossenes Setup bleibt Holen gesperrt.

---

## 4. Holen (Dienstplan aktualisieren)

- **Aktualisieren / Dienstplan holen** — holt ein konfigurierbares Monatsfenster (Einstellungen: Vorgänger-/Folgemonate), danach optional Google oder ICS-Angebot.
- **Ausgewählte laden** — nur die angekreuzten Monate + Jahr.
- Währenddessen kann die WebView sichtbar sein (Fortschritt / Debug).

Nach Erfolg springt die App typischerweise in den **Kalender**-Tab.

---

## 5. Kalender (Vorschau)

- **Woche / Monat / Liste** — Umschalter oben.
- **Monatsübersicht (AZK, Übertrag, …)** — unter dem Kalender, einklappbar.
- Farben kommen aus dem Pack; unbekannte Codes kannst du mappen.

---

## 6. Export & Kalender-Anbieter

### Was heute geht

| Weg | Anbieter | Wie |
|-----|----------|-----|
| **ICS teilen** | Apple Kalender, Outlook, Samsung, Nextcloud, Thunderbird, … | Datei über Share-Sheet importieren |
| **Google Sync** | Google Calendar | OAuth in der App → eigener Schicht-Kalender (nicht Primär) |

### Sollten wir Outlook / Apple / CalDAV nativ anbinden?

**Kurz: nicht zuerst.** ICS deckt die meisten Anbieter ab. Native Sync bedeutet je Anbieter OAuth, APIs, Review und Wartung.

| Anbieter | Empfehlung |
|----------|------------|
| **Google** | Schon drin — behalten |
| **Apple** | ICS oder „In Kalender“; EventKit nur wenn viele iOS-Nutzer das verlangen |
| **Outlook / Microsoft 365** | ICS reicht oft; Graph-API später optional |
| **Nextcloud / DAVx⁵ / CalDAV** | ICS oder externes CalDAV; eigener CalDAV-Client = hoher Aufwand |
| **Samsung** | i. d. R. ICS |

Priorität: Holen stabil für mehr Packs → Google + ICS UX → erst dann weitere OAuth-Targets (`src/sync/targets` ist dafür vorbereitet).

---

## 7. Widgets (Android)

Unter **Einstellungen → Homescreen-Widget**: Theme System / Hell / Dunkel.

Im Launcher hinzufügen:

- **LOGA3 nächste Schicht**
- **LOGA3 diese Woche** (braucht ggf. Native-Rebuild nach App-Update)

Tippen öffnet die App. Daten kommen aus dem zuletzt geholten Plan (kein Netzwerk im Widget).

---

## 8. App aktualisieren (GitHub-APK)

Es gibt (noch) **keinen** Play-Store-Auto-Update. Verteilung: **GitHub Releases** (APK).

In **Einstellungen**:

- installierte Version sehen  
- **Nach Updates suchen** → vergleicht mit GitHub `releases/latest`  
- bei neuer Version: **Release öffnen**  
- **Was ist neu?** → Changelog  

Vor jedem Release: `CHANGELOG.md` pflegen. Prozess: [releases.md](./releases.md).

## 8b. Sync-Erinnerung (kein stiller Nacht-Fetch)

Unter **Einstellungen → Sync-Erinnerung**: Intervall (z. B. alle 3 Tage), Reminder-Stunde, optionale **Benachrichtigung**, Frage beim Öffnen, **Widget-Hinweis „Sync fällig“**.

Wichtig: Holen braucht die App/WebView — ein zuverlässiger Sync um 3 Uhr nachts *ohne* App ist auf Android nicht seriös machbar. Details: [schedule-and-updates.md](./schedule-and-updates.md).

---

## 9. Privatsphäre (kurz)

| Daten | Ort |
|-------|-----|
| Passwort | Secure Store |
| Tenant-URL, Schichten, Prefs | App-Speicher (Gerät) |
| PDFs | App-Dokumentordner |
| Google-Token | Google Sign-In auf dem Gerät |

Details / Audit-Checkliste: [security-audit.md](./security-audit.md).

---

## 10. Grenzen (ehrlich)

- Experimentell — ein AG/Pack live verifiziert.
- Anderer Arbeitgeber oder Berufsgruppe kann scheitern, bis ein Pack existiert.
- LOGA3-UI-Änderungen können Holen brechen → Update der App nötig.
- iOS: Build möglich (EAS/Mac), Fokus der Live-Tests bisher Android.
