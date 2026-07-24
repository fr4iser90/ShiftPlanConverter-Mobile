# PDF-Pfad — Lab-Log & Checkliste

Stand: 2026-07-24 · Moto G73 (`ZY22J3RHFC`) · Pack: St. Elisabeth · Anästhesie  
Artefakte: `/tmp/loga3-shots/manual-path/` · ältere: `/tmp/loga3-shots/dom-steps/`

**Regel:** Ein Pfad, keine Fallbacks. Manuell via CDP (kein Holen-Tap, keine `tests/e2e/*`-Orchestrierung).  
Bekannte Schritte **nicht** erneut abfragen — weiterarbeiten und hier eintragen.

Verwandt: [`fetch-steps.md`](fetch-steps.md) · [`desktop-parity-plan.md`](desktop-parity-plan.md) · [`gate-debug-findings.md`](gate-debug-findings.md)

---

## Bewiesener Happy-Path (Selectors)

| # | Step | Selector | Postcondition | Status |
|---|------|----------|---------------|--------|
| 1 | Login | Kennung / Kennwort + Anmelden | Shell | [x] |
| 2 | Shell | `div.LG-Button[aria-label="öffnen"]` sichtbar (3×) | nach login | [x] |
| 3 | **ÖFFNEN Zeiten** | erstes ÖFFNEN nach `top` sortiert (**y≈326**, nicht PEP y≈1754) | `#ZeitdatenMonthPicker` + SmartEdin im DOM | [x] **kanonisch** |
| 4 | Monat | `#ZeitdatenMonthPicker` (z.B. „Juli 2026“) | Header matched | [x] nach ÖFFNEN da |
| 5 | SmartEdin | `[data-uin="ic-smartedingeborder"]` | Export-Menü | [x] mit Layout-Fix |
| 6 | Export | `div.MenuItem[data-uin="smartthing-cat-exports"]` | LAGSDZPG sichtbar | [x] |
| 7 | ZP | `div.LGSmartThingContentItem[data-uin="smartthing-LAGSDZPG"]` | PDF-View / Download | [x] **2026-07-24** (nach CSS3–7) |
| 8 | PDF | PDF-View laden | View sichtbar | [x] User bestätigt |

**Kanonisches Layout-Bundle in App:** `src/loga3/layoutFixInject.ts` → `Loga3WebView` — siehe [`layout-fix-pdf.md`](layout-fix-pdf.md).

### ÖFFNEN-Mapping (nicht verwechseln)

| # | y (layout) | Widget | Für PDF? |
|---|------------|--------|----------|
| 1 | ~326 | **Zeiten** | **JA** |
| 2 | ~1397 | Kalendarium | nein |
| 3 | ~1754 | PEP | **NEIN** |

---

## Layout-Ist (nach ÖFFNEN Zeiten, ohne CSS) — 2026-07-24

```
innerWidth×innerHeight ≈ 396×399   (WebView-Clip, Desktop-Inhalt skaliert)
.MyCalLeftPanel.ZDLeftPanel        ≈ 300×399 @ x=60   „KalenderfürMein Team“
.ZDMaskWrapper (Buchungen)         ≈  36×399 @ x=360  ← gequetscht
#ZeitdatenMonthPicker              ≈  46×50  @ x=360  „Juli 2026“
[data-uin=ic-smartedingeborder]    ≈  50×50  @ x=352,y=355  (im Clip)
.ColHeader                         ≈  17×0   @ y≈-175  ← height 0, über dem Clip
```

Text im Body enthält **beides**: „KalenderfürMein Team“ **und** „Buchungen für Juli 2026“ + SCHICHTFREI/GE/KO.

**Kernproblem:** Split-Layout Team 300px + Buchungen 36px im ~396px-Clip. Day/`ColHeader` praktisch tot (`h=0`).

---

## CSS / Layout-Experimente — Fail vs Breakthrough

### Historisch (frühere Session, dokumentiert)

| ID | Experiment | Ergebnis | Verdict |
|----|------------|----------|---------|
| H1 | Horizontal scroll / `scrollIntoView` Buchungsplan | Team+Buchungen festes Split, kein Overflow; rechts bleibt ~36px | **FAIL** |
| H2 | SmartEdin→Export→LAGSDZPG **ohne** Layout-Fix | LAGSDZPG-Klick ok, **kein** Herunterladen | **FAIL** (Kontext/Clip) |
| H3 | `display:none` auf Team-Panel | Team weg; Right ~breit / `innerWidth` teils 1280; SmartEdin bei y≫Clip | **TEIL-BREAKTHROUGH** Layout; SmartEdin off-clip |
| H4 | SmartEdin `position:fixed` / zoom / `min-width:1280` aggressiv | grau / SmartEdin weg / „Entfernen des Smarten Dings war erfolgreich“ | **FAIL / schädlich** |
| H5 | Holen-Automation (App-Tap) | landet Team-Kontext → *„Für dieses Team kann kein Zeitprotokoll…“* / Dialog-Timeout | **FAIL** — nicht nutzen |

### Live 2026-07-24 (`/tmp/loga3-shots/manual-path/`)

| ID | Experiment | Messung | Verdict |
|----|------------|---------|---------|
| **CSS0** | Baseline nach ÖFFNEN#1 | Team 300×399, Right 36×399, Cols 17×0, Smart 50×50 im Clip | Ist-Zustand |
| **CSS1** | `display:none !important` auf `.MyCalLeftPanel` | Team 0×0; **Right bleibt 36×399**; Cols weiter h=0; Smart **noch im Clip**; kein „Smarten Ding entfernt“ | **FAIL** für Day-Breite (Hide allein expandiert Right **nicht** in diesem Lauf) |
| **CSS1+scroll** | `scrollIntoView` Header/Picker/Smart | Smart weiter im Clip; **0** Cols mit h>0 | **FAIL** |
| **CSS2** | `<style>` `min-width` auf `.ZDMaskWrapper` + `.ColHeader{min-height:20px}` | Cols → 28×20 aber **y≈-183** (über Clip); Smart → **x856,y864 off-clip** | **FAIL** (künstliche Höhe, Smart zerstört) |
| **CSS3** | Team hide + `.ZDMaskWrapper{left:0;width:100%;height:100%;position:absolute}` | Right **36→336×399** @ x=60; Smart **bleibt** 50×50 @ 352,355 im Clip; Cols weiter h=0 @ y=-175; kein Smart-Entfernen | **TEIL-BREAKTHROUGH** Breite; Day-Cols weiter tot |
| **CSS3+Export** | SmartEdin→Export→LAGSDZPG Instant-Click (nach CSS3) | Klicks ok; **kein** Herunterladen | **FAIL** Dialog |
| **CSS3+Hold** | LAGSDZPG mousedown 1.1s + mouseup/click (Desktop-Parity) | Hold ok @ 294,267; **kein** Herunterladen-Wort im Body | **FAIL** Dialog |
| **OV1** | `elementFromPoint` + SPEICHERN-Map (User-Hypothese) | siehe Abschnitt **Overlay** unten | **BESTÄTIGT** Header/Toolbar + SmartPanel liegen über Buchungsfläche |
| **CSS4** | Hide `.RightPanel`/SPEICHERN + shrink `.ZDHeaderPanel` + ColHeader scroll | RightPanel h≈10 opacity0 pe:none; **Cols 6× im Clip** (17×18 @ y=50); Header bleibt 48px Titel+Pfeile; SmartPanel **noch offen** z=10002 | **TEIL-BREAKTHROUGH** Cols; SPEICHERN weg; Rest-Cover = Header-Container + SmartPanel |
| **R2 2026-07-24** | Frischer Login → ÖFFNEN (wait Picker) → CSS3→4→**CSS5** → Export | Login ok; Picker nach ~10s; CSS3 mask 36→336; CSS4 **24 Cols im Clip**; CSS5 header **28px**, body y=28 h=340; SmartEdin→Export→LAGSDZPG Hold ok; **kein Herunterladen** | Layout besser; Dialog weiter **FAIL** |

### CSS5 (Header kollabieren)

```css
.ZDHeaderPanel { max-height:28px; height:28px; overflow:hidden; pointer-events:none; }
.ZDBodyPanel { min-height:340px; }
```

Gemessen: Header 336×28 @ y=0; Body 336×340 @ y=28; colsInClip=24; kein „Smarten Ding entfernt“.

### Was überdeckt *jetzt* noch (cover-now.json)

| Layer | Selector | Box | Urteil |
|-------|----------|-----|--------|
| Titel-Header (noch da) | `.ZDHeaderPanel` | 336×**48** @ y=0 | Container vom Header — **ja**, nimmt oben Platz; Inhalt jetzt nur „Buchungen für…“ + `ic-previous`/`ic-next` |
| SPEICHERN-Leiste | `.RightPanel` | h=10, opacity0, pe:none | **entschärft** (CSS4) |
| Mask-Shell | `.ZDMaskWrapper` / `.LG-GlassPanel` / `.LG-GlassPanel-Content` / `mask-LZWZEITD` | 336×399 full clip | Parent-Container um Header+Body — nicht „fremd“, aber `overflow:hidden` clippt |
| SmartEdin-Menü | `.LGSMartThingMainPanel` | 305×157 @ y=242 **z=10002** | **ja, deckt Buchungen unten zu** (noch offen) |
| ColHeader | `.ColHeader` | 17×18 @ y=50 | endlich im Clip (CSS4) |

**Antwort auf User:** Ja — der **Header-Container** (`.ZDHeaderPanel`) liegt noch drauf (48px). SPEICHERN-Icons sind weg. Zusätzlich deckt das **offene SmartEdin-Panel** den unteren Buchungsbereich zu.

### Weißer Block über Buchungstabelle (2026-07-24, cover-now)

**Nicht SmartEdin.** Ursache gemessen:

| Element | Vorher | Bedeutung |
|---------|--------|-----------|
| `.L3ZeitdatenFixedWidthGridView` | **w=30** in Body w=336 | Grid-Viewport nur 30px → Rest wirkt wie großer weißer Block |
| `.TableWrapper` / `.LGDndTableWrapper.ZeitDatenMaske` | w=562 @ x=-21 | echte Tabelle existiert, aber geclippt/versetzt |
| `.LG-GlassPanel` | weiß full | Hintergrund der leeren Fläche |
| `.ZDMaskWrapper` | box-shadow | sieht aus wie schwebende weiße Karte |

**CSS7/7b:** Glass transparent + Shadow weg; Grid auf **100%** (30→336). SmartEdin unberührt.

### Overlay: SPEICHERN + Symbole überdecken Buchungen (2026-07-24)

User: Buchungs-Grid wird von anderem DOM mit SPEICHERN/Symbolen überdeckt. CDP (`overlay-speichern.json`):

| Layer | Selector | Box (Clip 396×399) | Rolle |
|-------|----------|--------------------|-------|
| Header Titel | `.ZDHeaderPanel` | 336×55 @ y=0 | „Buchungen für Juli 2026“ + SPEICHERN-Text |
| Toolbar rechts | `.ZDHeaderPanel .RightPanel` | 293×45 @ y=50 | **SPEICHERN** + Icon-Leiste |
| Save-Button | `[data-uin="btn-save"]` | 103×30 @ y=60 | disabled `LG-Button-up-disabled` |
| Save-Icon | `.ic-save` | in Toolbar | Symbol |
| Nav links | `.LGAppToolbar` | 60×399 @ x=0, **z=9** | P&I / Symbole |
| SmartEdin Panel (offen) | `.LGSMartThingMainPanel` | 305×157 @ y=242, **z=10002** fixed | Export-Menü **über** Buchungen |
| Smart-Close | `.LGSTRoundButton…Close` | 50×50 @ 352,355, **z=10003** | |

**Wichtig:**
- Am LAGSDZPG-Punkt (294,267) liegt top = LAGSDZPG selbst (Klick trifft die Kachel) — SPEICHERN blockiert **den Klick auf LAGSDZPG nicht**.
- `ColHeader` sitzt bei **y≈-175** (über dem Clip) → Day-Grid ist **unter/hinter** dem Header-Stack rausgescrollt bzw. gequetscht; sichtbare Tageszahlen ≠ gesunde ColHeader-Höhe.
- Vermutung Dialog-Fail: ZP-Aktion braucht sichtbares Buchungs-Grid / korrekten Mask-Kontext; Header+Toolbar+SmartPanel fressen den Clip, Grid effektiv „zugedeckt“.

**Nächstes CSS-Experiment (CSS4) — Vorschlag:**
1. `.ZDHeaderPanel .RightPanel` / Toolbar-Icons: `pointer-events:none` **oder** Höhe kollabieren (nicht ganz Header killen — Monatstitel behalten)
2. Optional: `.ZDBodyPanel` / Grid nach unten schieben / `scrollTop` so dass `ColHeader` y≥0 und h>0
3. Danach erst LAGSDZPG erneut (ein Versuch)

### Was als Breakthrough zählt

- [x] ÖFFNEN **Zeiten** (nicht PEP) → Picker + Buchungen-Text
- [x] Team-Panel-Selector: `.MyCalLeftPanel.ZDLeftPanel` (300px)
- [x] **CSS3**: Buchungs-Panel auf ~volle Clip-Breite (336) ohne SmartEdin zu killen
- [x] **CSS4 + CSS5 lite + CSS7**: Grid sichtbar; SPEICHERN weg; Header-Pfeile bleiben
- [x] **Zeitprotokoll generieren → PDF-View** (User 2026-07-24)
- [x] Monatsnavigation (`ic-next`) → Picker + Tabelle updaten (Juli→August, Layout-CSS an)
- [ ] PDF für zweiten Monat nach Nav

---

## DOM-Selektoren Team / Buchungen (für CSS)

| Rolle | Selector | Notes |
|-------|----------|-------|
| Team links | `.MyCalLeftPanel.ZDLeftPanel` | ~300px; „KalenderfürMein Team“ |
| Team innen | `.MCColleaguePanel`, `.BottomArea` | nested |
| Buchungen rechts | `.ZDMaskWrapper` | wird auf ~36px gequetscht |
| Monat | `#ZeitdatenMonthPicker` | |
| Header Buchungen | `.ZDHeaderPanel` | Titel + SPEICHERN-Zeile |
| Toolbar SPEICHERN/Icons | `.ZDHeaderPanel .RightPanel`, `[data-uin="btn-save"]`, `.ic-save` | **überdeckt** oberen Buchungsbereich |
| Buchungs-Body | `.ZDBodyPanel` | unter Header; ColHeader oft y&lt;0 |
| Mask | `[data-uin="mask-LZWZEITD"]` | `LG-SimpleMaskLayout` |
| Nav-Chrome | `.LGAppToolbar` | z=9, 60px links |
| Smart panel | `.LGSMartThingMainPanel` | z=10002 fixed, über Buchungen wenn offen |
| SmartEdin | `[data-uin="ic-smartedingeborder"]` | |
| Export | `[data-uin="smartthing-cat-exports"]` | |
| ZP | `[data-uin="smartthing-LAGSDZPG"]` | |
| Download | sichtbarer Text `/^Herunterladen$/` | kein fuzzy pdf/download |

---

## Offene Optionen (noch nicht Breakthrough)

| # | Option | Status |
|---|--------|--------|
| 1 | CSS3 Right-force | [x] Teil-Breakthrough |
| 5 | Overlay SPEICHERN/Toolbar gemessen (OV1) | [x] bestätigt |
| 5b | **CSS4** Toolbar/Header entschärfen + ColHeader in Clip | **nächster Versuch** |
| 2 | WebView-Host-Höhe erhöhen | offen |
| 3 | `Loga3WebView` Scale/Viewport | offen |
| 4 | LOGA3-UI „Team einklappen“ ohne CSS | suchen |
| 6 | Anderer PDF-Pfad ohne SmartEdin | bisher keiner |

**Verboten:** Holen-Tap als DOM-Ersatz · `pm clear` · Retry-Spam · blindes Team-CSS ohne Messung · SmartEdin „entfernen“.

---

## Arbeitsprotokoll Agent

1. Manuell CDP (inline), **keine** `tests/e2e/dom-step|zeitprotokoll|holen`-Orchestrierung  
2. Bereits bewiesene Schritte (ÖFFNEN Zeiten) **sofort** ausführen, nicht neu fragen  
3. Jedes CSS/Klick: Shot + JSON unter `/tmp/loga3-shots/manual-path/` + Zeile in dieser Tabelle  
4. Bei „Smarten Ding entfernt“ / Team-Fehlertext → **STOP**, als FAIL loggen  

---

## Nächste Schritte (Checkbox)

- [x] ÖFFNEN Zeiten #1 geklickt (2026-07-24)
- [x] Baseline + CSS1/CSS2/CSS3 gemessen und hier eingetragen
- [x] CSS3 = Teil-Breakthrough (Right 36→336); Export-Kette klickbar
- [x] LAGSDZPG Instant-Click → **kein** Herunterladen (FAIL dokumentiert)
- [x] LAGSDZPG **Hold ~1s** → ebenfalls **kein** Herunterladen (FAIL)
- [x] Overlay SPEICHERN/Toolbar / SmartPanel dokumentiert (OV1)
- [x] **CSS4** + **CSS5 lite** + **CSS7**: Layout + ZP → PDF-View (**OK**)
- [x] Bundle in App: `layoutFixInject.ts` / `Loga3WebView` (`bootInject`)
- [x] Monats-Pfeile: Header + Grid wechseln (**Juli→August 2026**, CSS aktiv, `MONTH_NAV_OK`)
- [ ] Holen/`fetchJob` mit Bundle ohne CDP
- [ ] Zeitprotokoll erneut nach Monatswechsel
