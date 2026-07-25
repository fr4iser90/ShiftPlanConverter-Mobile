# Peer security / privacy review packet

Hand this to someone who did **not** implement the last security changes.  
After review, fill `docs/dev/security-audit.md` §8 (independent reviewer).

## Scope

Expo/React Native app `com.fr4iser.shiftplan` — on-device LOGA3 fetch → calendar.

## Checklist for reviewer

1. [ ] Confirm no Fr4iser network upload of credentials/PDFs (grep `fetch(`/API bases in `src/`).
2. [ ] Confirm LOGA3 password only via Secure Store + fillLogin one-shot (`credentials.ts`, `automation.ts`).
3. [ ] Confirm `webviewDebuggingEnabled={__DEV__}` and smoke credential deep-links `__DEV__`-only.
4. [ ] Confirm tenant URLs HTTPS-only (`env.ts`).
5. [ ] Confirm encrypt-at-rest for entries/rawText/summaries/PDFs (`securePayload.ts`).
6. [ ] Confirm wipe-all clears creds, key, PDFs (`wipeAllLocalData`).
7. [ ] Confirm About / https://shift.fr4iser.com/privacy match actual behaviour; no “audited” claims in store copy.
8. [ ] Spot-check release APK strings for `.env` secrets (optional `strings` / `apktool`).
9. [ ] Note residual risks: device unlock, Google sync under user account, experimental packs.

## Deliverable

Short mail or PR comment: pass / fail + findings. Then sign §8 in security-audit.md.
