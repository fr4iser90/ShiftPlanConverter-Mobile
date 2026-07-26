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
  sources/                # Source registry + local-files + loga3 adapter
  sources/webview/        # Shared: bridge, wait, PDF poll, pdfStore
  sources/loga3/          # LOGA3 site plugin (automation, WebView shell)
  ingest/                 # Artifact → ShiftEntry + store merge
  convert/parsers/        # Parser registry
  convert/ packs/ sync/ widget/ …
```

Security checklist: [security-audit.md](./security-audit.md). Roadmap: [roadmap.md](./roadmap.md).

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
| **Source plugin** (`sources/loga3/`) | LOGA3 portal clicks, DOM, layout CSS | `öffnen`, `Zeiten`, Zeitprotokoll |
| **Pack** (`packs/builtin/…`) | Employer scope + `parserId` + mapping | St. Elisabeth · Pflege · OP |
| **Parser** (`convert/parser-*.ts`) | PDF/text shape for that `parserId` | `Abrechnungsmonat`, `Übertrag…` |

Same LOGA3 site → usually one automation plugin. New employer → new pack (+ parser if the PDF differs). Another HR portal → new Source plugin, not only a pack.

Fetch UI lists only `supportedSourceIds` for the active pack; default is `preferredSourceId` (clamped if the stored source is unsupported). A PDF-only pack can omit `loga3-webview`.

German strings in automation/parsers are **match targets**, not app UI — do not put them in i18n (see Cursor rule `portal-pdf-literals`).

## Localization

- **Docs / README:** English
- **In-app UI:** `src/i18n/de.ts` + `en.ts`, switched in Settings (locale in AsyncStorage)
- **Not localized:** LOGA3 portal selectors, PDF/parser regexes, pack mapping keys tied to payroll codes

OCR camera Source (spike): [`ocr-camera-source.md`](./ocr-camera-source.md).
