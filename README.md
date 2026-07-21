# LOGA3 Automation Mobile

Android- & iOS-App — **derselbe Funktionsumfang wie die Desktop-App**, läuft **nur auf dem Gerät**.

**Desktop-Referenz:** [LOGA3-Automation](https://github.com/fr4iser90/LOGA3-Automation) (Verhalten, Converter, Packs).

## Was die App kann

1. In LOGA3 einloggen  
2. Monate wählen und Zeitprotokoll-PDFs holen  
3. Schichten parsen → Preview  
4. `.ics` / Google Calendar  

**Kein Server. Kein PC.** Playwright-Ersatz: **WebView in der App** + JS-Steuerung von LOGA3.

## Stack

- **Expo (React Native)** + TypeScript  
- Ein Codebase → Android + iOS  
- Converter-Port aus dem Desktop-Repo  

## Dokumente

| Datei | Inhalt |
|--------|--------|
| [PLAN.md](./PLAN.md) | Phasen, DoD, Nicht-Ziele |
| [docs/architecture.md](./docs/architecture.md) | Architektur |
| [docs/handoff-prompt.md](./docs/handoff-prompt.md) | Prompt für LLM/Entwickler |

## Schnellstart (wenn App initialisiert)

```bash
cd app
npx expo start
```

App-Ordner: Phase 0 (`create-expo-app` + ggf. Dev Client für WebView-Downloads).

## Beziehung zum Desktop

| Feature | Desktop | Mobile |
|---------|---------|--------|
| LOGA3 PDFs holen | Playwright + Chromium | **WebView + JS** (auf dem Gerät) |
| PDF → Schichten | ja | ja |
| ICS / Google Sync | ja | ja |
| Arbeitgeber-Packs | ja | ja |
| Braucht Server/PC | nein | **nein** |

## Lizenz

Siehe [LICENSE](./LICENSE).
