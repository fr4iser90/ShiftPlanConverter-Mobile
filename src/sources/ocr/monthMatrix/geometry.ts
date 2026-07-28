/**
 * Month-matrix geometry helpers.
 * Calendar weekday shapes and token shapes only — pack codes and duty times stay in pack maps.
 */
import type { OcrLine } from '../recognize';

export function yCenter(l: OcrLine): number {
  return l.boundingBox.y + l.boundingBox.height / 2;
}

export function xCenter(l: OcrLine): number {
  return l.boundingBox.x + l.boundingBox.width / 2;
}

export function cleanCell(text: string): string {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = nums.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

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

export function looksLikeDayHeader(text?: string | null): boolean {
  const t = cleanCell(text || '');
  if (!t) return false;
  if (/^(Mo|Di|Mi|Do|Fr|Sa|So)\s*\d{1,2}$/i.test(t)) return true;
  if (/^(Mo|Di|Mi|Do|Fr|Sa|So)\d{1,2}$/i.test(t)) return true;
  // OCR sometimes emits day-before-weekday: "24Di", "20Fr".
  if (/^\d{1,2}\s*(Mo|Di|Mi|Do|Fr|Sa|So)$/i.test(t)) return true;
  return false;
}

export function looksLikeWeekdayOnly(text: string): boolean {
  const t = cleanCell(text);
  // Accept Title-case and ALL-CAPS (OCR often emits "SA"/"MO"). Duty codes in the
  // body are handled by pack mapping / short-code shapes, not by rejecting caps here.
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
  // "24Di" / "Mot7" (1→t) → Di24 / Mo17
  const rev = t.match(/^(\d{1,2})(Mo|Di|Mi|Do|Fr|Sa|So)$/i);
  if (rev) {
    const wd = `${rev[2][0].toUpperCase()}${rev[2].slice(1).toLowerCase()}`;
    return `${wd}${rev[1]}`;
  }
  const ocr1 = t.match(/^(Mo|Di|Mi|Do|Fr|Sa|So)[tlI|](\d)$/i);
  if (ocr1) {
    const wd = `${ocr1[1][0].toUpperCase()}${ocr1[1].slice(1).toLowerCase()}`;
    return `${wd}1${ocr1[2]}`;
  }
  if (/^\d{1,2}$/.test(t)) return t;
  return cleanCell(text).slice(0, 8);
}

export function looksLikeShortCodeToken(text?: string | null): boolean {
  const raw = cleanCell(text || '');
  const t = raw.toUpperCase().replace(/\s+/g, '');
  if (!t || t.length > 6) return false;
  if (/^(Mo|Di|Mi|Do|Fr|Sa|So)\d*$/i.test(t)) return false;
  // Title-case words are person-name fragments, not duty codes.
  if (/^[A-ZÄÖÜ][a-zäöüß]{2,}/.test(raw)) return false;
  // Duty shapes: letter(s) + optional digits, or short all-caps / hyphenated codes.
  if (/^[A-ZÄÖÜ]{1,3}\d{1,2}$/.test(t)) return true;
  if (/^[A-ZÄÖÜ]{1,2}$/.test(t) && t === raw.replace(/\s+/g, '').toUpperCase()) return true;
  if (/^[A-ZÄÖÜ]{2,3}-[A-ZÄÖÜ0-9]{1,3}$/.test(t)) return true;
  // All-caps 2–3 letter codes (not Title Case names).
  if (/^[A-ZÄÖÜ]{2,3}$/.test(t) && raw === raw.toUpperCase()) return true;
  return false;
}

export function looksLikeClockCrumb(text?: string | null): boolean {
  const t = cleanCell(text || '');
  if (!t || looksLikeShortCodeToken(t)) return false;
  const d = t.replace(/[oO]/g, '0').replace(/[^\d]/g, '');
  if (!d || d.length > 8) return false;
  if (/^\d{1,2}[:.]\d{2}(-\d{1,2}[:.]\d{2})?$/.test(t)) return true;
  return /^\d{1,4}$/.test(d);
}

export function looksLikeShiftCell(text: string): boolean {
  const t = cleanCell(text);
  if (!t || t.length > 28) return false;
  if (looksLikeWeekdayOnly(t) || looksLikeDayHeader(t)) return false;
  if (looksLikeShortCodeToken(t)) return true;
  if (/^\d{1,2}[:.]\d{2}(-\d{1,2}[:.]\d{2})?$/.test(t)) return true;
  if (/^[a-z]?:?\d{2}$/i.test(t)) return true;
  if (/^[A-ZÄÖÜ]{1,3}\d{1,2}$/.test(t.toUpperCase()) && t.length <= 5 && t === t.toUpperCase()) {
    return true;
  }
  if (/^[A-ZÄÖÜ]{1,3}$/.test(t.toUpperCase()) && t.length <= 3 && t === t.toUpperCase()) {
    return true;
  }
  if (/^\d{3,8}$/.test(t.replace(/[^\d]/g, ''))) return true;
  return false;
}

export function looksLikeSoftRightCodeToken(text?: string | null): boolean {
  return looksLikeShortCodeToken(text);
}

function dayColBounds(
  centers: number[],
  nameMaxX: number,
  pageRight?: number
): { left: number; right: number }[] {
  const rightEdge =
    pageRight != null && Number.isFinite(pageRight)
      ? pageRight
      : centers.length
        ? centers[centers.length - 1] + (centers[1] - centers[0] || 40)
        : 0;
  return centers.map((c, i) => {
    const left = i === 0 ? Math.max(nameMaxX, c - (centers[1] - c || 40) / 2) : (centers[i - 1] + c) / 2;
    const right = i === centers.length - 1 ? rightEdge : (c + centers[i + 1]) / 2;
    return { left, right };
  });
}

export function nearestColIndex(xc: number, centers: number[], text?: string | null): number {
  if (!centers.length) return -1;
  let best = 0;
  let bestD = Math.abs(xc - centers[0]);
  for (let i = 1; i < centers.length; i++) {
    const d = Math.abs(xc - centers[i]);
    if (d < bestD || (d === bestD && i > best)) {
      bestD = d;
      best = i;
    }
  }
  if (!text || centers.length < 2) return best;

  const gaps: number[] = [];
  for (let i = 1; i < centers.length; i++) gaps.push(centers[i] - centers[i - 1]);
  const medGap = median(gaps.filter((g) => g > 0)) || 40;
  const soft = Math.min(14, Math.max(6, medGap * 0.28));

  if (
    (looksLikeShortCodeToken(text) || looksLikeClockCrumb(text)) &&
    best + 1 < centers.length
  ) {
    const left = centers[best];
    const right = centers[best + 1];
    const mid = (left + right) / 2;
    if (xc < mid && mid - xc <= soft) return best + 1;
  }

  if (looksLikeClockCrumb(text) && best > 0) {
    const left = centers[best - 1];
    const right = centers[best];
    const mid = (left + right) / 2;
    if (xc > mid && xc - mid <= soft) return best - 1;
  }

  return best;
}

export function owningColIndex(
  line: OcrLine,
  centers: number[],
  nameMaxX = 0,
  pageRight?: number
): number {
  if (!centers.length) return -1;
  const bb = line.boundingBox;
  const gaps: number[] = [];
  for (let i = 1; i < centers.length; i++) gaps.push(centers[i] - centers[i - 1]);
  const medGap = median(gaps.filter((g) => g > 0)) || 40;
  const soft = Math.min(14, Math.max(6, medGap * 0.28));
  const bounds = dayColBounds(centers, nameMaxX, pageRight).map((b) => ({
    left: b.left - soft,
    right: b.right - soft,
  }));

  const x0 = bb.x;
  const voteX1 = bb.width > medGap * 1.5 ? x0 + bb.width * 0.5 : x0 + bb.width;

  let best = 0;
  let bestOv = -1;
  for (let i = 0; i < bounds.length; i++) {
    const ov = Math.max(0, Math.min(voteX1, bounds[i].right) - Math.max(x0, bounds[i].left));
    if (ov > bestOv || (ov === bestOv && i > best)) {
      bestOv = ov;
      best = i;
    }
  }
  if (bestOv > 0) return best;
  return nearestColIndex(xCenter(line), centers, cleanCell(line.text));
}
