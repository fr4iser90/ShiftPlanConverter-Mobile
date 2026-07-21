# Architektur — LOGA3 Mobile

Alles läuft **auf dem Gerät**. Expo-Projekt liegt im **Repo-Root** (nicht in einem verschachtelten `app/`-Projektordner). `app/` ist nur der Expo-Router.

```
┌──────────────────────────────────────────────────┐
│  LOGA3-Automation-Mobile (Expo / RN)             │
│                                                  │
│  ┌────────────┐   ┌──────────┐   ┌────────────┐ │
│  │ Holen      │→  │ Convert  │→  │ Export     │ │
│  │ WebView    │   │ Preview  │   │ ICS/GCal   │ │
│  │ + LOGA3 JS │   │          │   │            │ │
│  └────────────┘   └──────────┘   └────────────┘ │
│         │               │                        │
│         ▼               ▼                        │
│   lokale PDFs      src/packs/builtin             │
│   Secure Store                                   │
└──────────────────────────────────────────────────┘
```

## Module

```
app/                      # Expo Router
  (tabs)/
    fetch.tsx             # Login + Monate + WebView-Job
    preview.tsx
    export.tsx
    settings.tsx
src/
  loga3/                  # WebView-Automation
  convert/                # Port aus Desktop converter/
  packs/
  sync/                   # ics share, google.ts
  support/
  i18n/
assets/ components/ constants/
```

## Datenfluss Holen

1. Credentials aus Secure Store → WebView-Session  
2. LOGA3 UI steuern (WebView-API, analog Desktop-Workflow)  
3. PDF-Bytes in App-Dateisystem schreiben  
4. Convert-Pipeline → Preview / Export  

## Datenfluss Convert

1. PDF → ArrayBuffer  
2. Text extrahieren (pdf.js)  
3. Parser + Mapping → Entries  
4. Preview / ICS / Google  

## Google OAuth

Eigene Android/iOS OAuth-Clients.  
Sync: eigener Kalender empfohlen; Primary warnen.

## Packs

ZIP-Format wie Desktop. Builtin unter `src/packs/builtin/…`.
