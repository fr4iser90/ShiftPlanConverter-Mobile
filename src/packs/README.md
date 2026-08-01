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

## Smoke default

```json
"isSmokeDefault": true,
"smokeWorkplace": { "groupId": "…", "areaId": "…", "preset": "…" }
```

Schema: `pack.schema.json`.
