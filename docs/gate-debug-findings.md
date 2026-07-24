# Gate / PDF-fetch notes

## Task

Nur **eigenes Zeitprotokoll-PDF** (Dienstplan). Keine Team-UI anfassen.

## Detect / Fail

- `WRONG_EXPORT` — Abrechnungs-Dialog statt Zeitprotokoll
- `NO_PLAN` — Monat ohne Plan → skip
- `BAD_CREDENTIALS` — Login

Sidebar-/Chrome-Texte sind irrelevant. Nie Team navigieren.

## Scripts

- App: keine Shell/Python nötig
- Dev: `scripts/dev/`
- Live-E2E: `tests/e2e/`
