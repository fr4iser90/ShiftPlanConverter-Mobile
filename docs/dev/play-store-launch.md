# Play Store Launch Checklist

Package: `com.fr4iser.shiftplan` · Related: [security-audit.md](./security-audit.md), [releases.md](../releases.md), [google-oauth-android.md](./google-oauth-android.md) · Privacy: https://shift.fr4iser.com/privacy (ShiftPlanConverter repo)

**Code prep in repo is done.** Items marked **YOU** need your Google / Expo accounts.

---

## A. Signing (YOU — blocker)

1. Install CLI: `npm i -g eas-cli` then `eas login`
2. Link project: `eas init` / ensure `extra.eas.projectId` exists
3. Create **production** Android credentials (not debug.keystore):

```bash
eas credentials -p android
# Select production → Set up a new keystore (EAS managed recommended)
```

4. Print SHA-1 of the **production** keystore and add it to Google Cloud → Android OAuth client (`com.fr4iser.shiftplan`).  
   Also add the **Play App Signing** SHA-1 from Play Console once the app is enrolled.
5. Update [google-oauth-android.md](./google-oauth-android.md) with the new SHA-1s.

---

## B. Production AAB (YOU)

```bash
eas build --platform android --profile production
# optional submit:
eas submit --platform android --profile production --latest
```

`eas.json` already uses `app-bundle` for `production`.

---

## C. Play Console listing (YOU)

Use drafts in [play-store-listing.md](./play-store-listing.md).

- Create app → package `com.fr4iser.shiftplan`
- Short/full description DE (+ EN if needed)
- Screenshots, icon, feature graphic
- Privacy Policy URL: `https://shift.fr4iser.com/privacy` (HTML in ShiftPlanConverter: `privacy.html` / `privacy-en.html`)
- Data safety: answers in [play-data-safety.md](./play-data-safety.md)
- Content rating questionnaire
- Target audience / news apps / COVID etc. declarations
- App access: explain LOGA3 login needed (employer account); provide test instructions if review needs access

**Do not** claim “security audited” / “extern geprüft” in the listing.

---

## D. After listing goes live

1. Set in `src/support/legal.ts`:

```ts
export const PROJECT_PLAY_STORE =
  'https://play.google.com/store/apps/details?id=com.fr4iser.shiftplan';
```

2. Rebuild so in-app “Check for updates” opens Play.
3. Smoke: Holen + Google Sign-In + widget on a release build (ProGuard/R8).

---

## E. Privacy on shift.fr4iser.com

Source: **ShiftPlanConverter** repo (`privacy.html`, `privacy-en.html`, nginx `/privacy`). Deploy that site; App About already opens `PROJECT_PRIVACY`.

---

## F. Peer review (optional but recommended)

Hand [peer-review-packet.md](./peer-review-packet.md) to someone else. Fill `docs/dev/security-audit.md` §8 only after that.
