# Changelog

English. German version: [CHANGELOG.md](./CHANGELOG.md)

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## 0.1.5 — 2026-07-25

### Added
- Encrypt-at-rest (AES-GCM) for shifts, raw text, summaries, and PDFs; key in Secure Store
- Optional biometrics/PIN gate before fetch and password reveal (Settings → Security)
- Privacy policy at shift.fr4iser.com/privacy (ShiftPlanConverter) + About link; Play Store launch docs
- Wipe-all local data; HTTPS-only tenant URL

### Changed
- WebView debugging and smoke credential deep-links are `__DEV__`-only
- Delete public Downloads PDF after Android poll; Advanced/fixture `__DEV__`-only
- Update check can switch to Play Store when `PROJECT_PLAY_STORE` is set

### Security
- No “security audited” claim in store copy; peer-review packet under `docs/dev/peer-review-packet.md`

## 0.1.4 — 2026-07-24

### Added
- User handbook and [docs/releases.md](./docs/releases.md) (GitHub APK, changelog required before release)
- Settings: GitHub update check (`releases/latest`) and changelog links
- Settings: sync reminder (interval, hour, notification, prompt on open, widget badge)
- [docs/dev/schedule-and-updates.md](./docs/dev/schedule-and-updates.md) — background Fetch limits
- System light/dark theme for product UI; status bar follows canvas
- Calendar: week / month / list chips; AZK month overview collapsible below
- Android widgets: next shift + this week; theme in Settings
- Security audit checklist and scanner finding policy (`.scanning/`)

### Changed
- Fetch more reliable (layout fix, waits); auto-navigate to calendar after successful fetch
- README features table (WebView, credentials, ICS vs Google explained)
- Fetch UI: single button (Settings month window pre-selected); NextShift widget default 1 cell tall

### Fixed
- Fetch: Android no longer opens PDFs in the WebView viewer (capture and continue); status shows Fetch steps instead of “PDF captured” spam
- Sync reminder: defaults **off** (no prompt on open); only after explicit Settings
- Fetch: compact status line instead of large “fetch running” card
- Widgets: fixed size (~4×2) and no resize — WeekPlan now **4×1**, resizable; NextShift **2×1**; tighter layout
- Changelog: German and English split (`CHANGELOG.md` / `CHANGELOG.en.md`)

## 0.1.2 — 2026-07-23

### Added
- Export targets (`src/sync/targets`) — Google (OAuth) and ICS (file); one-tap runs enabled OAuth targets
- In-app calendar: week / month / list (pack colors, persisted mode)
- Android home-screen widget **LOGA3 next shift**
- After one-tap fetch: optional ICS share when no OAuth sync ran

### Changed
- One-tap button labels: “Fetch schedule” vs “Fetch + Google” depending on target
- Settings: toggle “Offer ICS when no sync”

## 0.1.1 — 2026-07-22

### Fixed
- Live Fetch emulator smoke: July 2026 → PDF + 14 shifts (historically with forced display size — now forbidden; emulator = real phone size)
- Android PDF capture: viewer scrape and real PDF bytes only; text extract without worker on Hermes

### Changed
- PLAN / `docs/dev/webview-fetch.md`: live Fetch DoD met
- README: no display-size cheat; emulator = natural phone size
- Multi-month smoke 06+07/2026 → 28 shifts / 2 PDFs
- Google sync like desktop: built-in client ID (no `EXPO_PUBLIC_GOOGLE_*`), wipe in date range; optional `GOOGLE_CLIENT_ID` in `.env`
- Calendar tab closer to desktop: date/code/start/end table, highlight today/week/month, AZK month overview, auto-scroll to focus
- Leave early: actual times with same start → known duty code (no longer “missing times”); mapping UI only for truly unknown starts
- Security: login only in Secure Store; tenant URL only Settings/AsyncStorage — none in the APK build; employer via pack selection (setup)
- Fetch automation: wait for conditions instead of sleep/retry spam — precondition → one action → postcondition; at most one recovery
- Dedicated **setup screen**: URL → login → pack; Fetch only months/fetch when setup is complete
- Shell ready: waits for LOGA3 splash to end before clicking Zeiten

## 0.1.0 — 2026-07-21

### Added
- Expo (React Native) + TypeScript app at repo root with tabs: Fetch, Preview, Export, Settings
- Converter port (St. Elisabeth parser, Anaesthesia mapping, ICS, anonymize)
- Built-in pack: St. Elisabeth · Nursing · OR · Anaesthesia (validated)
- LOGA3 login → Secure Store; in-app WebView + automation
- Preview with highlight today/week/month; user mappings for missing times
- ICS share sheet; Google OAuth/sync (client IDs via env)
- Support: anonymized raw-text snippet with KO*/GE*
- i18n DE/EN
- Jest unit tests, typecheck, `eas.json` (development / preview / production)

### Changed
- Expo project moved to repo root (`app/` is router only, no duplicate project layout)
- Fetch: live path “Load selected” (month select + PDF capture); fixture clearly offline debug
- Desktop pre-download checks: content gate, dialog month, PDF billing month; LOGA3 URL in Settings

### Added (dev)
- `shell.nix`: Node 22 + JDK 17 + Android SDK/emulator; helpers `loga3-emu` / `loga3-android` / `loga3-help`
- Fetch core modules and updated `webview-fetch.md`
