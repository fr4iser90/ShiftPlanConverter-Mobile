# Releases & in-app updates

How we ship APKs via **GitHub Releases**, keep a user-visible **changelog**, and what the **Settings → Update** buttons do.

Related: [CHANGELOG.md](../CHANGELOG.md) · [Nutzerhandbuch](./nutzerhandbuch.md)

---

## 1. Distribution model (today)

| Channel | Status |
|---------|--------|
| Google Play / App Store | Not the primary path (experimental sideload) |
| **GitHub Releases** (APK) | Intended for testers / colleagues |
| EAS `preview` APK | CI/manual build artifact → attach to a GitHub Release |
| EAS `production` AAB | Only if/when store listing exists |

Users install/update by downloading the APK from the release page (Android “unknown sources” / installer). There is **no** silent OTA (`expo-updates`) in v0 — a Settings button opens GitHub so people can update **manually** and read what changed.

---

## 2. Changelog rules (before every release)

1. Edit [`CHANGELOG.md`](../CHANGELOG.md) **first** (Keep a Changelog style).
2. Bump `expo.version` in `app.json` (and native versionCode when using EAS autoIncrement).
3. Top section = what **users** care about (Holen, Kalender, Export, Widgets, Sicherheit) — not only internal refactors.
4. Copy the same bullet list into the **GitHub Release** description (German OK for local testers).
5. Tag: `v0.1.5` matching the changelog heading.

Example release notes block:

```markdown
## Was ist neu (0.1.5)

- …
- …

### Für Tester
- APK: `loga3-mobile-0.1.5.apk`
- Bekannte Grenzen: siehe README Status / Nutzerhandbuch
```

---

## 3. Build APK (GitHub / EAS)

### Manual EAS (typical)

```bash
# version + CHANGELOG already updated and committed
eas build --platform android --profile preview
# download APK from Expo dashboard, then:
gh release create v0.1.5 ./path/to/app-preview.apk \
  --title "0.1.5" \
  --notes-file release-notes.md
```

### GitHub Actions (recommended next step)

Add a workflow that on tag `v*` runs `eas build` (or assembles a prebuilt APK) and uploads the artifact to the GitHub Release. Until that exists:

1. Build locally / EAS  
2. Create release with `gh release create`  
3. Attach APK + paste changelog  

Document secrets in the repo wiki or private notes: `EXPO_TOKEN`, signing keystore (never commit).

---

## 4. Settings → Update (in app)

| Control | Behaviour |
|---------|-----------|
| Version line | Shows `Constants.expoConfig.version` |
| **Nach Updates suchen** | Opens `{PROJECT_GITHUB}/releases` in the browser |
| **Was ist neu?** | Opens `{PROJECT_GITHUB}/blob/main/CHANGELOG.md` |

Phase 2 (implemented in Settings):

- `GET /repos/.../releases/latest` via `src/update/githubRelease.ts`  
- Compare `tag_name` to installed version  
- Show “Neu: …” + **Release öffnen**  

Do **not** auto-download/install without user confirmation (Android policy + trust).

Sync reminders / widget badge / open-prompt: [schedule-and-updates.md](./schedule-and-updates.md).

Constants: `PROJECT_GITHUB` in `src/support/legal.ts`.

---

## 5. Calendar providers (product decision)

Documented for users in the handbook; summary for maintainers:

- **Ship:** ICS (universal) + Google Calendar sync.  
- **Defer:** Microsoft Graph, EventKit, CalDAV clients — high cost, ICS covers most “other calendars”.  
- New oauth targets plug into `src/sync/targets/` when needed.

---

## 6. Checklist before publishing a release

- [ ] `CHANGELOG.md` updated (user-facing bullets)
- [ ] `app.json` version bumped
- [ ] Holen smoke on at least one real device / matrix subset
- [ ] Security: no secrets in APK; scan policy reviewed if deps changed
- [ ] GitHub Release created with APK + notes
- [ ] Settings links still point at this repo’s `/releases` and `CHANGELOG.md`
