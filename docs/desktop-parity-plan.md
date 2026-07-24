# Desktop ↔ Mobile parity — selectors, drift, fix plan

Source of truth: Desktop `LOGA3-Automation/src/loga3-workflow.js` (`runDownloadPipeline`).  
Mobile: `src/loga3/fetchJob.ts` + `src/loga3/automation.ts`.

**Rule:** Success = DOM postcondition. Click-ok alone never advances. Device size must not change the path.

---

## A) Canonical selectors (Desktop — bind Mobile to these)

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

---

## B) Mobile today — same vs drift

### Same (keep)

- UIN path for SmartEdin / Export / LAGSDZPG (preferred)
- `#ZeitdatenMonthPicker` for month
- Content signature / NO_PLAN idea
- softProbe for **IPC silence only**
- Fullscreen WebView while `busy`
- PDF capture inject + Download-folder fallback (Android transport)

### Drift (must fix)

| # | Drift | Desktop | Mobile now | Fix |
|---|-------|---------|------------|-----|
| 1 | Einstieg | `öffnen` → wait picker | `öffnen` **or** loose `clickZeiten` fallback | Zeiten only last resort; postcondition = picker; prefer mask `mask-LZWZEITD` |
| 2 | Kontext | implicit Eigen | no sidebar gate | **assertZeitdatenPickerReady** before export |
| 3 | SmartEdin | required + wait Export panel | optional skip | **required**; wait `smartthing-cat-exports` |
| 4 | Export | required + wait LAGSDZPG | optional “direkt ZP” | **required**; wait LAGSDZPG |
| 5 | ZP click | UIN only + hold | UIN + text fallback + **Enter spam** | UIN only (text exact “Zeitprotokoll generieren” only if UIN missing); **no Enter** |
| 6 | Download | exact Herunterladen | `herunterladen\|download\|speichern\|pdf` | **exact Herunterladen** only |
| 7 | Abrechnung errors | N/A in happy path | 90s wait / wrong dialog | detect → `WRONG_EXPORT` / `WRONG_EXPORT` fail-fast |
| 8 | Dialog recovery | fail | re-click Export/ZP once | keep max 1; abort on team/abrechnung text |

---

## C) Target state machine (device-agnostic)

```
ensureLoggedIn
  → softProbe ok / BAD_CREDENTIALS hard fail
ensureZeitdatenPicker
  → clickOeffnen → wait #ZeitdatenMonthPicker
  → ignore left-rail sidebar chrome; scroll picker into view
for each month:
  selectMonth → verify header+content
  assertHasPlan | NO_PLAN skip
  clickSmartEdin → wait Export panel (hard)
  verify month still valid
  clickExport → wait LAGSDZPG (hard)
  openZeitprotokoll (UIN+hold) → wait dialog | WRONG_EXPORT / WRONG_DIALOG fail
  clickDownload (Herunterladen exact) → PDF
  validatePdfPeriod → convert → closeDialog
```

---

## D) Implementation checklist (code changes)

### `automation.ts`

1. Add `assertExportContext` (or extend shell/picker probe):
   - `blocked` if sidebar / team ZP text
   - `pickerFound`, `maskFound` (`mask-LZWZEITD`)
2. `clickSmartEdin`: after click, do not return success until Export menu exists (or post `exportPanel:false`)
3. `clickExport`: prefer UIN only; post whether LAGSDZPG visible
4. `openZeitprotokoll`: remove Enter key spam; require UIN or exact label on `LGSmartThingContentItem`
5. `clickDownload`: match only `/^Herunterladen$/i` on visible button/PrimaryButton (length bound); never `pdf|speichern|download` alone
6. Extend dialog probes: `WRONG_EXPORT` if Abrechnung-unavailable without Herunterladen

### `fetchJob.ts`

1. After picker ready: wait `#ZeitdatenMonthPicker` (ignore sidebar sidebar text)
2. SmartEdin: **not** optional — must succeed or wait for Export panel
3. Export: **not** optional — must see LAGSDZPG before ZP
4. In `assertZeitprotokollDialog`: fail immediately on `WRONG_EXPORT` / Abrechnung-wrong-dialog samples
5. Keep softProbe only for silence

### UI (already partly done)

- Keep fullscreen WebView during busy
- Do not reintroduce 360px card for fetch

### Docs

- Update `docs/fetch-steps.md` to match this machine
- This file remains the selector/plan source

---

## E) Validation plan (Moto G73)

1. `assembleRelease` → `adb install -r` on `ZY22J3RHFC`
2. Launch → Holen + Google (07–09 window or single month with plan)
3. Expect: fullscreen WebView; status either PDFs or clear `WRONG_EXPORT` / `NO_PLAN`
4. Screenshot + UI dump at: after shell, after picker, after export, after download
5. Emulator smoke optional sanity

---

## F) Explicit non-goals (this pass)

- Rewriting converter / Google sync
- iOS-only paths
- Making SmartEdin optional again
- Width/wm-size as success criterion
