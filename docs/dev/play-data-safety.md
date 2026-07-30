# Play Console — Data safety answers (draft)

App does **not** collect data onto Fr4iser servers. Answer Play “Data safety” accordingly.

## Does your app collect or share user data?

**Collect:** Yes — processed/stored **on device** (and optionally sent to Google if user enables Calendar).  
**Share with third parties (Fr4iser):** No.  
**Sold:** No.

## Data types (typical answers)

| Type | Collected? | Shared? | Ephemeral? | Purpose |
|------|------------|---------|------------|---------|
| Account info (LOGA3 username) | Yes (on device) | No (except to user’s LOGA3 tenant) | No | App functionality |
| Password | Yes (Secure Store only) | Only to user’s LOGA3 over HTTPS during login | No | App functionality |
| Calendar events / work schedule | Yes (on device) | Optional → Google Calendar if user connects | No | App functionality |
| Files / docs (time-sheet PDFs) | Yes (app-private, AES-GCM) | No | No | App functionality |
| Financial info (payslip / Verdienstnachweis lines, gross, tariff) | Yes if user imports (on device, AES-GCM) | No | No | App functionality (Payroll check) |
| Photos / camera (OCR) | Yes if user captures (on device) | No | No | App functionality |
| Device IDs / ads | No | — | — | — |
| Approximate location | No | — | — | — |
| Diagnostics / crash | No (no Sentry etc.) | — | — | — |

## Security practices

- Data encrypted in transit: **Yes** (HTTPS to LOGA3 / Google)
- Data encrypted at rest: **Yes** (Secure Store for login; AES-GCM for shifts, PDFs, payslips)
- Users can request deletion: **Yes** (in-app wipe / uninstall)

## Privacy policy URL

`https://shift.fr4iser.com/privacy`  
Source HTML: **ShiftPlanConverter** website repo (`privacy.html`, `privacy-en.html`) — not in the Mobile repo. Deploy that site after edits.
