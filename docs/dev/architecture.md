# Architecture — ShiftPlan Converter

Everything runs **on-device**. The Expo project lives at the **repo root** (not a nested Expo project folder). `app/` is only the Expo Router tree.

**Target modular flow** (Phases 1–5 landed — see [`refactor-sources.md`](./refactor-sources.md)):

```
Source (loga3-webview | local-files | …)
  → SourceArtifact (PDF / text / csv / ics)
  → Pack (mapping + parserId) + convert/
  → ShiftEntry store  (ingestArtifacts)
  → Sink (ICS / Google ExportTarget)
```

## Modules (today)

```
app/                      # Expo Router
src/
  sources/                # Source registry + local-files + camera-ocr
  sources/webview/        # Shared bridge/wait/pdfStore + site plugins
  sources/webview/loga3/  # LOGA3 WebView site plugin
  sources/ocr/            # OCR engine: capture, layouts, month-matrix
  packs/                  # Employer packs: JSON config + mappings + parsers/*.json
  ingest/                 # Artifact → ShiftEntry + store merge
  convert/parsers/        # PDF + OCR engine registries
  convert/parsers/engines/# PDF engines (list, timesheet, auto, payroll)
  convert/parsers/ocr/    # Shared OCR mapping engine (applyPackMapping, rosterEngine)
```

Security checklist: [security-audit.md](./security-audit.md). Roadmap: [roadmap.md](./roadmap.md).  
Import / Verdienst UX-Zielbild (UI-Skizzen, LOGA3 Shift vs VN): [import-and-payroll-ux.md](./import-and-payroll-ux.md).

## Fetch data flow

1. `runSourceAndIngest` → Source.run (LOGA3 WebView or file picker)
2. Artifacts (PDF bytes / text / csv / ics)
3. `ingestArtifacts` → pack parser → store + widgets
4. Preview / Export targets

## Convert data flow

1. PDF → text (or CSV/ICS parse)
2. `parserId` from pack → `convertRawText` / mapping
3. Preview / ICS / Google

## Google OAuth

Android: native Google Sign-In (Play Services) — see [google-oauth-android.md](./google-oauth-android.md).  
Sync: prefer a dedicated calendar; warn on primary.

## Packs vs site plugin

| Concern | Owns | Example |
|---------|------|---------|
| **Source plugin** (`sources/webview/loga3/`) | LOGA3 portal clicks, DOM, layout CSS | `öffnen`, `Zeiten`, Zeitprotokoll |
| **Pack** (`packs/builtin/…`) | JSON only: `config.json`, `mappings/`, `parsers/ocr.json`, `parsers/pdf.json` | St. Elisabeth · Pflege · OP |
| **PDF** (`parsers/pdf.json` → `convert/parsers/engines/`) | Select PDF engine + match targets (regexes) | `pdf-payroll`, `pdf-auto` |
| **OCR** (`parsers/ocr.json` → engine `ocr-roster`) | Select shared OCR engine + layouts; codes from mapping JSON | `usePackMapping: true` |
| **Registry** (`convert/parsers/`) | PDF `engine` + OCR `engine` → app engines | `pdf-auto`, `ocr-roster` |

Schema: [`src/packs/pack.schema.json`](../../src/packs/pack.schema.json).

**Direction:** new AG = new pack folder with JSON only. Engines stay in `convert/`.

Same LOGA3 site → usually one automation plugin. New employer → new pack (+ parser if the PDF differs). Another HR portal → new Source plugin, not only a pack.

Fetch UI lists only `supportedSourceIds` for the active pack; default is `preferredSourceId` (clamped if the stored source is unsupported). A PDF-only pack can omit `loga3-webview`.

German strings in automation/parsers are **match targets**, not app UI — do not put them in i18n (see Cursor rule `portal-pdf-literals`).

## Localization

- **Docs / README:** English
- **In-app UI:** `src/i18n/de.ts` + `en.ts`, switched in Settings (locale in AsyncStorage)
- **Not localized:** LOGA3 portal selectors, PDF/parser regexes, pack mapping keys tied to payroll codes

OCR camera Source (spike): [`ocr-camera-source.md`](./ocr-camera-source.md).
