# Roadmap — offene Punkte

Stand: 2026-07-27. Fertige Phasen (Scaffold, Live-Fetch für getestetes Pack, ICS/Google, Widgets, Rename) stehen in README + CHANGELOG — nicht hier.

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
| **5c OCR granular** | open | Layouts + Live-Status + Unsicherheit nachfragen + Region-Tap + Auto-Snapshots — siehe unten |
| **6 2nd WebView** | open | nur bei konkretem zweiten AG |

Nicht alles vor dem ersten Store-Build: Local-PDF ist der Store-Mehrwert; zweites Site-Plugin warten.

## OCR granularer machen (5c)

Ziel: Kamera-OCR nicht als Blackbox, sondern mit klaren Layouts, Live-Feedback und gezielter User-Hilfe bei Unsicherheit. Basis: [`ocr-camera-source.md`](ocr-camera-source.md).

| Thema | Was |
|-------|-----|
| **Alle Standard-Layouts** | `month-matrix`, `week-strip`, `list-protocol`, `day-plan`, `single-calendar` (u. a.) wirklich nutzbar — nicht nur stubs; User kann Layout wählen oder `auto` |
| **Live-Status an der Kamera** | Anzeigen, was erkannt wird und was gerade läuft (Layout, Name, Datum, Zellen/Score …) |
| **Niedriger Score → nachfragen** | Bei Unsicherheit nicht raten: z. B. „Monats- oder Wochenmatrix?“; klare Entscheidung statt stiller Fallback-Kette |
| **Region-Tap bei Fehlern** | Wenn Name/Datum/Bereich nicht erkannt: User tippt auf den Bereich (Name-Spalte, Datum, …) statt alles neu zu fotografieren |
| **Auto-Snapshots bei Treffer** | Sobald etwas korrekt erkannt: gezielte Snapshots der relevanten Regionen, damit alles vollständig erfasst wird |
| **Nachfotografieren bei Bedarf** | Bei unlesbarem Bereich: Prompt „Bereich X nochmal fotografieren“ (lesbar machen), nicht blind weiterparsen |

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
