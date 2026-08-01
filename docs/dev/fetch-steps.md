# LOGA3 Dienstplan-Abruf — Steps & Selektoren

Stand: 2026-08-01 · Live-Pfad Phone (Dev-Client).

**Orchestration:** `src/sources/webview/loga3/shift/fetchJob.ts`  
**Steps (eigene Dateien):** `shift/steps/selectMonthVerified.ts`, `shift/steps/assertContentReady.ts`  
**Inject-Klicks:** `shared/automationHandlersCore.ts` · `shift/automationHandlers.ts` · `shared/automationPortalFinders.ts` · `shared/automationDomHelpers.ts`  
**Desktop-Referenz:** `LOGA3-Automation/src/loga3-workflow.js`

**Regel:** ein Pfad, keine Fallbacks. Success = DOM-Postcondition. Viewport WebView = Desktop `width=1280` (skaliert).

---

## Ablauf (was du meinst — ja, so)

```
1 Login
2 Shell bereit (warten)
3 Zeiten-Container → einmal „öffnen“
4 Grid-Reload armieren (Sidebar-Control, oft unsichtbar)
5 Pro Monat:
   a) Monat per Chrome-Pfeile
   b) Content-Gate / Grid-Aktualisierung (Arm + Pfeile weg/zurück falls nötig)
   c) Plan prüfen
   d) SmartEdin → Export → Zeitprotokoll (LAGSDZPG)
   e) Dialog → Herunterladen → PDF
```

---

## Step → Selektor → Postcondition

| # | Step (Code) | Selektor(en) | Muss danach wahr sein |
|---|-------------|--------------|------------------------|
| **1** | Login `fillLogin` / `submitLogin` | `input[name="Kennung"]` (auch placeholder/id Kennung); Passwort-Feld; Anmelden-Button / Enter | nicht mehr Login; kein „Kennung/Kennwort falsch“ |
| **2** | Shell `assertShellReady` | sichtbar: `div.LG-Button[aria-label="öffnen"]` **oder** schon `#ZeitdatenMonthPicker` | nicht Splash, nicht Login |
| **3** | Zeiten öffnen `clickOeffnen` → `ensureZeitdatenPicker` | **einmal** `div.LG-Button[aria-label="öffnen"]` / `Öffnen` — nur am **Zeiten/Kalendarium**-Widget (`findOeffnenControl`, nie Private-Cloud) | `#ZeitdatenMonthPicker` im DOM; oft Maske `[data-uin="mask-LZWZEITD"]` |
| **4** | Arm Grid-Reload `armCalendarReload` (Job-Start + ggf. Content-Gate) | `[data-uin="ic-zaxisrotation"]`, `.RefreshWrapper[aria-label="Aktualisieren"]`, `[aria-label="Aktualisieren"]`, `.RefreshIcon` — **Force-Click** (Sidebar oft CSS-versteckt) | Control geklickt = Reload **scharf**; allein lädt das Grid **nicht** |
| **5a** | Monat `selectMonth` / `selectMonthVerified` | Primär Chrome-Pfeile neben Picker: `[data-uin="ic-previous"]` / `ic-next` (nahe `#ZeitdatenMonthPicker`). Popup nur wenn Monat noch unbekannt. | Picker zeigt `MM/YYYY` |
| **5b** | Grid-Aktualisierung `assertContentReady` | Wenn Grid noch Vormonat: nochmal **Arm** → Pfeile **einen Monat weg** → **zurück zum Ziel** → Verify ≤10s | day01-Wochentag + lastDay + Picker = Zielmonat (Titel „Buchungen für …“ allein reicht **nicht**) |
| **5c** | Optional `clickBerechnen` | sichtbarer Button/Text `Berechnen` | Verify weiter ok |
| **5d** | Plan `assertHasPlan` | Signatur: Zeit-Ranges / `GE*`/`KO*` / `SCHICHTFREI` | sonst `NO_PLAN` → Monat skip |
| **6** | SmartEdin `clickSmartEdin` | `span.LG-Icon.ic-smartedingeborder[data-uin="ic-smartedingeborder"]` oder `[data-uin="ic-smartedingeborder"]` | Export-Menü sichtbar |
| **7** | Export `clickExport` | `div.MenuItem[data-uin="smartthing-cat-exports"]` | Kachel `smartthing-LAGSDZPG` sichtbar |
| **8** | Zeitprotokoll `openZeitprotokoll` | **nur** `div.LGSmartThingContentItem[data-uin="smartthing-LAGSDZPG"]` (klicken + halten) | Dialog mit Abrechnungsmonat / Herunterladen |
| **9** | PDF `clickDownload` / Capture | exakter Text **Herunterladen** | PDF-Bytes (`%PDF`) |

Fehlt Schritt 3 nach **einem** Öffnen: **FAIL** — kein zweites Öffnen, kein „Zeiten“-Retry.

---

## Grid-Aktualisierung (wichtig)

| Mythos | Realität |
|--------|----------|
| Es gibt einen sichtbaren „Aktualisieren“-Button im Buchungs-Header | Nein — Arm-Control sitzt in der **Sidebar** (oft durch Layout-Fix unsichtbar) |
| Arm-Klick = Grid neu | Nein — Arm **schärft** nur; **Monatspfeile** danach laden das Tagesgrid (`calendarCacheService`) |
| Popup-Monat reicht | Oft nur Titel flippt; Grid bleibt Vormonat (`day01=SA` obwohl September) |

Code: `shift/steps/assertContentReady.ts` · Desktop: `forceGridReload` in `loga3-workflow.js`.

Timeout: `LoGa3Timeout.waitGridAktualisierung` (aktuell 10s).

---

## Dateien pro Step (Orientierung)

| Bereich | Datei |
|---------|--------|
| Job-Orchestrierung | `shift/fetchJob.ts` |
| Monat wählen | `shift/steps/selectMonthVerified.ts` |
| Grid-Aktualisierung | `shift/steps/assertContentReady.ts` |
| Login / Shell / PDF-Dialog | `shared/automationHandlersCore.ts` |
| Öffnen-Finder Zeiten vs Verdienst | `shared/automationPortalFinders.ts` |
| Picker / Pfeile / Signatur | `shared/automationDomHelpers.ts` |
| SmartEdin / Export / LAGSDZPG / Arm | `shift/automationHandlers.ts` |
| Timeouts | `shared/timeouts.ts` |
| Layout (PDF-Viewport) | `shift/layoutFixInject.ts` |

Inject = JS-**Strings** für die WebView (`buildAutomationScript`) — keine normalen RN-Module im Portal-DOM.

---

## Verboten

- Team-/Sidebar-Navigation klicken (außer Force-Arm auf Reload-Control)
- Zweites „öffnen“ / Zeiten-Fallback
- Private-Cloud „öffnen“ statt Zeiten
- Export als Erfolg werten ohne gültiges Tagesgrid

Siehe auch: [`fetch-steps-payslip.md`](./fetch-steps-payslip.md) (Verdienst), [`webview-fetch.md`](./webview-fetch.md), [`layout-fix-pdf.md`](./layout-fix-pdf.md).
