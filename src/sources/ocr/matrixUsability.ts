/**
 * Fail-closed usability gate for OCR review tables.
 * Junk grids (wrong layout, empty cells, fake names) must not reach CompareReview.
 */
import { isPlausiblePersonName } from './names';
import { looksLikeDateDutyAxes, measureAxisCues } from './layouts/axisCues';
import {
  computeMonthMatrixMetrics,
  type MonthMatrixGrid,
} from './layouts/month-matrix';
import type { OcrLine } from './recognize';

export type MatrixUsabilityReason =
  | 'layout-mismatch'
  | 'low-fill'
  | 'no-plausible-names'
  | 'junk-names'
  | 'too-few-rows';

export type MatrixUsabilityAssessment = {
  usable: boolean;
  reason: MatrixUsabilityReason | null;
  fillRatio: number;
  dayCoverage: number;
  rowCount: number;
  solidNames: number;
  junkNames: number;
};

/** Named floors — tune here, not in cameraOcr. */
export const MATRIX_USABILITY_POLICY = {
  /** Month / week person×day: almost-empty body is useless. */
  minFillMonthMatrix: 0.08,
  /** Date×duty: duties are sparse but need some people placed. */
  minFillDateDuty: 0.1,
  /** Classic wall plan needs several real people. */
  minSolidNames: 2,
  /** Single own-row assist / tiny crop. */
  minSolidNamesSolo: 1,
  minSoloFill: 0.12,
  /** Of name-like rows, how many may be junk before we reject. */
  maxJunkNameRatio: 0.55,
  minRowsMonthMatrix: 2,
  minRowsDateDuty: 1,
} as const;

/** Common OCR leftovers that match "Last, First" but are not people. */
const JUNK_NAME_TOKENS = new Set([
  'uhr',
  'bis',
  'alle',
  'vom',
  'zum',
  'der',
  'die',
  'das',
  'und',
  'mit',
  'tag',
  'tage',
  'dienst',
  'dienste',
  'plan',
  'monat',
  'woche',
  'frei',
  'arbeit',
  'soll',
  'ist',
  'std',
  'stunden',
  'pause',
  'beginn',
  'ende',
  'name',
  'namen',
  'seite',
  'blatt',
  'von',
  'nach',
  'oder',
  'bzw',
  'inkl',
  'zeit',
  'zeiten',
  'datum',
]);

const TITLE_ONLY_TOKENS = new Set([
  'dr',
  'dr.',
  'frau',
  'herr',
  'hr',
  'hr.',
  'fr',
  'fr.',
  'oa',
  'oä',
  'fa',
  'ca',
  'foa',
  'aa',
  'prof',
  'prof.',
]);

function normToken(s: string): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-zäöüß.]+/g, '')
    .trim();
}

function splitCommaName(label: string): { left: string; right: string } | null {
  const t = String(label || '')
    .replace(/\s+/g, ' ')
    .trim();
  const i = t.indexOf(',');
  if (i < 0) return null;
  const left = t.slice(0, i).trim();
  const right = t.slice(i + 1).trim();
  if (!left || !right) return null;
  return { left, right };
}

/** True when a plausible-looking label is still calendar/UI junk. */
export function isJunkRosterName(label: string): boolean {
  if (!isPlausiblePersonName(label)) return true;
  const parts = splitCommaName(label);
  if (parts) {
    const L = normToken(parts.left);
    const R = normToken(parts.right.split(/\s+/)[0] || '');
    if (JUNK_NAME_TOKENS.has(L) || JUNK_NAME_TOKENS.has(R)) return true;
    if (TITLE_ONLY_TOKENS.has(L) && TITLE_ONLY_TOKENS.has(R)) return true;
    if (TITLE_ONLY_TOKENS.has(L) && (!R || R.length <= 2)) return true;
  }
  const tokens = String(label || '')
    .split(/[\s,]+/)
    .map(normToken)
    .filter(Boolean);
  if (tokens.length >= 2 && tokens.every((tok) => TITLE_ONLY_TOKENS.has(tok))) {
    return true;
  }
  return false;
}

export function isSolidRosterName(label: string): boolean {
  return isPlausiblePersonName(label) && !isJunkRosterName(label);
}

function countNameQuality(grid: MonthMatrixGrid): {
  solidNames: number;
  junkNames: number;
} {
  let solidNames = 0;
  let junkNames = 0;
  for (const r of grid.rows) {
    const name = String(r.name || '').trim();
    if (!name) continue;
    if (isSolidRosterName(name)) solidNames += 1;
    else if (isPlausiblePersonName(name) || isJunkRosterName(name)) junkNames += 1;
  }
  return { solidNames, junkNames };
}

export type AssessMatrixUsabilityOpts = {
  layoutId: string;
  lines?: OcrLine[];
  pageWidth?: number;
  pageHeight?: number;
  /**
   * When true, skip fill floor (early gate before invert/refine may still fill cells).
   * Layout mismatch + name junk still fail.
   */
  deferFillCheck?: boolean;
};

/**
 * Decide whether a built grid is good enough to show as a review table.
 * One path: usable or a concrete reject reason — no soft recoveries.
 */
export function assessMatrixUsability(
  grid: MonthMatrixGrid | null | undefined,
  opts: AssessMatrixUsabilityOpts
): MatrixUsabilityAssessment {
  const empty: MatrixUsabilityAssessment = {
    usable: false,
    reason: 'too-few-rows',
    fillRatio: 0,
    dayCoverage: 0,
    rowCount: 0,
    solidNames: 0,
    junkNames: 0,
  };
  if (!grid?.ok) return empty;

  const metrics = computeMonthMatrixMetrics(grid);
  const { solidNames, junkNames } = countNameQuality(grid);
  const base: MatrixUsabilityAssessment = {
    usable: true,
    reason: null,
    fillRatio: metrics.fillRatio,
    dayCoverage: metrics.dayCoverage,
    rowCount: metrics.rowCount,
    solidNames,
    junkNames,
  };

  const layoutId = String(opts.layoutId || '');
  const isDateDuty =
    layoutId === 'date-duty' || grid.overlayLayout === 'date-duty';

  // Wrong layout forced / auto-mispick: date×duty board parsed as person×day.
  if (
    !isDateDuty &&
    (layoutId === 'month-matrix' || layoutId === 'week-strip') &&
    opts.lines?.length &&
    (opts.pageWidth || 0) > 0
  ) {
    const cues = measureAxisCues(opts.lines, opts.pageWidth!, opts.pageHeight);
    if (looksLikeDateDutyAxes(cues)) {
      return { ...base, usable: false, reason: 'layout-mismatch' };
    }
  }

  if (isDateDuty) {
    if (metrics.rowCount < MATRIX_USABILITY_POLICY.minRowsDateDuty) {
      return { ...base, usable: false, reason: 'too-few-rows' };
    }
    if (
      !opts.deferFillCheck &&
      metrics.fillRatio < MATRIX_USABILITY_POLICY.minFillDateDuty
    ) {
      return { ...base, usable: false, reason: 'low-fill' };
    }
    return base;
  }

  if (metrics.rowCount < MATRIX_USABILITY_POLICY.minRowsMonthMatrix) {
    // Solo own-row assist: one solid name + enough fill is OK.
    if (
      metrics.rowCount === 1 &&
      solidNames >= MATRIX_USABILITY_POLICY.minSolidNamesSolo &&
      (opts.deferFillCheck ||
        metrics.fillRatio >= MATRIX_USABILITY_POLICY.minSoloFill)
    ) {
      return base;
    }
    return { ...base, usable: false, reason: 'too-few-rows' };
  }

  const nameLike = solidNames + junkNames;
  if (solidNames < MATRIX_USABILITY_POLICY.minSolidNames) {
    if (junkNames > 0 && junkNames >= solidNames) {
      return { ...base, usable: false, reason: 'junk-names' };
    }
    return { ...base, usable: false, reason: 'no-plausible-names' };
  }

  if (
    nameLike >= 3 &&
    junkNames / nameLike > MATRIX_USABILITY_POLICY.maxJunkNameRatio
  ) {
    return { ...base, usable: false, reason: 'junk-names' };
  }

  if (
    !opts.deferFillCheck &&
    metrics.fillRatio < MATRIX_USABILITY_POLICY.minFillMonthMatrix
  ) {
    return { ...base, usable: false, reason: 'low-fill' };
  }

  return base;
}
