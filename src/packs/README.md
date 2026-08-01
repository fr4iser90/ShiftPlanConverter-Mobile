# Packs

Employer packs are **JSON-only** under `builtin/<packId>/`.

```
builtin/<packId>/
  config.json
  parsers/ocr.json
  parsers/pdf.json
  mappings/<group>/<profile>.json
```

## Add a pack (no `index.ts` edits)

1. New folder `builtin/<pack-id>/` (same layout).
2. Fill JSON. Folder name = `packId`.
3. `npm run packs:generate`

## Compact station lists

Do **not** paste Station 1…19 by hand. Use `expand`:

```json
{
  "expand": {
    "id": "station-{n}",
    "label": "Station {n}",
    "from": 1,
    "to": 19,
    "mapping": "mappings/pflege/station-standard.json",
    "supported": false,
    "defaultPreset": "Standard",
    "overrides": {
      "16": {
        "label": "Station 16 (ITS)",
        "mapping": "mappings/pflege/station-16.json"
      }
    }
  }
}
```

Or omit placeholders until a ward is real — only list supported areas.

Shared payroll: St. Elisabeth Pflege areas can point at one `krankenhaus.payroll.json` (AVR Anlage 31 RK Ost P+EG tables). Station numbers ≠ Entgeltgruppe — user picks P8/EG… (or VN).

## Smoke default

```json
"isSmokeDefault": true,
"smokeWorkplace": { "groupId": "…", "areaId": "…", "preset": "…" }
```

Schema: `pack.schema.json`.

## Payroll numbers (`egRows`, Zulagen, …) — check before commit

Before putting € / BD tariff grids into a **public** pack file, classify the source:

1. **Officially published AVR / Vergütungstabellen** (e.g. authorised Caritas AVR online)  
   Pure table values as facts are often usable. Prefer your own JSON layout — do **not** copy original document layout, wording, or PDFs 1:1.  
   Overview: [AVR – Tarifrecht der Caritas](https://www.caritas.de/glossare/avr--tarifrecht-der-caritas) · text: [avr-caritas.de](https://www.avr-caritas.de).

2. **Copy of protected materials**  
   Layout, Erläuterungen, full wording of books/PDFs can be copyrighted → re-key numbers into our schema only.

3. **Internal employer / colleague spreadsheets**  
   Treat as confidential until you have clear permission. Do **not** commit. Use VN-only checks, user prefs, or a **gitignored** private overlay.

**Default:** only commit EG/`bd` grids when case (1) applies and `notes` cite AVR Anlage + validity date + RK (pack/AG implies region, e.g. Leipzig → RK Ost). Otherwise VN + prefs only.

Every new `*.payroll.json` with money rates: re-run this checklist in the PR.
