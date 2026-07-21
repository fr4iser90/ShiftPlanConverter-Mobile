# LOGA3 Automation Mobile

Android- & iOS-App für Dienstplan → Kalender (ICS / Google).

**Desktop-Companion:** [LOGA3-Automation](https://github.com/fr4iser90/LOGA3-Automation) (LOGA3-Fetch mit Playwright, Packs, Releases).

Dieses Repo ist **nicht** eine Kopie der Desktop-App. Kein Playwright in der App (MVP).

## Stack (festgelegt)

- **Expo (React Native)** + TypeScript  
- Warum: Converter-Kern ist JS — Sharing/Port leichter als Flutter  
- Ein Codebase → Android APK/AAB + iOS IPA  

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

App-Ordner wird in Phase 0 angelegt (`npx create-expo-app@latest app -t expo-template-blank-typescript`).

## Beziehung zum Desktop

| Feature | Desktop | Mobile MVP |
|---------|---------|------------|
| LOGA3 PDFs holen (Browser) | ja | nein → Phase C via Backend |
| PDF → Schichten parsen | ja | ja |
| ICS / Google Sync | ja | ja |
| Arbeitgeber-Packs | ja | ja (Builtin + Katalog) |
| Update-Check | ja | ja (Hinweis + Store/Release-Link) |

## Lizenz

Siehe [LICENSE](./LICENSE).
