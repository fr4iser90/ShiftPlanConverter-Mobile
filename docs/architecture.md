# Architektur — LOGA3 Mobile

```
┌─────────────────────────────────────────┐
│  LOGA3-Automation-Mobile (Expo)         │
│  ┌─────────┐  ┌──────────┐  ┌────────┐ │
│  │ Import  │→ │ Convert  │→ │ Export │ │
│  │ PDF     │  │ Preview  │  │ ICS/GCal│ │
│  └─────────┘  └──────────┘  └────────┘ │
│         │             │                 │
│         ▼             ▼                 │
│   expo-file-system   packs/ (builtin)   │
└─────────────────────────────────────────┘
                    │ Phase C (später)
                    ▼
┌─────────────────────────────────────────┐
│  LOGA3-Automation (Desktop / optional   │
│  headless API) — Playwright Fetch       │
└─────────────────────────────────────────┘
```

## Module (Zielstruktur unter `app/`)

```
app/
  app/                 # Expo Router screens
    (tabs)/ or stack:
      index.tsx        # Import
      preview.tsx
      export.tsx
      settings.tsx
  src/
    convert/           # Port aus Desktop converter/
    packs/             # Builtin JSON + loader
    sync/              # ics.ts, google.ts
    support/           # anonymize + mailto/share
    i18n/
  assets/
```

## Datenfluss Convert

1. PDF → ArrayBuffer  
2. `extractTextFromPdfBuffer` (pdf.js)  
3. `parseStElisabeth(text)` → Roh-Einträge  
4. `parseTimeSheet(..., mapping, parser)` → kalenderfertige Entries  
5. Preview / ICS / Google  

Mapping-Pfad wie Desktop: nur `supported`-Areas; Presets mit `isValidated: true`.

## Google OAuth (Mobile)

- Eigener OAuth-Client Typ „Android“ / „iOS“ in Google Cloud (nicht derselbe Web-Client wie Desktop `127.0.0.1:3847`)  
- Redirect: Expo Auth Session / App Scheme  
- Sync-Strategie: wie Desktop — eigener Kalender empfohlen, Wipe im Datumsbereich dokumentieren  

## Packs

ZIP-Format identisch zu Desktop (`packs/README.md` im Desktop-Repo).  
Builtin: Dateien unter `app/src/packs/builtin/st-elisabeth-leipzig/`.

## Warum kein Playwright hier

Playwright braucht eine volle Browser-Runtime. Auf iOS/Android als Store-App: Größe, RAM, Policy, Wartung. Fetch bleibt Desktop oder Phase-C-Backend.
