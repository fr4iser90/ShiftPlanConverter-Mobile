#!/usr/bin/env bash
# Print SHA-1 / SHA-256 for Google Cloud Console → Android OAuth client.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
KS="${1:-$ROOT/android/app/debug.keystore}"
ALIAS="${2:-androiddebugkey}"
STOREPASS="${3:-android}"
KEYPASS="${4:-android}"

if [[ ! -f "$KS" ]]; then
  echo "keystore missing: $KS" >&2
  exit 1
fi

echo "keystore: $KS"
echo "package:  com.fr4iser.loga3mobile"
echo "---"
keytool -list -v -keystore "$KS" -alias "$ALIAS" -storepass "$STOREPASS" -keypass "$KEYPASS" \
  | grep -E 'Alias name:|SHA1:|SHA256:'
echo "---"
echo "Google Cloud Console → Credentials → Create OAuth client → Android"
echo "  Package name: com.fr4iser.loga3mobile"
echo "  SHA-1:        (line above, keep the colons)"
echo "No redirect URIs. Keep the existing Web client for token minting."
echo "See docs/google-oauth-android.md"
