# User handbook

## What is ShiftPlan Converter?

An **on-device** app that imports your **shift plan** (and optionally **payslips**), stores everything locally, shows shifts in a calendar, and exports via **ICS** and/or optional **Google Calendar**.

**Core idea:**

1. **Employer pack** (required) — codes, times, parsers, optional payroll profile. Wrong pack → wrong codes/times.
2. **Sources** — whatever the pack enables, all **optional**:
   - **Files / camera / OCR** — PDF, CSV, ICS, photo; shared engines + pack mapping (lists, month matrix, …).
   - **Portal / WebView** (e.g. **LOGA3**) — only if the pack declares it. May expose separate jobs: **shifts** and/or **payslips**.
3. **Export** — ICS and/or Google; independent of how you imported.

No Fr4iser server for your password or roster. Login stays in Secure Store; shifts and payslips are encrypted at rest.

Experimental. One pack (e.g. St. Elisabeth · nursing · OR) is live-verified; **other employers** need their own pack (JSON mappings/parsers). The same LOGA3 automation can often be reused — employer codes and PDF layouts cannot.

---

## 1. The tabs

| Tab | Purpose |
|-----|---------|
| **Import** | Pick source (files/OCR and/or LOGA3), months, load shifts or payslips |
| **Calendar** | Review shifts (week / month / list) |
| **Check** (Prüfung) | Only if the pack has a **payroll profile**: payslip ↔ imported shifts |
| **Export** | Share ICS or sync Google |
| **Settings** | Setup, fetch window, reminders, appearance, help |

**Check** appears only when your scope has `payroll.supported` plus a profile — not merely because you once imported a PDF. Without payslip data, the tab still guides you to load one.

---

## 2. First-time setup

Under **Settings → Setup** (or first launch):

1. **Employer / pack** — group, area, preset. **Required.**
2. **Portal login** (optional) — e.g. LOGA3 URL + credentials, only for WebView fetch. Skip for file/OCR-only.
3. **Google** — optional; add later under Export.

Pack without portal → Import UI shows files/OCR only. Pack with LOGA3 → **Shifts** / **Payslip** segment (payslip only if payroll is supported).

---

## 3. Import

### Files / OCR

Source **File & photo** → pick PDF/CSV/ICS or use camera/gallery.  
PDF/OCR use pack parsers and mappings (list, month-matrix, …). Ambiguous docs may ask “shift plan or payslip?” when payroll is supported.

### LOGA3 (when in pack)

1. Source **LOGA3**, job **Shifts** or **Payslip**.
2. Select closed months (payslip: current/future calendar months disabled).
3. Load — embedded portal, automation, PDF capture.

Existing payslips are **kept** (no re-download). Months with no LOGA3 folder are skipped.

After success: shifts → **Calendar**; payslips → often **Check**.

**Note:** Portal fetch only while the app is open — no reliable silent overnight fetch.

---

## 4. Calendar

- **Week / month / list**.
- Often a **month summary** (balance, carry-over, …).
- Colours and codes come from the pack.

---

## 5. Payroll check (Prüfung tab)

Compares **payslip** lines/tariff with **imported shifts** for the matching period.  
Needs a pack payroll profile **and** a payslip (file or LOGA3). Missing shifts → hint and link back to Import.

---

## 6. Export

| Path | What happens |
|------|----------------|
| **Share ICS** | File → share sheet (Apple, Outlook, Samsung, …) |
| **Google sync** | Dedicated shift calendar (not primary) |

---

## 7. Reminders

Under **Settings → Reminders**: sync-due prompts, per-Dienst reminders (including evening-before).

---

## 8. Widgets & appearance

Theme under **Settings → Appearance**. Android home widgets show the last loaded plan (no separate network fetch).

---

## 9. Updating the app

Often **APK / Play**; under **Settings → App & support**: version, updates, this handbook.

---

## 10. Privacy & limits

| Data | Where |
|------|--------|
| Password | Secure Store |
| AES key | Secure Store |
| Shifts / payslips | AsyncStorage, **AES-GCM** (`enc:v1:`) |
| PDFs (shift capture) | App documents (encrypted where designed) |
| Google | On-device Sign-In |

**Limits:** Other employers need a pack; portal UI changes can break fetch; testing focus is Android.

Issues: **Settings → App & support** → support mail.
