# User handbook

LOGA3 Automation Mobile loads your **time sheets from LOGA3**, keeps everything **on device only**, shows shifts in a calendar, and can share them as **ICS** or optionally sync to **Google Calendar**.

The app is still experimental and currently aimed at **one employer and one role group** (pack). Another workplace or area may fail until a matching pack exists.

---

## 1. The tabs

| Tab | Purpose |
|-----|---------|
| **Fetch** | Pick months and load Zeitprotokolle from LOGA3 |
| **Calendar** | Review shifts (week / month / list) |
| **Export** | Share ICS or sync Google |
| **Settings** | Setup, fetch window, reminders, appearance, help |

There is **no** Fr4iser server holding your password or schedule.

---

## 2. First-time setup

Under **Settings → Setup** (or on first launch):

1. **Tenant URL** — your facility’s LOGA3 address (often in a browser bookmark).
2. **Username / password** — same as in the browser; stored locally in the Secure Store.
3. **Employer / pack** — e.g. St. Elisabeth · anaesthesia. Wrong pack → wrong codes or times.
4. **Google** — optional; you can add it later under Export.

Fetch stays locked until setup is complete.

---

## 3. Fetch time sheets

1. Open the **Fetch** tab.
2. Tick the **months** you need (defaults come from **Settings → Fetch**: previous/next months).
3. Tap **Load time sheets** (DE UI: *Zeitprotokolle laden*).

The app opens LOGA3 in an embedded view, signs in, and exports the monthly PDFs. That can take a while; the view may stay visible.

After success, shifts usually appear under **Calendar**.

**Note:** Fetch only works while the app is open — there is no reliable silent overnight fetch without the app.

---

## 4. Calendar

- Switch **week / month / list**.
- Below that, a **month summary** (AZK, carry-over, …) is often available and collapsible.
- Colours and shift codes come from your pack. Unknown ranges can sometimes be mapped.

---

## 5. Export

| Path | What happens |
|------|----------------|
| **Share ICS** | Build a file and import it via the share sheet into Apple Calendar, Outlook, Samsung, Nextcloud, … |
| **Google sync** | After sign-in, write to a **dedicated** shift calendar (not the primary calendar) |

Google and ICS options are under **Settings → Fetch** and the Export tab.

---

## 6. Reminders

Under **Settings → Reminders**:

- **Sync due** — interval and hour, optional notification or prompt when opening the app, optional widget badge.
- **Shift reminders** — pick a mapped Dienst and set a clock time (e.g. 06:00 before an early shift). If the time is not before shift start, the app asks whether to save it as an **evening-before** reminder.

---

## 7. Widgets & appearance

Under **Settings → Appearance**: app theme and widget theme (system / light / dark).

On the Android home screen you can add:

- **LOGA3 next shift**
- **LOGA3 this week**

Tapping opens the app. Widgets show the last fetched plan (no network fetch of their own).

---

## 8. Updating the app

The app is currently distributed as an **APK via GitHub Releases** (no Play Store auto-update).

Under **Settings → App & support**:

- see the installed version  
- check for updates  
- open the release page and read the changelog when a new build exists  
- open this handbook again  

---

## 9. Privacy & limits

| Data | Where |
|------|--------|
| Password | Secure Store on device |
| URL, shifts, preferences | App storage on device |
| PDFs | App documents folder |
| Google sign-in | Google Sign-In on device |

**Limits (honest):**

- One pack verified live; other facilities may need a new pack.
- If the LOGA3 UI changes, fetch can break — an app update may be required.
- Testing focus so far is Android; iOS builds are possible but less exercised.

If something fails: **Settings → App & support** → support email (anonymised sample available).
