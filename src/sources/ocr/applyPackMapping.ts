/**
 * Apply pack shift mapping to OCR matrix cells — one path, no silent layout alternatives.
 *
 * Cells on the wall plan are either a Dienstkürzel, a time range, or both.
 * Mapping uses the pack as oracle: clean times → code; known codes → normalize;
 * mashed OCR digits → match pack time fingerprints when unique.
 *
 * When the user's row is known, `refinePersonRowFromOcr` re-scoops that Y-band
 * with looser geometry and the same pack oracle (still one algorithm, not a retry chain).
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
function cellDigits(raw: string): string {
  return String(raw || '')
    .replace(/[oO]/g, '0')
    .replace(/[^\d]/g, '');
}

/**
 * Match mashed digit soup against pack time keys (oracle).
 * Prefers exact 8-digit fingerprint containment; then unique start-HHMM hit.
 */
export function matchDigitsToPackCode(
  digits: string,
  fingerprints: PackFingerprint[]
): string | null {
  if (!digits || digits.length < 4 || !fingerprints.length) return null;

  const exact = fingerprints.filter((f) => digits.includes(f.digits) || f.digits.includes(digits));
  if (exact.length === 1) return exact[0].code;
  if (exact.length > 1) {
    // Prefer full 8-digit containment over partial
    const full = exact.filter((f) => digits.includes(f.digits));
    if (full.length === 1) return full[0].code;
  }

  if (digits.length >= 8) {
    const slice = digits.slice(0, 8);
    const hit = fingerprints.filter((f) => f.digits === slice);
    if (hit.length === 1) return hit[0].code;
  }

  // Unique start time (first 4 digits) → resolve with nearest end via pack resolver later
  if (digits.length >= 4) {
    const startDigits = digits.slice(0, 4);
    const startHits = fingerprints.filter((f) => f.digits.startsWith(startDigits));
    if (startHits.length === 1) return startHits[0].code;
    if (digits.length >= 8) {
      const endDigits = digits.slice(4, 8);
      const both = fingerprints.filter(
        (f) => f.digits.startsWith(startDigits) && f.digits.endsWith(endDigits)
      );
      if (both.length === 1) return both[0].code;
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
    return t;
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

  // Pack-oracle on digit soup (Zeiten ohne sauberes HH:MM-HH:MM).
  const digits = cellDigits(t);
  const fromDigits = matchDigitsToPackCode(digits, fps);
  if (fromDigits) return fromDigits;

  // Last chance: format-like reconstruction then resolve
  if (digits.length >= 8) {
    const start = `${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
    const end = `${digits.slice(4, 6)}:${digits.slice(6, 8)}`;
    if (Object.keys(map).length) {
      const hit = resolveShiftMapping(start, end, map);
      if (hit.code) return hit.code;
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
 * After the user row is known: re-scoop that Y-band per day column (looser geometry)
 * and re-apply pack oracle. Only upgrades empty/unmapped cells to known pack codes.
 * Same algorithm as the grid build — not a second layout path.
 */
export function refinePersonRowFromOcr(
  grid: MonthMatrixGrid,
  personName: string,
  lines: OcrLine[],
  presetMapping: Record<string, MappingValue> | null | undefined,
  colors?: Record<string, string> | null
): MonthMatrixGrid {
  const centers = grid.colCenters;
  if (!centers?.length || !lines.length || !personName) return grid;

  const key = nameKey(personName);
  const rowIdx = grid.rows.findIndex(
    (r) => nameKey(r.name) === key || nameKey(r.name).includes(key) || key.includes(nameKey(r.name))
  );
  if (rowIdx < 0) return grid;

  const row = grid.rows[rowIdx];
  const codes = collectPackCodes(presetMapping, colors);
  const nameMaxX = grid.nameMaxX ?? 0;
  const colGap = grid.colGap ?? 40;
  const rowYPad = (grid.rowYPad ?? 28) * 1.55;
  const xTol = colGap * 1.65;

  const nextCells = centers.map((cx, i) => {
    const prev = row.cells[i] || '';
    const prevMapped = applyPackMappingToCell(prev, presetMapping, codes);
    if (prevMapped && codes.has(prevMapped.toUpperCase())) return prevMapped;

    const candidates = lines.filter((l) => {
      const xc = xCenter(l);
      if (nameMaxX > 0 && xc < nameMaxX && l.boundingBox.x < nameMaxX * 0.9) return false;
      if (Math.abs(yCenter(l) - row.yCenter) > rowYPad) return false;
      return Math.abs(xc - cx) < xTol;
    });
    if (!candidates.length) return prevMapped || prev;

    const texts = candidates
      .sort((a, b) => a.boundingBox.y - b.boundingBox.y)
      .map((l) => cleanCell(l.text))
      .filter((t) => t && !looksLikeDayHeader(t));
    const joined = formatShiftCell([...new Set(texts)]);
    const mapped = applyPackMappingToCell(joined || texts.join(' '), presetMapping, codes);
    if (mapped && codes.has(mapped.toUpperCase())) return mapped;
    // Prefer any improvement over empty
    if (!prev && mapped) return mapped;
    if (!prev && joined) return joined;
    return prevMapped || prev;
  });

  const rows = grid.rows.slice();
  rows[rowIdx] = { ...row, cells: nextCells };
  return { ...grid, rows };
}
