#!/usr/bin/env bash
# Static release hygiene checks (no APK build required).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
fail=0

echo "== Release security check =="

check() {
  local desc="$1"
  shift
  if "$@"; then
    echo "OK  $desc"
  else
    echo "FAIL $desc"
    fail=1
  fi
}

check "WebView debug gated on __DEV__" \
  grep -q 'webviewDebuggingEnabled={__DEV__}' src/sources/webview/loga3/shared/Loga3WebView.tsx

check "Smoke cred seed requires __DEV__" \
  grep -q 'isSmokeCredentialSeedAllowed' src/setup/smokeSeed.ts

check "HTTPS-only tenant helper exists" \
  grep -q 'isValidLoga3BaseUrl' src/sources/webview/loga3/shared/env.ts

check "encrypt-at-rest module present" \
  test -f src/state/securePayload.ts

check "biometric module present" \
  test -f src/security/biometric.ts

check "No security-audited claim in play listing draft" \
  bash -c '! grep -qiE "security audited|extern geprüft|penetration test" docs/dev/play-store-listing.md'

check "PROJECT_PRIVACY points at shift.fr4iser.com" \
  grep -q 'shift.fr4iser.com/privacy' src/support/legal.ts

if grep -RInE 'LOGA3_PASSWORD\s*=\s*["'\''][^"'\'']+["'\'']' app src --include='*.ts' --include='*.tsx' --include='*.js' 2>/dev/null | grep -v node_modules; then
  echo "FAIL hardcoded LOGA3_PASSWORD in app/src"
  fail=1
else
  echo "OK  no hardcoded LOGA3_PASSWORD in app/src"
fi

if [[ $fail -ne 0 ]]; then
  echo "RESULT: FAIL"
  exit 1
fi
echo "RESULT: PASS"
echo "Next (manual): eas credentials production SHA-1 → Google OAuth; deploy ShiftPlanConverter; Play Console."
