/**
 * Apply pack shift mapping to OCR matrix cells — one path, no silent layout alternatives.
 *
 * Cells on the wall plan are either a Dienstkürzel, a time range, or both.
 * Mapping uses the pack as oracle: clean times → code; known codes → normalize;
 * mashed OCR digits → match pack time fingerprints when unique.
 *
 * When the user's row is known, `refinePersonRowFromOcr` re-scoops that Y-band
 * with looser geometry and the same pack oracle (still one algorithm, not a retry chain).
 * Refine only upgrades to known pack codes — never writes unmapped time mush.
 */
import { mappingCode, resolveShiftMapping } from '../../convert/shiftMapping';
import type { MappingValue } from '../../convert/types';
import { formatShiftCell } from './monthMatrix/format';
import { cleanCell, looksLikeDayHeader, xCenter, yCenter } from './monthMatrix/geometry';
import type { MonthMatrixGrid } from './monthMatrix/types';
import type { OcrLine } from './recognize';

const TIME_RANGE_RE = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/;

/** Codes declared on the pack (preset values + color keys). */
export function collectPackCodes(
  presetMapping: Record<string, MappingValue> | null | undefined,
  colors?: Record<string, string> | null
): Set<string> {
  const codes = new Set<string>();
  if (colors) {
    for (const k of Object.keys(colors)) {
      const c = k.trim().toUpperCase();
      if (c) codes.add(c);
    }
  }
  if (presetMapping) {
    for (const v of Object.values(presetMapping)) {
      const { code } = mappingCode(v);
      if (code) codes.add(code.trim().toUpperCase());
    }
  }
  // Common wall-plan short forms for leave / sick (often only the letter is printed).
  for (const extra of ['U', 'K', 'N', 'ST', 'FT', 'RU']) codes.add(extra);
  return codes;
}

type PackFingerprint = { digits: string; start: string; end: string; code: string };

function listPackFingerprints(
  presetMapping: Record<string, MappingValue> | null | undefined
): PackFingerprint[] {
  if (!presetMapping) return [];
  const out: PackFingerprint[] = [];
  for (const [key, value] of Object.entries(presetMapping)) {
    if (key.startsWith('SPECIAL:')) continue;
    const m = key.match(/^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/);
    if (!m) continue;
    const { code } = mappingCode(value);
    if (!code) continue;
    out.push({
      digits: `${m[1]}${m[2]}${m[3]}${m[4]}`,
      start: `${m[1]}:${m[2]}`,
      end: `${m[3]}:${m[4]}`,
      code: code.trim().toUpperCase(),
    });
  }
  return out;
}

/** OCR often uses o/O for 0 and glues times — keep digits only. */
export function cellDigits(raw: string): string {
  return String(raw || '')
    .replace(/[oO]/g, '0')
    .replace(/[^\d]/g, '');
}

function hamming8(a: string, b: string): number {
  if (a.length !== 8 || b.length !== 8) return 99;
  let d = 0;
  for (let i = 0; i < 8; i++) if (a[i] !== b[i]) d++;
  return d;
}

function uniqueCode(hits: PackFingerprint[]): string | null {
  const codes = [...new Set(hits.map((h) => h.code))];
  return codes.length === 1 ? codes[0] : null;
}

/**
 * Match mashed digit soup against pack time keys (oracle).
 * Prefers exact 8-digit fingerprint; sliding windows; Hamming≤1 if unique;
 * then unique start/end HHMM.
 */
export function matchDigitsToPackCode(
  digits: string,
  fingerprints: PackFingerprint[]
): string | null {
  if (!digits || digits.length < 4 || !fingerprints.length) return null;

  const exact = fingerprints.filter((f) => digits.includes(f.digits) || f.digits.includes(digits));
  if (exact.length === 1) return exact[0].code;
  if (exact.length > 1) {
    const full = exact.filter((f) => digits.includes(f.digits));
    const u = uniqueCode(full);
    if (u) return u;
  }

  // Sliding 8-digit windows (OCR often prepends/appends junk digits).
  if (digits.length >= 8) {
    const windows: string[] = [];
    for (let i = 0; i + 8 <= digits.length; i++) windows.push(digits.slice(i, i + 8));
    const windowHits = fingerprints.filter((f) => windows.includes(f.digits));
    const u = uniqueCode(windowHits);
    if (u) return u;

    // One-digit OCR typo (13→18 etc.) — only if a single pack code wins.
    const fuzzy: PackFingerprint[] = [];
    for (const w of windows) {
      for (const f of fingerprints) {
        if (hamming8(w, f.digits) <= 1) fuzzy.push(f);
      }
    }
    const uf = uniqueCode(fuzzy);
    if (uf) return uf;
  }

  if (digits.length >= 4) {
    const startDigits = digits.slice(0, 4);
    const startHits = fingerprints.filter((f) => f.digits.startsWith(startDigits));
    const us = uniqueCode(startHits);
    if (us) return us;

    if (digits.length >= 8) {
      const endDigits = digits.slice(4, 8);
      const both = fingerprints.filter(
        (f) => f.digits.startsWith(startDigits) && f.digits.endsWith(endDigits)
      );
      const ub = uniqueCode(both);
      if (ub) return ub;

      // Unique end time alone (last 4 of an 8-digit window)
      const endHits = fingerprints.filter((f) => f.digits.endsWith(endDigits));
      const ue = uniqueCode(endHits);
      if (ue) return ue;
    } else if (digits.length === 4) {
      // Lone HHMM: unique as start OR as end (not both different codes)
      const asStart = fingerprints.filter((f) => f.digits.startsWith(digits));
      const asEnd = fingerprints.filter((f) => f.digits.endsWith(digits));
      const u1 = uniqueCode(asStart);
      const u2 = uniqueCode(asEnd);
      if (u1 && (!u2 || u1 === u2)) return u1;
      if (u2 && !u1) return u2;
    }
  }
  return null;
}

function findKnownCodeInText(t: string, codes: Set<string>): string | null {
  const upper = t.toUpperCase().replace(/\s+/g, '');
  if (codes.has(upper)) return upper;
  // Prefer longer codes first (B38 before B, ST before S)
  const sorted = [...codes].sort((a, b) => b.length - a.length);
  for (const c of sorted) {
    if (c.length < 1) continue;
    const re = new RegExp(`(^|[^A-Z0-9])${c}([^A-Z0-9]|$)`);
    if (re.test(upper)) return c;
  }
  return null;
}

function isPackCode(v: string, codes: Set<string>): boolean {
  return !!v && codes.has(v.trim().toUpperCase());
}

/**
 * Map one OCR cell through the pack. Empty → empty.
 * Accepts Kürzel-only, Zeit-only, or mashed OCR — pack oracle decides.
 */
export function applyPackMappingToCell(
  raw: string,
  presetMapping: Record<string, MappingValue> | null | undefined,
  knownCodes?: Set<string>
): string {
  const t = String(raw || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return '';

  const codes = knownCodes ?? collectPackCodes(presetMapping, null);
  const map = presetMapping || {};
  const fps = listPackFingerprints(map);

  const range = t.match(TIME_RANGE_RE);
  if (range) {
    if (!Object.keys(map).length) return t;
    const start = `${range[1]}:${range[2]}`;
    const end = `${range[3]}:${range[4]}`;
    const hit = resolveShiftMapping(start, end, map);
    if (hit.code) return hit.code;
    // Reversed OCR (end-start printed/swapped)
    const rev = resolveShiftMapping(end, start, map);
    if (rev.code) return rev.code;
    // Fall through to digit oracle (typos inside an otherwise HH:MM-HH:MM shape)
  }

  const asCode = findKnownCodeInText(t, codes);
  if (asCode) return asCode;

  const confused = t
    .toUpperCase()
    .replace(/0/g, 'O')
    .replace(/1/g, 'I')
    .replace(/5/g, 'S')
    .replace(/8/g, 'B');
  if (confused !== t.toUpperCase() && codes.has(confused)) return confused;

  const digits = cellDigits(t);
  const fromDigits = matchDigitsToPackCode(digits, fps);
  if (fromDigits) return fromDigits;

  if (digits.length >= 8) {
    const start = `${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
    const end = `${digits.slice(4, 6)}:${digits.slice(6, 8)}`;
    if (Object.keys(map).length) {
      const hit = resolveShiftMapping(start, end, map);
      if (hit.code) return hit.code;
      const rev = resolveShiftMapping(end, start, map);
      if (rev.code) return rev.code;
    }
  }

  return t;
}

/** Map every cell in the grid; headers/names unchanged. */
export function applyPackMappingToGrid(
  grid: MonthMatrixGrid,
  presetMapping: Record<string, MappingValue> | null | undefined,
  colors?: Record<string, string> | null
): MonthMatrixGrid {
  if (!grid.rows.length) return grid;
  const codes = collectPackCodes(presetMapping, colors);
  const hasMap = !!(presetMapping && Object.keys(presetMapping).length) || codes.size > 0;
  if (!hasMap) return grid;

  return {
    ...grid,
    rows: grid.rows.map((r) => ({
      ...r,
      cells: r.cells.map((c) => applyPackMappingToCell(c, presetMapping, codes)),
    })),
  };
}

function nameKey(s: string): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9,]+/g, ' ')
    .trim();
}

/**
 * After the user row is known: re-scoop that Y-band per day column and re-apply pack oracle.
 * Only upgrades to known pack codes — never writes unmapped neighbor-row time mush.
 */
export function refinePersonRowFromOcr(
  grid: MonthMatrixGrid,
  personName: string,
  lines: OcrLine[],
  presetMapping: Record<string, MappingValue> | null | undefined,
  colors?: Record<string, string> | null
): MonthMatrixGrid {
  const centers = grid.colCenters;
  if (!centers?.length || !personName) return grid;

  const key = nameKey(personName);
  const rowIdx = grid.rows.findIndex(
    (r) => nameKey(r.name) === key || nameKey(r.name).includes(key) || key.includes(nameKey(r.name))
  );
  if (rowIdx < 0) return grid;

  const row = grid.rows[rowIdx];
  const codes = collectPackCodes(presetMapping, colors);
  const nameMaxX = grid.nameMaxX ?? 0;
  const colGap = grid.colGap ?? 40;
  // Tighter than before — neighbor rows were leaking times into empty cells.
  const rowYPad = (grid.rowYPad ?? 28) * 0.95;
  const xTol = colGap * 1.55;

  const nextCells = centers.map((cx, i) => {
    const prev = row.cells[i] || '';
    const prevMapped = applyPackMappingToCell(prev, presetMapping, codes);
    if (isPackCode(prevMapped, codes)) return prevMapped;

    if (!lines.length) return '';

    const candidates = lines
      .filter((l) => {
        const xc = xCenter(l);
        if (nameMaxX > 0 && xc < nameMaxX && l.boundingBox.x < nameMaxX * 0.9) return false;
        if (Math.abs(yCenter(l) - row.yCenter) > rowYPad) return false;
        return Math.abs(xc - cx) < xTol;
      })
      .map((l) => ({ l, dy: Math.abs(yCenter(l) - row.yCenter) }))
      .sort((a, b) => a.dy - b.dy || a.l.boundingBox.y - b.l.boundingBox.y);

    if (!candidates.length) {
      // No geometry hit: keep pack codes, drop unmapped leftovers.
      return isPackCode(prevMapped, codes) ? prevMapped : '';
    }

    // Prefer any single token that maps to a pack code (Kürzel printed on the plan).
    for (const { l } of candidates) {
      const tok = cleanCell(l.text);
      if (!tok || looksLikeDayHeader(tok)) continue;
      const mappedTok = applyPackMappingToCell(tok, presetMapping, codes);
      if (isPackCode(mappedTok, codes)) return mappedTok;
    }

    // Keep tokens near the closest hit for joined Zeit cells (start/end on two lines).
    const nearestDy = candidates[0].dy;
    const band = Math.max(16, rowYPad * 0.7);
    const tight = candidates.filter((c) => c.dy <= nearestDy + band);
    const texts = tight
      .map(({ l }) => cleanCell(l.text))
      .filter((t) => t && !looksLikeDayHeader(t));
    const joined = formatShiftCell([...new Set(texts)]);
    const mapped = applyPackMappingToCell(joined || texts.join(' '), presetMapping, codes);
    if (isPackCode(mapped, codes)) return mapped;

    // Digit oracle on concatenated tokens (07.35- on one line, 1550 on the next).
    const allDigits = cellDigits(texts.join(''));
    const fromDigits = matchDigitsToPackCode(allDigits, listPackFingerprints(presetMapping));
    if (fromDigits) return fromDigits;

    // Focused row: never keep unmapped time mush — empty is clearer than a wrong range.
    return '';
  });

  const rows = grid.rows.slice();
  rows[rowIdx] = { ...row, cells: nextCells };
  return { ...grid, rows };
}
