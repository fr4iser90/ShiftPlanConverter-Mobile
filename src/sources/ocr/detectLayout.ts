/**
 * Single-shot layout detection for OCR `auto`.
 *
 * One OCR result → score candidates → pick the winner once.
 * Not a retry chain: never “month failed → try list → try week”.
 */
import { buildMonthMatrixGrid } from './monthMatrix';
import type { OcrLine } from './recognize';
import type { ConcreteOcrLayoutId } from './layouts';

export type OcrLayoutDetection = {
  layoutId: ConcreteOcrLayoutId;
  /** 0..1 confidence of the winner */
  score: number;
  scores: Record<ConcreteOcrLayoutId, number>;
  reason: string;
};

/** Below this, prefer raw-review over a weak structural guess. */
export const OCR_LAYOUT_AUTO_MIN_SCORE = 0.42;

const DATE_LINE =
  /\b\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?\b.*(?:\b\d{1,2}:\d{2}\b|\b[A-ZÄÖÜ]{1,5}\b)/i;
const WEEKDAY_TOKEN = /\b(Mo|Di|Mi|Do|Fr|Sa|So|Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/gi;

function scoreMonthMatrix(lines: OcrLine[], pageWidth: number): number {
  const grid = buildMonthMatrixGrid(lines, pageWidth);
  if (!grid.ok || grid.headers.length < 3 || grid.rows.length < 1) return 0;

  const cols = grid.headers.length;
  const rows = grid.rows.length;
  const filled = grid.rows.reduce(
    (n, r) => n + r.cells.filter((c) => String(c || '').trim()).length,
    0
  );
  const capacity = Math.max(1, rows * cols);
  const fillRatio = filled / capacity;

  // Full wall plans: ~28–31 days, many people.
  const colScore = cols >= 20 ? 1 : cols >= 10 ? 0.75 : cols >= 7 ? 0.45 : 0.25;
  const rowScore = rows >= 10 ? 1 : rows >= 5 ? 0.8 : rows >= 2 ? 0.55 : 0.3;
  const cellScore = Math.min(1, fillRatio / 0.25);

  return Math.min(1, 0.4 * colScore + 0.35 * rowScore + 0.25 * cellScore);
}

function scoreListProtocol(text: string): number {
  const lines = String(text || '')
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return 0;
  let hits = 0;
  for (const line of lines) {
    if (DATE_LINE.test(line)) hits += 1;
  }
  if (hits < 2) return hits === 1 ? 0.2 : 0;
  return Math.min(1, 0.35 + hits / 12);
}

function scoreWeekStrip(text: string, lines: OcrLine[], pageWidth: number): number {
  const matches = String(text || '').match(WEEKDAY_TOKEN) || [];
  const unique = new Set(matches.map((m) => m.slice(0, 2).toLowerCase()));
  if (unique.size < 4) return 0;

  const grid = buildMonthMatrixGrid(lines, pageWidth);
  // Week boards look matrix-like but ~5–9 day columns, not a full month.
  if (grid.ok && grid.headers.length >= 5 && grid.headers.length <= 9 && grid.rows.length >= 2) {
    return Math.min(1, 0.5 + unique.size * 0.06 + Math.min(0.25, grid.rows.length / 20));
  }
  return Math.min(0.5, 0.2 + unique.size * 0.05);
}

/**
 * Detect layout from one OCR result. Always returns exactly one concrete id.
 */
export function detectOcrLayout(ocr: {
  text: string;
  lines: OcrLine[];
  pageWidth: number;
}): OcrLayoutDetection {
  const scores: Record<ConcreteOcrLayoutId, number> = {
    'month-matrix': scoreMonthMatrix(ocr.lines, ocr.pageWidth),
    'list-protocol': scoreListProtocol(ocr.text),
    'week-strip': scoreWeekStrip(ocr.text, ocr.lines, ocr.pageWidth),
    'raw-review': 0.12,
  };

  let layoutId: ConcreteOcrLayoutId = 'raw-review';
  let score = scores['raw-review'];
  for (const id of Object.keys(scores) as ConcreteOcrLayoutId[]) {
    if (scores[id] > score) {
      score = scores[id];
      layoutId = id;
    }
  }

  // Weak structural guess → raw review (clear path, not a second parser try).
  if (layoutId !== 'raw-review' && score < OCR_LAYOUT_AUTO_MIN_SCORE) {
    return {
      layoutId: 'raw-review',
      score: scores['raw-review'],
      scores,
      reason: `uncertain (best ${layoutId}=${score.toFixed(2)}) → raw-review`,
    };
  }

  return {
    layoutId,
    score,
    scores,
    reason: `${layoutId} score=${score.toFixed(2)}`,
  };
}
