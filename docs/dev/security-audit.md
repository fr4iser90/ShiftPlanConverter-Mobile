# Security audit checklist — ShiftPlan Converter

**Status:** internal checklist · **not** a completed third-party audit.  
**Scope:** Android/iOS Expo app (`com.fr4iser.shiftplan`). Experimental — validated for one employer pack so far (see README).

Use this before distributing beyond a trusted circle. Mark items `[x]` only after evidence (code review, device test, or external report).

**2026-07-25 hardening (code):** WebView debug `__DEV__`-only · smoke credential deep-links `__DEV__`-only · HTTPS-only tenant · Downloads PDF delete after poll · anonymized `rawText` at rest · wipe-all Settings · Advanced/fixture `__DEV__`-only · fillLogin password one-shot local.

---

## 1. Threat model (short)

| Asset | Risk if leaked / abused |
|-------|-------------------------|
| LOGA3 username / password | Full tenant access as the user |
| LOGA3 session cookies (WebView) | Session hijack until expiry |
| Shift PDFs + parsed entries | Sensitive work roster PII |
| Google OAuth access token | Calendar read/write for linked account |
| Tenant URL | Low (usually public), still env-specific |

Attack surface: on-device storage, WebView (third-party LOGA3 origin), Google Sign-In, share sheet (ICS), Android widget process reading AsyncStorage.

**Out of scope for v0:** MDM/enterprise policy, backend servers (there are none of ours), App Store review politics.

---

## 2. Secrets & credentials

| Check | Where | Status |
|-------|--------|--------|
| No tenant URL / user / password baked into APK | `app.config.js`, no `.env` secrets in binary | [ ] verify release APK strings |
| LOGA3 password only in Secure Store | `src/sources/webview/loga3/credentials.ts` | [x] code |
| Clear credentials works (Settings) | `clearCredentials` | [x] code |
| Wipe all local data (Settings) | `wipeAllLocalData` | [x] code |
| Smoke credential deep-link disabled in release | `smokeSeed.ts` `__DEV__` gate | [x] code |
| Google client IDs are OAuth public IDs (not secrets); tokens stay on device | `src/sync/google.ts` | [x] code |
| No passwords in logs / support mail sample | `anonymize.ts`, support mailto | [x] code |
| fillLogin password not kept on `cmd` (one-shot `__p`) | `automation.ts` | [x] code |

---

## 3. Local data

| Check | Where | Status |
|-------|--------|--------|
| Entries / mappings / prefs in AsyncStorage (plaintext) — acceptable for v0? Document residual risk | `src/state/store.ts` | [x] accepted residual; encrypt follow-up |
| `rawText` stored anonymized after fetch | `fetchJob.ts` | [x] code |
| PDFs under `documentDirectory/pdfs/` — not world-readable | `src/sources/webview/pdfStore.ts` | [ ] Android file perms spot-check |
| Public Downloads PDF deleted after Android poll | `androidDownloadPoll.ts` | [x] code |
| Widget reads same entries key — no extra copy of password | `src/widget/*` | [x] code |
| Uninstall clears Secure Store + app files | OS behaviour | [ ] spot-check |

**Known residual risk:** AsyncStorage entries and PDF files are not encrypted at rest. Device unlock + backup tools may expose roster data. Track encrypt-at-rest as a follow-up if distributing widely.

---

## 4. Network & WebView

| Check | Where | Status |
|-------|--------|--------|
| Tenant URL HTTPS-only | `env.ts`, setup validation | [x] code |
| WebView debug off in release | `Loga3WebView` `webviewDebuggingEnabled={__DEV__}` | [x] code |
| WebView `mixedContentMode=never`, whitelist https/about/blob | `Loga3WebView` | [x] code |
| Automation inject does not exfiltrate password off-device | `automation.ts` / `fetchJob.ts` | [x] code |
| PDF capture stays in app storage (no upload to our servers) | `pdfStore` / capture path | [x] code |
| TLS to LOGA3 / Google (no cleartext API of ours) | n/a backend | [x] |
| Deep links cannot seed credentials in release | `smokeSeed` / `_layout` | [x] code |

---

## 5. Google Calendar

| Check | Where | Status |
|-------|--------|--------|
| Dedicated calendar preferred; primary warned / blocked in picker | `GoogleCalendarPicker`, sync | [ ] |
| Sync wipe range is intentional & scoped to synced window | `src/sync/google.ts` | [ ] review date window |
| Disconnect / reconnect clears stale session expectations | Sign-In restore | [ ] |
| Calendar ID stored without tokens in AsyncStorage | store key `googleCalendarId` | [x] code |

---

## 6. Export / share

| Check | Where | Status |
|-------|--------|--------|
| ICS share uses system sheet (user chooses target) | `shareIcs` | [x] code |
| Support sample strips identifiers where intended | `anonymize` | [x] code + tests |

---

## 7. Release hygiene

| Check | Status |
|-------|--------|
| No debug smoke URLs / fixtures forced in production builds | [x] `__DEV__` gate |
| ProGuard / minify does not break Secure Store / Google Sign-In | [ ] |
| Dependency audit (`npm audit`) reviewed; criticals addressed or accepted | [x] 2026-07-25: 0 critical; brace-expansion/jest + uuid/xcode accepted residual |
| Dedicated release signing key (not debug.keystore) | [ ] ops — see [play-store-launch.md](./play-store-launch.md) |
| Third-party / peer security review before public store listing | [ ] hand [peer-review-packet.md](./peer-review-packet.md) |

---

## 8. Sign-off

| Role | Name | Date | Notes |
|------|------|------|-------|
| Author (dev) | | 2026-07-25 | Hardening + Play docs landed |
| Independent reviewer | | | Leave empty until peer-review-packet done |

**Do not** claim “security audited” in store listings until an independent pass fills section 8.

---

## Scanner finding policy

Automated scan acceptances (Bandit e2e noise, transitive `uuid` via Expo `xcode`): [`.scanning/finding-policy.json`](../.scanning/finding-policy.json).

Re-check when Expo bumps `@expo/config-plugins` / `xcode` / `uuid`.

---

## Follow-ups

1. ~~Encrypt-at-rest~~ done (`securePayload.ts`).
2. ~~Biometric gate~~ done (Settings → Security).
3. Dedicated EAS production signing + Play App Signing SHA-1 in Google OAuth.
4. Deploy ShiftPlanConverter so `https://shift.fr4iser.com/privacy` serves `privacy.html`.
5. Widget: only shows shift codes already on device (no network) — keep it that way.
6. ProGuard/R8 smoke on a signed production AAB (Fetch + Google + widgets).
