# Sync reminders, updates, background limits

## App update check (Settings)

**Nach Updates suchen** calls GitHub `GET /repos/…/releases/latest`, compares `tag_name` to `app.json` version, and offers **Release öffnen** when newer.

No auto-install — user downloads the APK from the release page ([releases.md](./releases.md)).

## Sync interval (Settings → Sync-Erinnerung)

| Setting | Default | Effect |
|---------|---------|--------|
| Alle N Tage | 3 | Overdue after last successful Holen + N days (`0` = off) |
| Reminder-Stunde | 3 | Local hour for the scheduled notification |
| Benachrichtigung | off | `expo-notifications` when due (needs **native rebuild**) |
| Beim Öffnen fragen | on | Alert on Holen tab if overdue |
| Widget-Hinweis | on | “Sync fällig” on NextShift / WeekPlan widgets |

Successful Holen calls `markSuccessfulFetch()` and reschedules the reminder.

## What is **not** possible (honest)

**Silent Holen at 03:00 while the phone sleeps** (WebView login → PDF → close) is **not** reliable on modern Android:

- LOGA3 needs an interactive WebView / GWT session  
- OEMs kill background WebViews and restrict exact alarms  
- Would need a foreground service + unlocked screen class UX  

So we **remind** (notification / widget / open prompt). The user (or “Ja, Holen”) runs the real sync in the foreground. Optional future: experimental FG-service path — not in v0.

## Native rebuild

After adding `expo-notifications`, run a new dev/preview APK before relying on scheduled alerts. Metro-only updates cover the Settings UI + GitHub check + widget badge text.
