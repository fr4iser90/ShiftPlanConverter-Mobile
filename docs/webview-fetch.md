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

Orchestration in `fetchJob.ts` via `waitForCondition` (`src/loga3/wait.ts`):

1. Login form → submit → shell (`assertLoggedIn`)
2. One `clickZeiten` → wait `#ZeitdatenMonthPicker` (max 1 recovery)
3. `selectMonth` once → wait calendar header
4. Content gate (verify; optional grid reload)
5. Time-sheet dialog (billing month; max 1 re-open)
6. Download → PDF bytes (`waitForPdf` / Download folder); post-PDF `validatePdfPeriod`

No sleep/retry spam (no 20–30 blind attempts).

## Emulator smoke (2026-07-22)

- Parallel desktop check: `loga3 fetch --months 2026-07` → `juli_2026.pdf` ok
- Mobile: viewport override **`wm size 1280x800`** (physical 320×640 breaks GWT/SmartThings — dialog never appears)
- WebView: desktop UA + viewport `width=1280`
- Flow: Fetch → select 07/2026 → Fetch selected → login → Zeiten → Export → Zeitprotokoll → download → PDF bytes → convert
- Result: **Done — 14 shifts · 1 PDF(s)**; multi-month 06+07/2026 → **28 shifts · 2 PDFs**

### Resolution note

Tiny AVD (320×640) is unsuitable for LOGA3/GWT. Aim for ~1280×720 (real `pixel_6` AVD or `adb shell wm size 1280x800`). Do not wipe credentials with `pm clear` unless intentional.

## Configuration (per device)

**Setup modal** (`/setup`): tenant URL → login (Secure Store) → employer/pack → Google optional → done.  
**Fetch** only after that: months + Fetch selected / one-tap update.  
Fetch is generic; the pack drives parser/mapping.
