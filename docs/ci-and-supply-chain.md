# CI & supply-chain hygiene

How we avoid **accidentally committing secrets / `node_modules` / a poisoned lockfile**, and what still needs human review.

See also: [security-audit.md](./security-audit.md) · [`.scanning/finding-policy.json`](../.scanning/finding-policy.json)

---

## 1. Do you need this?

| Risk | Mitigation |
|------|------------|
| Commit `.env` / passwords | `.gitignore` + **pre-commit** blocks staged `.env*` |
| Commit `node_modules` (huge / un-auditable) | `.gitignore` + pre-commit blocks `node_modules/` |
| Malicious or vulnerable npm package | **Lockfile only** (`npm ci`), **Dependabot**, **CI `npm audit`**, review `package-lock.json` diffs on PRs |
| Typosquat on `npm install foo` | Prefer known packages; read lockfile diff; avoid `--force` / random Git URLs |

**Pre-commit does not replace CI.** Hooks are local and can be skipped (`--no-verify`). CI is the real gate for pushes/PRs.

**Full CVE scanners (Trivy/OWASP) on every commit** are usually too slow/noisy. Run them on PR/release (your external scanner + finding-policy), and keep `npm audit --audit-level=high` in CI so **high/critical** block the build. Accepted moderate findings (e.g. transitive `uuid` via Expo) stay in finding-policy, not as a reason to disable audit entirely.

---

## 2. What we ship in-repo

| Piece | Role |
|-------|------|
| `.github/workflows/ci.yml` | `npm ci` → typecheck → jest → `npm audit --audit-level=high` |
| `.github/dependabot.yml` | Weekly npm (+ Actions) update PRs |
| `.githooks/pre-commit` | Fast local guard (no secrets/node_modules; audit if lockfile staged) |
| `package-lock.json` | **Must** be committed; installs via `npm ci` only in CI |

### Enable the git hook (once per clone)

```bash
git config core.hooksPath .githooks
chmod +x .githooks/pre-commit
```

---

## 3. Safe day-to-day habits

```bash
# Add a dependency
npm install some-package   # updates package-lock.json — commit BOTH files
# Never
npm install --no-save weird-git-url
# CI / clean machine
npm ci
```

When reviewing a Dependabot PR: skim lockfile + changelog; run CI; don’t squash-merge blind major bumps of Expo without a device smoke.

---

## 4. What this does **not** catch

- Malicious maintainer of a package you already trust (needs vigilance / pin / upstream news)
- Compromised Expo/EAS build secrets (rotate `EXPO_TOKEN`, protect signing keys)
- Skipping hooks with `git commit --no-verify` (CI still runs on GitHub)

For release APKs: still follow [releases.md](./releases.md).
