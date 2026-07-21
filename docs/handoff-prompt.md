# Handoff-Prompt (für LLM / Entwickler)

Kopiere den Block unten in eine neue Agent-Session im Repo `LOGA3-Automation-Mobile`.

---

## Prompt

Du arbeitest im Repo **LOGA3-Automation-Mobile**.

Lies zuerst:
- `PLAN.md`
- `docs/architecture.md`
- Desktop-Referenz: https://github.com/fr4iser90/LOGA3-Automation (Branch `main`, besonders `converter/` und `gui/` nur als UX-Vorbild)

### Auftrag Phase 0 + A

1. Initialisiere Expo TypeScript App unter `app/` (`create-expo-app`, Expo Router).
2. Implementiere Flow: PDF importieren → parsen (St. Elisabeth) → Preview → ICS Share.
3. Portiere benötigte Converter-Logik aus dem Desktop-`converter/` (nicht Playwright, nicht GUI-Server).
4. Builtin-Mapping nur: Pflege · OP · Anästhesie (`isValidated`).
5. Kein eingebetteter Browser-Fetch. Kein Desktop-Code 1:1 klonen.

### Constraints

- Android **und** iOS (eine Codebase).
- TypeScript.
- Keine Secrets committen; Google Client IDs über Env/EAS Secrets.
- Halte `PLAN.md` Checkboxes aktuell, wenn etwas fertig ist.

### Erste Deliverables

- `npx expo start` läuft
- Fixture-PDF oder synthetischer Text → mindestens eine erkannte Schicht in Preview
- ICS kann geteilt werden

Starte mit Phase 0 Scaffold, dann Parser-Port, dann UI.

---

## Nach dem Prompt

Referenz-Checkout Desktop (read-only):

```bash
# parallel
git clone https://github.com/fr4iser90/LOGA3-Automation.git ../LOGA3-Automation
```

Fixture: anonymisierte Beispielzeilen stehen in `fixtures/sample-zeitprotokoll-snippet.txt`.
