# Security audit checklist — LOGA3 Mobile

**Status:** internal checklist · **not** a completed third-party audit.  
**Scope:** Android/iOS Expo app (`com.fr4iser.loga3mobile`). Experimental — validated for one employer pack so far (see README).

Use this before distributing beyond a trusted circle. Mark items `[x]` only after evidence (code review, device test, or external report).

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
| LOGA3 password only in Secure Store | `src/loga3/credentials.ts` | [ ] |
| Clear credentials works (Settings) | `clearCredentials` | [ ] |
| Smoke/deep-link seed cannot leave secrets in git | `src/setup/smokeSeed.ts`, `.gitignore` | [ ] |
| Google client IDs are OAuth public IDs (not secrets); tokens stay on device | `src/sync/google.ts` | [ ] |
| No passwords in logs / support mail sample | `src/convert/anonymize.ts`, support mailto | [ ] |

---

## 3. Local data

| Check | Where | Status |
|-------|--------|--------|
| Entries / mappings / prefs in AsyncStorage (plaintext) — acceptable for v0? Document residual risk | `src/state/store.ts` | [ ] decide encrypt-at-rest |
| PDFs under `documentDirectory/pdfs/` — not world-readable | `src/loga3/pdfStore.ts` | [ ] Android file perms |
| Widget reads same entries key — no extra copy of password | `src/widget/*` | [ ] |
| Uninstall clears Secure Store + app files | OS behaviour | [ ] spot-check |

**Known residual risk:** AsyncStorage and PDF files are not encrypted at rest. Device unlock + backup tools may expose roster data. Track encrypt-at-rest as a follow-up if distributing widely.

---

## 4. Network & WebView

| Check | Where | Status |
|-------|--------|--------|
| WebView loads only configured tenant base URL | `src/loga3/env.ts`, `Loga3WebView` | [ ] |
| Automation inject does not exfiltrate password off-device | `automation.ts` / `fetchJob.ts` | [ ] |
| PDF capture stays in app storage (no upload to our servers) | `pdfStore` / capture path | [ ] |
| TLS to LOGA3 / Google (no cleartext API of ours) | n/a backend | [ ] |
| Deep links (`loga3mobile://`) cannot inject arbitrary JS without app logic | Linking handlers | [ ] |

---

## 5. Google Calendar

| Check | Where | Status |
|-------|--------|--------|
| Dedicated calendar preferred; primary warned / blocked in picker | `GoogleCalendarPicker`, sync | [ ] |
| Sync wipe range is intentional & scoped to synced window | `src/sync/google.ts` | [ ] review date window |
| Disconnect / reconnect clears stale session expectations | Sign-In restore | [ ] |
| Calendar ID stored without tokens in AsyncStorage | store key `googleCalendarId` | [ ] |

---

## 6. Export / share

| Check | Where | Status |
|-------|--------|--------|
| ICS share uses system sheet (user chooses target) | `shareIcs` | [ ] |
| Support sample strips identifiers where intended | `anonymize` | [ ] test sample |

---

## 7. Release hygiene

| Check | Status |
|-------|--------|
| No debug smoke URLs / fixtures forced in production builds | [ ] |
| ProGuard / minify does not break Secure Store / Google Sign-In | [ ] |
| Dependency audit (`npm audit`) reviewed; criticals addressed or accepted | [ ] |
| Third-party / peer security review before public store listing | [ ] **required for “audited” claim** |

---

## 8. Sign-off

| Role | Name | Date | Notes |
|------|------|------|-------|
| Author (dev) | | | Checklist authored |
| Independent reviewer | | | Leave empty until done |

**Do not** claim “security audited” in store listings until an independent pass fills section 8.

---

## Scanner finding policy

Automated scan acceptances (Bandit e2e noise, transitive `uuid` via Expo `xcode`): [`.scanning/finding-policy.json`](../.scanning/finding-policy.json).

Re-check when Expo bumps `@expo/config-plugins` / `xcode` / `uuid`.


1. Optional encrypt-at-rest for entries + PDFs (Keystore-backed key).
2. Biometric gate before showing Holen WebView / revealing password fields.
3. Explicit “wipe all local data” beyond credentials.
4. Widget: only shows shift codes already on device (no network) — keep it that way.
