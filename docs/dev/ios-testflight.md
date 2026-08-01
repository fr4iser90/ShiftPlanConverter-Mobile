# iOS — TestFlight & App Store

Bundle ID: `com.fr4iser.shiftplan` · Privacy: https://shift.fr4iser.com/privacy  
Related: [play-store-launch.md](./play-store-launch.md) · [google-oauth-android.md](./google-oauth-android.md) · [roadmap.md](./roadmap.md)

**Linux:** no local Xcode — use **EAS** cloud builds.  
**Status:** Config ready; live LOGA3 fetch on a physical iPhone not fully smoke-tested yet.

---

## Profiles (`eas.json`)

| Profile | iOS target | Use |
|---------|------------|-----|
| `development` / `preview` | **Simulator only** | Dev on Mac Simulator |
| `preview-device` | Real device, **internal** | Ad-hoc / Expo install link (UDID / limited) |
| `production` | Real device, **store** IPA | **TestFlight** + App Store |

For the Oberarzt: use **`production` → TestFlight**, not Simulator profiles.

---

## A. Prerequisites (YOU)

1. [Apple Developer Program](https://developer.apple.com/programs/) (paid team).
2. `eas login` · Expo project linked (`extra.eas.projectId` in app config).
3. iOS credentials (EAS managed recommended):

```bash
eas credentials -p ios
# production → Distribution Certificate + App Store provisioning
```

4. App Store Connect: create app with bundle id `com.fr4iser.shiftplan` (once).

---

## B. Build for TestFlight

```bash
# version + CHANGELOG already bumped (same as Android release when shipping together)
eas build --platform ios --profile production --no-wait
```

- `autoIncrement` bumps iOS build number remotely (like Android `versionCode`).
- Do **not** start a second production iOS build while a usable finished IPA for the same fix already exists.

When finished:

```bash
eas submit --platform ios --profile production --latest
```

Or upload the IPA in App Store Connect → TestFlight.

---

## C. Invite testers

1. App Store Connect → your app → **TestFlight**.
2. Wait for processing + export compliance (usually “No” encryption / standard HTTPS — answer per your privacy doc).
3. **Internal testing** — Apple accounts on the same developer team (fast).
4. **External testing** — email invite; may need a short Beta App Review the first time.
5. Tester installs **TestFlight** from the App Store → accepts invite → installs ShiftPlan Converter.

Smoke before handing out: Setup → Import LOGA3 Dienstplan + Verdienst → Calendar → Prüfung (if pack supports payroll) → ICS share. Google Sign-In needs an **iOS** OAuth client (bundle id) in Google Cloud — Android SHA-1 clients do **not** cover iOS.

---

## D. App Store (market)

1. Listing: screenshots (iPhone), DE/EN text, privacy URL, age rating, App Privacy answers (see [play-data-safety.md](./play-data-safety.md) as starting point).
2. Attach a **production** build that already works in TestFlight.
3. Submit for review — provide LOGA3 test notes / demo account if Review needs portal login.
4. After release: optional `PROJECT_*` store links in `src/support/legal.ts` + rebuild if the in-app “updates” button should open the App Store.

---

## E. Optional: internal device without TestFlight

```bash
eas build --platform ios --profile preview-device --no-wait
```

Install via Expo dashboard link / QR. Devices must be registered for ad-hoc; **TestFlight is less friction** for one doctor.

---

## Checklist

- [ ] Apple Developer membership active  
- [ ] App Store Connect app + bundle `com.fr4iser.shiftplan`  
- [ ] `eas credentials -p ios` production set  
- [ ] One `production` iOS build; submit to TestFlight  
- [ ] Internal/external tester invited  
- [ ] Phone smoke: LOGA3 + payslip + ICS  
- [ ] Google iOS OAuth client if Calendar sync is required on iPhone  
- [ ] Later: App Store review when ready  

Do **not** use `preview` / `development` iOS builds for real iPhones (simulator-only).
