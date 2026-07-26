import type { OcrLine } from '../recognize';

export function yCenter(l: OcrLine): number {
  return l.boundingBox.y + l.boundingBox.height / 2;
}

export function xCenter(l: OcrLine): number {
  return l.boundingBox.x + l.boundingBox.width / 2;
}

/** Day column that owns this X (Voronoi) — one token → one column, no bleed. */
export function nearestColIndex(xc: number, centers: number[]): number {
  if (!centers.length) return -1;
  let best = 0;
  let bestD = Math.abs(xc - centers[0]);
  for (let i = 1; i < centers.length; i++) {
    const d = Math.abs(xc - centers[i]);
    // Tie → prefer the right-hand column (left-aligned text sits left of its column center).
    if (d < bestD || (d === bestD && i > best)) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Cluster sorted numbers into groups (gap > threshold → new cluster). */
export function clusterSorted(values: { v: number; item: OcrLine }[], gap: number): OcrLine[][] {
  if (!values.length) return [];
  const sorted = values.slice().sort((a, b) => a.v - b.v);
  const groups: OcrLine[][] = [];
  let cur: OcrLine[] = [sorted[0].item];
  let prev = sorted[0].v;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].v - prev > gap) {
      groups.push(cur);
      cur = [sorted[i].item];
    } else {
      cur.push(sorted[i].item);
    }
    prev = sorted[i].v;
  }
  groups.push(cur);
  return groups;
}

export function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = nums.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function cleanCell(text: string): string {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function looksLikeDayHeader(text: string): boolean {
  const t = cleanCell(text);
  if (!t) return false;
  // Weekday + day only — bare digits appear in every cell and must not win header scoring.
  if (/^(Mo|Di|Mi|Do|Fr|Sa|So)\s*\d{1,2}$/i.test(t)) return true;
  if (/^(Mo|Di|Mi|Do|Fr|Sa|So)\d{1,2}$/i.test(t)) return true;
  return false;
}

export function looksLikeShiftCell(text: string): boolean {
  const t = cleanCell(text);
  if (!t || t.length > 28) return false;
  if (/^(Mo|Di|Mi|Do|Fr|Sa|So)$/i.test(t)) return false;
  // Pack / wall-plan codes (must not land in the name column).
  if (
    /^(U|K|N|F|S|ST|FT|MO|OP|OP-N|URLAUB|KRANK|KROAU|FEIERTAG|FK\d?|B\d{1,2}|M\d|F\d|S\d|N\d)$/i.test(
      t
    )
  ) {
    return true;
  }
  if (/^\d{1,2}[:.]\d{2}(-\d{1,2}[:.]\d{2})?$/.test(t)) return true;
  // OCR fragments like "a:16" / ":30" in the name gutter
  if (/^[a-z]?:?\d{2}$/i.test(t)) return true;
  // Letter+digit codes (B36, F12) — not bare names ("Alexander").
  if (/^[A-ZÄÖÜ]{1,3}\d{1,2}$/i.test(t) && t.length <= 5) return true;
  // Short letter-only codes (U, F, ST).
  if (/^[A-ZÄÖÜ]{1,3}$/i.test(t) && t.length <= 3) return true;
  return false;
}

export function looksLikeWeekdayOnly(text: string): boolean {
  // Keep case-flexible for OCR ("MI", "sO") but not lone shift-code "MO"/"ST".
  const t = cleanCell(text);
  if (/^(MO|ST|OP|FT|RU)$/.test(t)) return false;
  return /^(Mo|Di|Mi|Do|Fr|Sa|So)$/i.test(t);
}

export function looksLikeDayNumber(text: string): boolean {
  const t = cleanCell(text);
  if (!/^\d{1,2}$/.test(t)) return false;
  const n = Number(t);
  return n >= 1 && n <= 31;
}

export function normalizeHeader(text: string): string {
  const t = cleanCell(text).replace(/\s+/g, '');
  const m = t.match(/^(Mo|Di|Mi|Do|Fr|Sa|So)\s*(\d{1,2})$/i);
  if (m) return `${m[1].slice(0, 1).toUpperCase()}${m[1].slice(1).toLowerCase()}${m[2]}`;
  const m2 = t.match(/^(Mo|Di|Mi|Do|Fr|Sa|So)(\d{1,2})$/i);
  if (m2) return `${m2[1][0].toUpperCase()}${m2[1].slice(1).toLowerCase()}${m2[2]}`;
  if (/^\d{1,2}$/.test(t)) return t;
  return cleanCell(text).slice(0, 8);
}
