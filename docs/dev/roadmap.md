# Roadmap — offene Punkte

Stand: 2026-07-27. Fertige Phasen (Scaffold, Live-Fetch für getestetes Pack, ICS/Google, Widgets, Rename) stehen in README + CHANGELOG — nicht hier.

## Packs → JSON-only

| Phase | Status | Was |
|-------|--------|-----|
| **A OCR JSON** | done | `parsers/ocr.json` → engine `ocr-roster`; keine Pack-OCR-`.ts` |
| **B PDF JSON** | done | `parsers/pdf.json` → engines `pdf-auto` / `pdf-list` / `pdf-timesheet` / `pdf-payroll` |
| **C Schema/ZIP** | open | Validierung gegen `pack.schema.json`; später ladbare Packs |

Schema: `src/packs/pack.schema.json`.

## Zielbild: generischer Converter

Heute ist Fetch ≈ LOGA3-WebView und Parser ≈ ein Pack. Soll werden:

```
Packs (Arbeitgeber)           ← schon ansatzweise da
  └─ mapping + parser preset

Sources (Eingang)             ← klar trennen
  ├─ loga3-webview            (aktuell)
  ├─ other-site webview       (bei Bedarf, eigene Automation)
  ├─ local files              (PDF / CSV / ICS — kein Login)
  └─ camera-ocr               (Foto → on-device OCR — spike)

Sinks (Ausgang)               ← schon Targets
  └─ ICS share · Google Calendar · (später mehr)
```

**Ja — Fetch muss unterschieden werden:**  
`Source` liefert Rohmaterial (PDF-Bytes / Text / CSV / ICS).  
`Pack` + `convert/` mappt das zu Schichten.  
Preview/Export bleiben source-agnostisch. LOGA3 ist nur *eine* Source-Implementierung, kein Produktkern.

## Architektur-Phasen

Detaillierter Refactor-Plan: [`refactor-sources.md`](refactor-sources.md).

| Phase | Status | Was |
|-------|--------|-----|
| **1 Ingest** | done | `ingestArtifacts` · `runFetchJob` liefert nur Artifacts |
| **2 Parser-Registry** | done | Pack `parserId` · `src/convert/parsers` |
| **3 Source-Interface** | done | `src/sources/` · LOGA3-Adapter · Setup `needsCredentials` |
| **4 WebView shared** | done | Bridge/Wait/PDF-Poll/pdfStore unter `src/sources/webview/` (loga3 re-exportiert) |
| **5 Local import** | done | `local-files` Source · Fetch tab „Datei“ |
| **5b Camera OCR** | spike | On-device photo → OCR → raw text (no ingest) — [`ocr-camera-source.md`](ocr-camera-source.md) |
| **5c OCR granular** | open | Unterphasen 5c.1–5c.5 unten |
| **6 2nd WebView** | open | nur bei konkretem zweiten AG |

Nicht alles vor dem ersten Store-Build: Local-PDF ist der Store-Mehrwert; zweites Site-Plugin warten.

## OCR granularer machen (5c)

Ziel: Kamera-OCR nicht als Blackbox, sondern mit klaren Layouts, Live-Feedback und gezielter User-Hilfe bei Unsicherheit. Basis: [`ocr-camera-source.md`](ocr-camera-source.md). Layouts bleiben in `src/sources/ocr/layouts/` — **keine** Pack-Ordner pro Layout.

| Phase | Status | Was |
|-------|--------|-----|
| **5c.1 Ask + Status** | done | Unsicherheit-Modal · Live-Status · Pack `ocr.layouts` / `preferredLayout` als Chip-Filter |
| **5c.2 week-strip** | done | Zweites Layout experimental (Grid 5–9 Tage) · Score an Parse-Qualität |
| **5c.3 Region-Tap** | done | Overlay Tippen / Nachfotografieren auf month-matrix (ein Pfad) |
| **5c.4 Auto-Snapshots** | done | Region-Snaps bei gutem Grid-Score (on-device, Compare) |
| **5c.5 Andere Layouts** | open | `list-protocol` / `day-plan` / `single-calendar` nur mit Samples — bis dahin Stubs, im Pack weggelassen |
| **5c.6 Lattice frames** | done | Professionelle H×V-Zellenrahmen + Homography-Rectification mit Qualitätsgates — [`ocr-lattice-frames-plan.md`](ocr-lattice-frames-plan.md) |

Leitplanken (wie sonst): **ein Pfad** — bei Unklarheit fragen, nicht Layout A → fail → Layout B still probieren.

## Ops / Store (weiter offen)

| Thema | Warum |
|-------|--------|
| **Play Store live** | EAS Production-Keystore, Listing, Data safety — [`play-store-launch.md`](play-store-launch.md) |
| **Peer-Review** | [`security-audit.md`](security-audit.md) §8 |
| **`PROJECT_PLAY_STORE`** | In `src/support/legal.ts` setzen + Rebuild, sobald Listing live |
| **Pack-Katalog** (ZIP / GitHub) | Aktuell Builtin-Packs im Code |
| **iOS Geräte-Smoke** | Config/EAS bereit; Live-Fetch auf iPhone noch nicht durchgezogen |

## Nicht geplant (bewusst)

- Retries / Fallback-Klickpfade in Fetch (One-path — siehe [`fetch-steps.md`](fetch-steps.md))
- Outlook Graph / CalDAV / EventKit als First-Class (ICS deckt das ab)
- Zweites Website-Automation-System **vor** erstem AAB / ohne konkreten zweiten Arbeitgeber
