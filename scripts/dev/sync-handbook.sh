#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
node <<EOF
const fs=require("fs");
const root="$ROOT";
const de=fs.readFileSync(root+"/docs/nutzerhandbuch.md","utf8");
const en=fs.readFileSync(root+"/docs/user-guide.md","utf8");
fs.writeFileSync(root+"/src/docs/handbookMarkdown.ts",
"/** Bundled handbook markdown (synced from docs/). Do not edit by hand — re-run scripts/dev/sync-handbook.sh. */\\n"+
"export const HANDBOOK_DE = "+JSON.stringify(de)+";\\n"+
"export const HANDBOOK_EN = "+JSON.stringify(en)+";\\n"
);
console.log("synced handbookMarkdown.ts");
EOF

