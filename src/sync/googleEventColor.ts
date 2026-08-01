/**
 * Map pack hex colors → Google Calendar event colorId ("1"…"11").
 * Palette + heuristics aligned with desktop ShiftPlanConverter `mapHexToGoogleColorId`.
 */

/** Google Calendar event color palette (API colors.event). */
export const GOOGLE_EVENT_COLORS: Record<string, string> = {
  '1': '#a4bdfc',
  '2': '#7ae7bf',
  '3': '#dbadff',
  '4': '#ff887c',
  '5': '#fbd75b',
  '6': '#ffb878',
  '7': '#46d6db',
  '8': '#e1e1e1',
  '9': '#5484ed',
  '10': '#51b749',
  '11': '#dc2127',
};

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return null;
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

function findClosestColorId(targetHex: string): string | null {
  const target = hexToRgb(targetHex);
  if (!target) return null;
  let bestId: string | null = null;
  let bestDist = Infinity;
  for (const [id, gHex] of Object.entries(GOOGLE_EVENT_COLORS)) {
    const rgb = hexToRgb(gHex);
    if (!rgb) continue;
    const d =
      (target.r - rgb.r) ** 2 + (target.g - rgb.g) ** 2 + (target.b - rgb.b) ** 2;
    if (d < bestDist) {
      bestDist = d;
      bestId = id;
    }
  }
  return bestId;
}

/** Normalize pack color to #rrggbb lowercase, or null. */
export function normalizePackHex(hex: string | null | undefined): string | null {
  if (!hex) return null;
  const s = String(hex).trim();
  if (/^hsl/i.test(s)) return null; // in-app hash fallback — not for Google
  const m = /^#?([a-f\d]{3}|[a-f\d]{6})$/i.exec(s);
  if (!m) return null;
  let h = m[1].toLowerCase();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return `#${h}`;
}

/**
 * Map a pack hex color to Google Calendar colorId ("1"–"11").
 * Returns null when hex is missing/invalid (caller omits colorId → calendar default).
 */
export function mapHexToGoogleColorId(hex: string | null | undefined): string | null {
  const target = normalizePackHex(hex);
  if (!target) return null;

  for (const [id, gHex] of Object.entries(GOOGLE_EVENT_COLORS)) {
    if (gHex.toLowerCase() === target) return id;
  }

  // Fast buckets for common pack greens / yellows / blues / reds / purples
  if (/#(22c55e|4ade80|86efac|bbf7d0|51b749|16a34a|15803d|166534|14532d|2ecc71|27ae60)$/i.test(target)) {
    return '10';
  }
  if (/#(eab308|facc15|fef08a|fbd75b|f1c40f|f39c12)$/i.test(target)) return '5';
  if (/#(3b82f6|60a5fa|93c5fd|5484ed|3498db|2980b9)$/i.test(target)) return '9';
  if (/#(ef4444|f87171|dc2626|b91c1c|dc2127|e74c3c|c0392b|f97316)$/i.test(target)) return '11';
  if (/#(8b5cf6|a78bfa|dbadff|9b59b6|8e44ad)$/i.test(target)) return '3';
  if (/#(0f766e|134e4a|46d6db|14b8a6)$/i.test(target)) return '7';

  return findClosestColorId(target);
}

/** Resolve pack hex for a shift code (exact, then base without *). */
export function packHexForShiftType(
  type: string,
  packColors?: Record<string, string> | null
): string | null {
  if (!packColors) return null;
  const code = (type || '').replace(/\s*⚠️.*$/, '').trim();
  if (!code) return null;
  const direct = normalizePackHex(packColors[code]);
  if (direct) return direct;
  const base = code.replace(/\*$/, '');
  if (base !== code) return normalizePackHex(packColors[base]);
  return null;
}

export function googleColorIdForShiftType(
  type: string,
  packColors?: Record<string, string> | null
): string | null {
  return mapHexToGoogleColorId(packHexForShiftType(type, packColors));
}
