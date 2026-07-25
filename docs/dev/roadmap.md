# Roadmap — offene Punkte

Stand: 2026-07-25. Fertige Phasen (Scaffold, Live-Fetch für getestetes Pack, ICS/Google, Widgets, Rename) stehen in README + CHANGELOG — nicht hier.

## Zielbild: generischer Converter

Heute ist Fetch ≈ LOGA3-WebView und Parser ≈ ein Pack. Soll werden:

```
Packs (Arbeitgeber)           ← schon ansatzweise da
  └─ mapping + parser preset

Sources (Eingang)             ← klar trennen
  ├─ loga3-webview            (aktuell)
  ├─ other-site webview       (bei Bedarf, eigene Automation)
  └─ local files              (PDF / CSV / ICS — kein Login)

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
| **6 2nd WebView** | open | nur bei konkretem zweiten AG |

Nicht alles vor dem ersten Store-Build: Local-PDF ist der Store-Mehrwert; zweites Site-Plugin warten.

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
