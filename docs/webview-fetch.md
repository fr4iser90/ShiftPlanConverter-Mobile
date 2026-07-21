# WebView-Fetch — Desktop-Workflow → Mobile

Desktop nutzt Playwright + Chromium (`loga3-workflow.js` → `runDownloadPipeline`).  
Mobile ersetzt das durch **In-App WebView** + injiziertes JS + Job-Orchestrator.

## Status (ehrlich)

| Stufe | Stand |
|-------|--------|
| Converter / Fixture / ICS | fertig |
| Holen-UI „Ausgewählte laden“ + `fetchJob` | verdrahtet |
| `selectMonth` (ZeitdatenMonthPicker + Popup/Chrome-Pfeile) | portiert |
| PDF-Capture (blob Hook + Android `onFileDownload`) | verdrahtet, **gerätabhängig fragil** |
| Live End-to-End mit Tenant-Creds | **noch nicht als DoD abgehakt** — Emulator-Smoke nötig |

## Abbildung der Schritte

| Desktop (Playwright) | Mobile |
|----------------------|--------|
| Browser starten, LOGA3 öffnen | `Loga3WebView` → `EXPO_PUBLIC_LOGA3_URL` (Pflicht in `.env`, kein Code-Default) |
| Login | `fillLogin` + `submitLogin` |
| Öffnen / Aktualisieren | `clickOeffnen`, `armCalendarReload` |
| Monat wählen + verifizieren | `selectMonth` (Popup + Fallback Chrome-Pfeile) |
| Plan-Gate | `assertHasPlan` → `NO_PLAN` skip |
| SmartEdin → Export → Zeitprotokoll | `clickSmartEdin`, `clickExport`, `openZeitprotokoll` |
| Download abfangen | `clickDownload` + PDF blob/`onFileDownload` → `pdfStore` |
| Dialog schließen | `closeDialog` |
| Convert | `extractTextFromPdfBuffer` → `convertPdfText` → Store/Preview |

Orchestrator: `src/loga3/fetchJob.ts` (Bridge: `src/loga3/bridge.ts`).

## Dateien

- `src/loga3/automation.ts` — Commands + injiziertes JS
- `src/loga3/fetchJob.ts` — Multi-Month-Pipeline
- `src/loga3/Loga3WebView.tsx` — WebView + PDF-Capture-Inject
- `src/loga3/pdfStore.ts` — `MM-YYYY.pdf` unter App-Documents
- Holen-Tab: **Ausgewählte laden** (Live) · **Offline-Fixture (Debug)** · Debug-Probe

## Konfiguration

```bash
cp .env.example .env
# EXPO_PUBLIC_LOGA3_URL=https://YOUR-TENANT.example/loga3/#
```

Zugangsdaten nur in der App (Secure Store), nicht in `.env`.

## Emulator-Smoke (Live)

1. `nix-shell` → `loga3-emu` → `loga3-android` (oder `npm run android`)
2. Holen → Creds speichern → Monate anhaken → **Ausgewählte laden**
3. Status-Zeile: Login → Monat → Download → Parse; Preview zeigt Schichten der gewählten Monate (nicht Fixture 09/2026)
4. Ohne Creds: Alert, kein stilles Fixture
5. Fixture-Button nur bewusst drücken (Offline)

## Bekannte Fragilität (Phase C)

- LOGA3-GWT-Selektoren ändern sich; Popup-Jahr/Monat-Navigation busy-waitet kurz im Inject
- PDF-Capture: Blob-Hook vs. nativer Download je OS/WebView-Version
- Login-Shell / „Öffnen“-Landing variiert; Timeouts müssen ggf. angepasst werden
- Kein Desktop-äquivalentes Content-Gate im Dialog („Monat bestätigt“) — vorerst `assertHasPlan` + Picker-State
