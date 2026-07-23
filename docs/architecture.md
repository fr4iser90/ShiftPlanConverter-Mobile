# Architecture — LOGA3 Mobile

Everything runs **on-device**. The Expo project lives at the **repo root** (not a nested Expo project folder). `app/` is only the Expo Router tree.

```
┌──────────────────────────────────────────────────┐
│  LOGA3-Automation-Mobile (Expo / RN)             │
│                                                  │
│  ┌────────────┐   ┌──────────┐   ┌────────────┐ │
│  │ Fetch      │→  │ Convert  │→  │ Export     │ │
│  │ WebView    │   │ Preview  │   │ ICS/GCal   │ │
│  │ + LOGA3 JS │   │          │   │            │ │
│  └────────────┘   └──────────┘   └────────────┘ │
│         │               │                        │
│         ▼               ▼                        │
│   local PDFs       src/packs/builtin             │
│   Secure Store                                   │
└──────────────────────────────────────────────────┘
```

## Modules

```
app/                      # Expo Router
  (tabs)/
    index.tsx             # Fetch + months + WebView job
    preview.tsx
    export.tsx
    settings.tsx
src/
  loga3/                  # WebView automation
  convert/                # Port of desktop converter/
  packs/
  sync/                   # ICS share, google.ts
  support/
  i18n/                   # de + en UI strings
assets/ components/ constants/
```

## Fetch data flow

1. Credentials from Secure Store → WebView session
2. Drive LOGA3 UI (WebView API, same workflow as desktop)
3. Write PDF bytes into app storage
4. Convert pipeline → Preview / Export

## Convert data flow

1. PDF → ArrayBuffer
2. Extract text (pdf.js / Hermes-safe path)
3. Parser + mapping → entries
4. Preview / ICS / Google

## Google OAuth

Android: native Google Sign-In (Play Services) — see [google-oauth-android.md](./google-oauth-android.md).  
Sync: prefer a dedicated calendar; warn on primary.

## Packs

ZIP layout matches desktop. Builtin packs under `src/packs/builtin/…`.

## Localization

- **Docs / README:** English
- **In-app UI:** `src/i18n/de.ts` + `en.ts`, switched in Settings (locale in AsyncStorage)
