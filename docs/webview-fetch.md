# WebView fetch — desktop workflow → mobile

Desktop uses Playwright (`loga3-workflow.js` → `runDownloadPipeline`).  
Mobile: WebView + injected JS + `fetchJob.ts`.

## Status

| Layer | Status |
|-------|--------|
| Converter / fixture / ICS | done |
| Pre-download gates (desktop port) | wired |
| PDF capture (code) | hardened — see below |
| Live end-to-end with credentials | **green** (Jul 2026 → 14 shifts / 1 PDF; multi-month 06+07 → 28 shifts / 2 PDFs) |

## PDF capture — root cause & fix (2026-07-22)

**Historical hang:** after successful `clickDownload` → `waitForPdf` 120s timeout.

**Android cause:** `react-native-webview` does **not** emit `onFileDownload` (`setHasOnFileDownload` is a no-op). Content-Disposition often lands in system `DownloadManager` or Chromium PDF.js viewer, not the app. Blob URLs are not `fetch`-able from RN.

**Fix in code:**
1. Capture inject in **all frames** (`ForMainFrameOnly={false}` + iframe walk + `ReactNativeWebView` climb)
2. Before download: `__loga3ArmPdfCapture` — magic bytes `%PDF`, XHR/fetch, `createObjectURL`, `location`/`iframe.src`/`window.open` → `postMessage` as `pdfBlob`
3. Bridge: only Base64 with `JVBERi` (`%PDF`); failed / non-PDF probes **do not** abort the waiter
4. Fallback: poll public `Download/` + periodic `scrapePdfViewer` (PDF.js)
5. iOS: keep using `onFileDownload`; do not rely on it on Android
6. Text extract: **no** pdfjs worker on Hermes — FlateDecode/`Tj` via `fflate` (`src/convert/pdfText.ts`)

## Gates

Full step matrix (action → wait → validation): [docs/fetch-steps.md](./fetch-steps.md).

Orchestration in `fetchJob.ts` via `waitForCondition` (`src/loga3/wait.ts`):

1. Login form → submit → **shell** (`assertShellReady`: Öffnen / Zeiten / Picker — not splash)
2. **`clickOeffnen`** (desktop) → wait `#ZeitdatenMonthPicker` (Zeiten = fallback only)
3. `selectMonth` once → wait calendar header
4. Content gate (verify; optional grid reload)
5. Time-sheet dialog (billing month; max 1 re-open)
6. Download → PDF bytes (`waitForPdf` / Download folder); post-PDF `validatePdfPeriod`

No sleep/retry spam (no 20–30 blind attempts).

## Resolution matrix (Phone + Tablet)

Validate Live-Fetch on **every** common size — including tablets — before claiming DoD:

| id | Size | Density | Role |
|----|------|---------|------|
| compact | 720×1280 | 320 | small phone |
| common | 1080×2400 | 420 | mid-range / Moto-like |
| tall | 1080×2340 | 400 | 19.5:9 |
| large | 1440×3200 | 560 | high-end phone |
| tablet | 1200×1920 | 240 | 7–8″ |
| tablet_10 | 1600×2560 | 320 | ~10″ |

```bash
nix-shell --run 'python3 tests/e2e/live-smoke-matrix.py'
```

- Config: `tests/e2e/resolution-matrix.json`
- Report + screenshots: `/tmp/loga3-shots/matrix/`
- Per profile the script sets **that** size (`wm size`/`density` = matrix profile). That is intentional validation, **not** the old cheat of forcing 1280 so GWT always looks green.
- After the run: display reset to AVD default.
- Desktop LOGA3 still uses in-app CSS `width=1280` + scale (`Loga3WebView`).

## Emulator smoke (historical)

Older smokes (2026-07-22) used a hidden `wm size 1280x…` so the emulator passed while phones failed — **forbidden**. Use the matrix above instead.

```bash
nix-shell --run 'python3 tests/e2e/live-smoke-year-2026.py'   # year smoke; still no 1280-only cheat
```

Live DoD = matrix PASS (phones + tablets) **and** real phone spot-check.

## Configuration (per device)

**Setup modal** (`/setup`): tenant URL → login (Secure Store) → employer/pack → Google optional → done.  
**Fetch** only after that: months + Fetch selected / one-tap update.  
Fetch is generic; the pack drives parser/mapping.
