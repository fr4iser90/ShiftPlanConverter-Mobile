# Architektur — LOGA3 Mobile

Alles läuft **auf dem Gerät**. Kein Server, kein PC, kein Remote-Fetch.

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
│   lokale PDFs      packs/ (builtin)              │
│   Secure Store                                   │
└──────────────────────────────────────────────────┘
```

**Playwright-Ersatz:** In-App **WebView** (Android System WebView / iOS WKWebView). Die App steuert LOGA3 per JS (Navigation, Monatswahl, Download) — analog zum Desktop-Workflow, ohne externes Chromium/Playwright.

## Module (Ziel unter `app/`)

```
app/
  app/                    # Expo Router
    (tabs)/
      fetch.tsx           # Login + Monate + WebView-Job
      preview.tsx
      export.tsx
      settings.tsx
  src/
    loga3/                # WebView-Automation (Desktop-Workflow portiert)
    convert/              # Port aus Desktop converter/
    packs/
    sync/                 # ics.ts, google.ts
    support/
    i18n/
```

## Datenfluss Holen

1. Credentials aus Secure Store → WebView-Session  
2. LOGA3 UI steuern (wie Desktop `loga3-workflow`, aber WebView-API)  
3. PDF-Bytes in App-Dateisystem schreiben  
4. Convert-Pipeline → Preview / Export  

## Datenfluss Convert

1. PDF → ArrayBuffer  
2. Text extrahieren (pdf.js)  
3. Parser + Mapping → Entries  
4. Preview / ICS / Google  

## Google OAuth

Eigene Android/iOS OAuth-Clients (nicht Desktop `127.0.0.1:3847`).  
Sync: eigener Kalender empfohlen; Primary warnen.

## Packs

ZIP-Format wie Desktop. Builtin unter `app/src/packs/builtin/…`.

## Explizit nicht

- Backend / Desktop-Pairing als Architektur  
- LOGA3-REST-API reverse-engineern als Hauptweg  
- Playwright-Binary in der APK  
