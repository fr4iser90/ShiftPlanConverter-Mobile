# Handoff-Prompt (für LLM / Entwickler)

Kopiere den Block unten in eine neue Agent-Session im Repo `LOGA3-Automation-Mobile`.

---

## Prompt

Du arbeitest im Repo **LOGA3-Automation-Mobile**.

Lies zuerst:
- `PLAN.md`
- `docs/architecture.md`
- Desktop-Referenz: https://github.com/fr4iser90/LOGA3-Automation (`converter/`, Fetch-/GUI-Flow als Verhaltens-Vorbild)

### Produktziel

Die Mobile-App funktioniert **wie die Desktop-App** — **vollständig auf dem Gerät**:

LOGA3 Login → Monate wählen → PDFs holen → parsen → Preview → ICS / Google  

**Playwright-Ersatz:** In-App **WebView** + JS-Steuerung von LOGA3.

### Auftrag

1. Expo TypeScript App unter `app/` (Expo Router).
2. Screens: Holen (WebView-Fetch) → Preview → Export + Settings.
3. Port Converter aus Desktop-`converter/`.
4. Builtin-Mapping: Pflege · OP · Anästhesie (`isValidated`).
5. Desktop-Fetch-Logik als WebView-Automation umsetzen.

### Constraints

- Android **und** iOS, eine Codebase.
- TypeScript.
- Secrets nicht committen.
- `PLAN.md` Checkboxes aktuell halten.

### Erste Deliverables

- App startet (`expo start` / Dev Client falls nötig)
- WebView kann LOGA3 öffnen / Login halten
- Danach: PDF speichern → Preview → ICS Share

---

## Referenz Desktop

```bash
git clone https://github.com/fr4iser90/LOGA3-Automation.git ../LOGA3-Automation
```

Fixture-Text (Parser-Smoke): `fixtures/sample-zeitprotokoll-snippet.txt`.
