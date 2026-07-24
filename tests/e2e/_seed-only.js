#!/usr/bin/env node
const { spawnSync } = require('child_process');
const fs = require('fs');
const SERIAL = process.env.ANDROID_SERIAL || 'ZY22J3RHFC';
const PKG = 'com.fr4iser.loga3mobile';
const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
const vals = {};
for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
  if (!line.includes('=') || line.trim().startsWith('#')) continue;
  const i = line.indexOf('=');
  vals[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}
const qs = new URLSearchParams({
  smoke: '1',
  url: vals.LOGA3_BASE_URL,
  user: vals.LOGA3_USERNAME,
  pass: vals.LOGA3_PASSWORD,
  hospital: 'st-elisabeth-leipzig',
  group: 'pflege',
  area: 'op-bereich',
  preset: 'Anästhesie',
}).toString();
const deep = `loga3mobile:///?${qs}`;
const r = spawnSync(
  'adb',
  ['-s', SERIAL, 'shell', `am start -a android.intent.action.VIEW -d ${q(deep)} ${PKG}`],
  { encoding: 'utf8' }
);
console.log('SEED', r.status);
if (r.status !== 0) {
  console.error(r.stderr || r.stdout);
  process.exit(r.status || 1);
}
