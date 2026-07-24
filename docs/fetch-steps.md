# Fetch pipeline — ein Pfad, keine Fallbacks

Orchestration: `src/loga3/fetchJob.ts` · Klicks: `src/loga3/automation.ts` · Viewport: `Loga3WebView` (`width=1280` + scale)

**Scope:** nur eigenes Zeitprotokoll-PDF. Keine Team-UI. **Keine Fallbacks** (kein Zeiten, kein zweites Öffnen).

## Warum Desktop in der Phone-App? (kein Bug)

LOGA3 ist eine **GWT-Desktop-Webapp**. Der PDF-Export (SmartEdin → Export → Zeitprotokoll generieren) existiert in der **Desktop-Shell**, nicht in einer echten Mobile-App-View.

**Profis machen dasselbe:** WebView/Browser so setzen, dass die **bekannte Desktop-DOM-Struktur** da ist, dann deterministisch UINs/Selektoren klicken (wie Playwright gegen Desktop). Nicht: responsive Mobile-Layout raten und andere Buttons suchen.

| Ansatz | Was passiert |
|--------|----------------|
| **Unser Weg (richtig für PDF)** | Viewport `width=1280`, skaliert ins Phone-WebView → gleiche Buttons wie Desktop-Automation |
| „Native“ Phone-Viewport | oft andere/kleinere LOGA3-Chrome, **kein** LAGSDZPG/Export-Pfad → Fetch bricht |
| API statt UI | ideal, aber LOGA3 liefert hier keinen öffentlichen Dienstplan-API-Endpoint |

Phone-Auflösung (Matrix 1080×2400 usw.) = **Geräte-Pixel**. Der **Inhalt** bleibt Desktop-CSS 1280px, nur gezoomt.

## Seite (Desktop-Shell, skaliert)

```
┌──────────────┬─────────────────────────────────────────┐
│ linke Nav    │ Kopfzeile + #ZeitdatenMonthPicker       │
│ (nicht       ├─────────────────────────────────────────┤
│  anklicken)  │ Kalender-Grid                           │
│              │                                         │
│              │ Toolbar: SmartEdin ⚙                    │
│              │   → Export                              │
│              │   → Zeitprotokoll generieren (LAGSDZPG) │
│              │   → Dialog → Herunterladen              │
└──────────────┴─────────────────────────────────────────┘
```

## Einziger Happy Path — was genau geklickt wird

| # | Step | Genau dieses Element | Nachher muss wahr sein |
|---|------|----------------------|-------------------------|
| 1 | Login | `input` Kennung/Kennwort + Anmelden | nicht mehr Login |
| 2 | Shell | *warten* | sichtbar: `div.LG-Button[aria-label="öffnen"]` **oder** schon `#ZeitdatenMonthPicker` |
| 3 | Zeitdaten | **einmal** `div.LG-Button[aria-label="öffnen"]` (bei Zeiten/Kalendarium, nie Private-Cloud) | `#ZeitdatenMonthPicker` im DOM |
| 4 | Monat | `#ZeitdatenMonthPicker` → Monat/Jahr | Header + Grid = gewählter Monat |
| 5 | Plan | *prüfen* | Schichten/ranges oder `NO_PLAN` → Monat skip |
| 6 | SmartEdin | `[data-uin="ic-smartedingeborder"]` | Export-Menü sichtbar |
| 7 | Export | `div.MenuItem[data-uin="smartthing-cat-exports"]` | Kachel `smartthing-LAGSDZPG` sichtbar |
| 8 | ZP | `div.LGSmartThingContentItem[data-uin="smartthing-LAGSDZPG"]` (klicken + halten) | Dialog mit **Herunterladen** |
| 9 | PDF | exakter Button-Text `Herunterladen` | PDF-Bytes |

Fehlt Schritt 3 (Picker nach einem Öffnen-Klick): **FAIL** — kein Zeiten, kein Retry.

**Gesamtbudget:** ≤ 2 Min für bis zu 3 Monate.

## Debug

```bash
bash tests/e2e/run-gate-debug.sh
# /tmp/loga3-shots/gate-debug/
```
