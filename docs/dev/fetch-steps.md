# Fetch pipeline — ein Pfad, keine Fallbacks

Orchestration: `src/sources/webview/loga3/fetchJob.ts` · Klicks: `src/sources/webview/loga3/automation.ts` · Viewport: `Loga3WebView` (`width=1280` + scale) · Layout-Fix PDF: `layoutFixInject.ts` (siehe [`layout-fix-pdf.md`](layout-fix-pdf.md))

Desktop-Referenz: `LOGA3-Automation/src/loga3-workflow.js` (`runDownloadPipeline`).

**Rule:** Success = DOM-Postcondition. Click-ok allein reicht nie. Gerätegröße ändert den Pfad nicht.

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

## Canonical selectors (Desktop ↔ Mobile)

| Step | Action | Canonical selector / signal | Postcondition |
|------|--------|----------------------------|---------------|
| L1 | Login user | `input[name="Kennung"]` (also username / placeholder Kennung) | field filled |
| L2 | Login pass | `input[name="Kennwort"]` / `input[type="password"]` | field filled |
| L3 | Submit | Anmelden button / Enter | leave login; not bad-credentials text |
| S1 | Shell ready | visible `div.LG-Button[aria-label="öffnen"]` **or** `#ZeitdatenMonthPicker` | not splash, not login |
| S2 | Open Zeitdaten | `div.LG-Button[aria-label="öffnen"]` (first **visible**) | `#ZeitdatenMonthPicker` attached+usable |
| S3 | Mask (optional assert) | `[data-uin="mask-LZWZEITD"]` | personal Zeitdaten mask |
| S4 | Arm reload | `[data-uin="ic-zaxisrotation"]` / `[aria-label="Aktualisieren"]` | best-effort |
| M1 | Month picker | `#ZeitdatenMonthPicker` click → popup | popup visible |
| M2 | Month/year nav | popup `[aria-label]` year/month dirs | header MM/YYYY |
| M3 | Month arrows | near picker: `[data-uin="ic-previous"]` / `ic-next`, `Vorheriger Monat` / `Nächster Monat` | header matches |
| G1 | Content gate | calendar signature (day01 weekday, last day, ranges/GE/KO) | `verifyCalendarShowsMonth` |
| G2 | Berechnen | text `BERECHNEN` (optional) | still valid month |
| G3 | Has plan | ranges / geKo / SCHICHTFREI | else `NO_PLAN` |
| E1 | SmartEdin | `span.LG-Icon.ic-smartedingeborder[data-uin="ic-smartedingeborder"]` | Export menu visible |
| E2 | Export panel wait | `div.MenuItem[data-uin="smartthing-cat-exports"]` | visible |
| E3 | Export click | **must** `div.MenuItem[data-uin="smartthing-cat-exports"]` | `smartthing-LAGSDZPG` visible |
| E4 | Zeitprotokoll | **only** `div.LGSmartThingContentItem[data-uin="smartthing-LAGSDZPG"]` | click + hold ~1s |
| D1 | Dialog visible | Herunterladen / Abrechnungsmonat dialog | visible |
| D2 | Download | **exact** `Herunterladen` (`getByRole` / `span.PrimaryButton`) | PDF bytes |
| D3 | Close | `[data-uin="ic-delete"][aria-label="Schließen"]` etc. | dialog gone |

### Forbidden / reject texts (fail-fast)

- `Für dieses Team kann kein Zeitprotokoll` (dialog only — fail-fast)
- Do **not** treat sidebar text `Kalender für sidebar` / `Kalenderfürsidebar` as a hard block
- Abrechnung-unavailable style messages when expecting Zeitprotokoll download
- Bad credentials: `Kennung bzw. das Kennwort ist falsch`

### Detect / Fail (Gate)

- `WRONG_EXPORT` — Abrechnungs-Dialog statt Zeitprotokoll
- `NO_PLAN` — Monat ohne Plan → skip
- `BAD_CREDENTIALS` — Login

Sidebar-/Chrome-Texte sind irrelevant. Nie Team navigieren.

## Debug

```bash
bash tests/e2e/run-gate-debug.sh
# /tmp/loga3-shots/gate-debug/
```
