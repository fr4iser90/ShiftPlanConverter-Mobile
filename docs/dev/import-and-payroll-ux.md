# Import + Verdienst — UX & Architektur (Zielbild)

Stand: 2026-08-01 · Produkt: generisch, Pack/AG macht’s schärfer.

Verwandt: [`architecture.md`](./architecture.md), [`refactor-sources.md`](./refactor-sources.md), LOGA3 unter `src/sources/webview/loga3/{shared,shift,payslip}/`.

## Kurzentscheidungen

| Thema | Entscheidung |
|--------|----------------|
| Ein Holen-Trichter | **Import** = eine Fläche für Quellen (LOGA3 / Datei / Foto) |
| Zwei Stores | Dienstplan → `entries` · Verdienstnachweis → `payslips` |
| Check | Tab **Prüfung** = Vergleich (nur wenn Pack `payroll.supported`) — kein zweiter Import |
| LOGA3 UI | Nach Tap auf Quelle **LOGA3**: Unterwahl **Shift / Verdienst** (Badges oder Segment) |
| Auto-Detect | Langfristig nach Bytes/OCR; Override behalten wenn unsicher |
| JSON-Step-Engine | **Nein** — imperative Jobs + Classifier |

Heute (Übergang → Stufe 1–3): Import hat LOGA3-Segment Shift/Verdienst + PDF-Classifier; Prüfung = Check/Tarif + Link „VN im Import laden“.

---

## Ziel-Datenfluss

```
Quelle (LOGA3 | Datei | Kamera)
  → Artifact (PDF / Text / Bild)
    → classifyKind  →  shift | payslip | unknown
      → shift   → ingest → entries → Kalender
      → payslip → upsert → payslips → (optional) Prüfung
      → unknown → User wählt Art (Override)
```

Pack steuert:

- welche Sources sichtbar sind (`supportedSourceIds`)
- ob Prüfung-Tab existiert (`payroll.supported`)
- Parser/Mappings (besser als Generic)

Ohne Pack: Generic-Heuristik + manuelle Overrides.

---

## UI — Import (Ziel)

```
┌─────────────────────────────────────────┐
│  Import                                 │
├─────────────────────────────────────────┤
│  Quelle                                 │
│  ┌──────────┐  ┌─────────────┐          │
│  │  LOGA3   │  │ Datei&Foto  │   …      │
│  └────┬─────┘  └─────────────┘          │
│       │                                 │
│       ▼  (nur wenn Quelle = LOGA3)      │
│  ┌─────────┐  ┌──────────────┐          │
│  │ Shift   │  │ Verdienst    │  ← Badge │
│  │ (aktiv) │  │              │    oder  │
│  └─────────┘  └──────────────┘  Segment │
│                                         │
│  Monat / Jahr  [ Jun ][ Jul ]  2026      │
│  [ Holen / Importieren ]                │
│                                         │
│  Zuletzt importiert                     │
│  • Jul 2026 · Dienstplan      → Kalender│
│  • Jun 2026 · Verdienstnachweis → Prüfun│
└─────────────────────────────────────────┘
```

### LOGA3: Badges / Unterwahl

Ja: nach Klick auf **LOGA3** (oder sobald LOGA3-Chip aktiv):

- **Shift** → Zeiten / Zeitprotokoll (`job="shift"`, `runFetchJob`)
- **Verdienst** → Private Cloud / VN (`job="payslip"`, `runPayslipFetchJob`)

Nicht zwei getrennte Source-Chips „LOGA3-Zeiten“ und „LOGA3-VN“ in der ersten Reihe (zu laut). Eine Portal-Quelle, dann Job-Segment.

Wenn Pack **kein** Payroll hat: Verdienst-Badge ausblenden (nur Shift).

### Datei & Foto

Kein Shift/VN-Segment nötig, wenn **Classifier** greift:

- PDF riecht nach VN → `payslips`
- PDF/OCR riecht nach Dienstplan → `entries`
- unklar → kurzer Dialog: „Dienstplan oder Verdienstnachweis?“

Optional später: Segment als Override vor dem Import.

---

## UI — Prüfung (Ziel)

Nur sichtbar wenn Pack Payroll kann.

```
┌─────────────────────────────────────────┐
│  Prüfung                                │
├─────────────────────────────────────────┤
│  Verdienstnachweis  [ Jun 2026 ▾ ]       │
│  (Liste der payslips, antippen)         │
│                                         │
│  Tarif / Gruppe / Stufe …               │
│                                         │
│  Check vs Dienste (entries)             │
│  ✓ / ✗ Positionen                       │
│  [ Fehlende Dienste → Import Jun ]      │
└─────────────────────────────────────────┘
```

Kein zweites „LOGA3 holen“-Haupt-UI hier (höchstens Kurzlink „VN nachladen“ → Import mit Badge Verdienst + Monat).

---

## Stufen (Arbeit schneiden)

| Stufe | Was | Aufwand |
|-------|-----|---------|
| **0 (jetzt)** | LOGA3 split `shared/shift/payslip` | done |
| **1** | `classifyKind` + Datei-Import routed | done |
| **2** | Import-UI: LOGA3-Segment Shift/Verdienst; VN-Holen auf Import | done |
| **3** | Prüfung nur Check + Liste; Intent „fehlende Dienste“ / „VN nachladen“ | done |
| **4** | OCR/Foto in denselben Classifier; weniger manuelle Overrides | offen |
| **5** | LOGA3 „smart“ (beide Jobs / Auto) — optional, Portal bleibt zwei Pfade | offen |

Nicht Stufe 5 vor 1–2.

---

## Was wir bewusst nicht tun

- VN und Schichten in denselben `entries`-Store mischen
- JSON-Workflow-Engine für Portal-Klicks
- Import-Tab zum Abrechnungs-Dashboard aufblasen
- Auto-Detect ohne Override (Portal-UI und PDFs sind zu uneinheitlich)

---

## Offene Produktfragen (kurz)

1. Default-Badge bei LOGA3: letzter Job vs immer Shift?
2. Nach VN-Import: automatisch zu Prüfung springen oder Toast + bleiben?
3. Mehrere VN pro Monat: neueste gewinnt oder Liste erzwingen?
