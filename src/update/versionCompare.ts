/** Semver-ish helpers (no Expo imports — safe for Jest). */

export function parseVersionParts(raw: string): number[] {
  const core = String(raw || '')
    .replace(/^v/i, '')
    .split('-')[0]
    .trim();
  return core.split('.').map((p) => {
    const n = parseInt(p.replace(/[^\d]/g, ''), 10);
    return Number.isFinite(n) ? n : 0;
  });
}

/** -1 if a<b, 0 equal, 1 if a>b */
export function compareVersions(a: string, b: string): number {
  const aa = parseVersionParts(a);
  const bb = parseVersionParts(b);
  const len = Math.max(aa.length, bb.length);
  for (let i = 0; i < len; i++) {
    const x = aa[i] ?? 0;
    const y = bb[i] ?? 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}
