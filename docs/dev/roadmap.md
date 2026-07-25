# Roadmap — offene Punkte

Stand: 2026-07-25. Fertige Phasen (Scaffold, Live-Holen für getestetes Pack, ICS/Google, Widgets, Rename) stehen in README + CHANGELOG — nicht hier.

## Zielbild: generischer Converter

Heute ist Holen ≈ LOGA3-WebView und Parser ≈ ein Pack. Soll werden:

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

| Phase | Was | Nutzen |
|-------|-----|--------|
| **A — Grenzen** | Interface `Source` / klare Module (`sources/loga3` hinter Schnittstelle; `src/loga3/` kann vorerst bleiben) | Holen-Code nicht mehr „die App“ |
| **B — Parser-Registry** | Neuer AG = Pack + Parser, ohne Holen anzufassen | Multi-Arbeitgeber ohne Fetch-Rewrite |
| **C — Local import** | Datei wählen → PDF/CSV/ICS parsen → gleiche Preview/Export-Pipeline | Woanders arbeiten / ohne Portal-Login |
| **D — Weitere WebViews** | Zweites Site-Plugin nur bei konkretem Bedarf | Nicht spekulativ vor v1 |

Nicht alles vor dem ersten Store-Build: **A + B + Local-PDF** bringen mehr als fünf Automations-Sites.

## Ops / Store (weiter offen)

| Thema | Warum |
|-------|--------|
| **Play Store live** | EAS Production-Keystore, Listing, Data safety — [`play-store-launch.md`](play-store-launch.md) |
| **Peer-Review** | [`security-audit.md`](security-audit.md) §8 |
| **`PROJECT_PLAY_STORE`** | In `src/support/legal.ts` setzen + Rebuild, sobald Listing live |
| **Pack-Katalog** (ZIP / GitHub) | Aktuell Builtin-Packs im Code |
| **iOS Geräte-Smoke** | Config/EAS bereit; Live-Holen auf iPhone noch nicht durchgezogen |

## Nicht geplant (bewusst)

- Retries / Fallback-Klickpfade in Holen (One-path — siehe [`fetch-steps.md`](fetch-steps.md))
- Outlook Graph / CalDAV / EventKit als First-Class (ICS deckt das ab)
- Zweites Website-Automation-System **vor** erstem AAB / ohne konkreten zweiten Arbeitgeber
