# User guide (English)

End-user oriented overview. **German (primary for local testers):** [nutzerhandbuch.md](./nutzerhandbuch.md).  
**Shipping / GitHub APK / changelog process:** [releases.md](./releases.md).

## What the app does

LOGA3 Automation Mobile fetches your **shift schedule from LOGA3** on-device, shows it as a calendar, and exports via **ICS** and optional **Google Calendar** sync. Same idea as the [desktop app](https://github.com/fr4iser90/LOGA3-Automation).

### Features

1. **Setup** — Tenant URL, login (Secure Store), employer pack, optional Google.
2. **Fetch (Holen)** — In-app **WebView** automates LOGA3 (no public shift API): login → Zeiten → month → Zeitprotokoll PDF → parse.
3. **Calendar** — Week / month / list; collapsible AZK / carry-over summary.
4. **Export** — Share `.ics` (Apple, Outlook, Nextcloud, …) or sync to a dedicated Google calendar.
5. **Widgets (Android)** — Next shift + this week; theme in Settings.
6. **Settings** — Month window, sync prefs, widget theme, **check for app updates** (GitHub Releases).

### Why a WebView and credentials?

LOGA3 is a web app. The phone embeds it and drives the same UI path as desktop Playwright. Credentials are required for *your* tenant login only; they stay on device (Secure Store) and are not uploaded to our servers.

### Other calendar providers?

ICS already covers most. Native Google sync is optional. Outlook Graph / Apple EventKit / CalDAV are **not** planned until more packs are stable — see handbook §6.

### App updates

Sideloaded APKs via **GitHub Releases**. Settings opens Releases + Changelog so users see what they install. Full process: [releases.md](./releases.md).
