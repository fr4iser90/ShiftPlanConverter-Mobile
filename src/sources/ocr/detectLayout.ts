/**
 * Single-shot layout detection for OCR `auto`.
 *
 * Preferred order (pro): image lattice first → OCR text cues only if image weak.
 * Never “month failed → try list → try week”.
 * Weak score → text-only fallback (not a layout).
 *
 * Ruled tables look alike in pixels (month-matrix vs date-duty). When OCR has a
 * structural signal for either, OCR decides between those two — image must not
 * lock month-matrix via max-merge.
 */
import type { PackDateDutyConfig } from '@/src/packs/types';
import type { OcrLine } from './recognize';
import { looksLikeDateDutyAxes, measureAxisCues } from './layouts/axisCues';
import { scoreDateDuty } from './layouts/date-duty';
import { scoreDayPlan } from './layouts/day-plan';
import type { ImageLayoutDetection } from './layouts/detectFromImage';
import { scoreListProtocol } from './layouts/list-protocol';
import { scoreMonthMatrix } from './layouts/month-matrix';
import { scoreSingleCalendar } from './layouts/single-calendar';
import {
  OCR_TEXT_ONLY_FALLBACK,
  type ConcreteOcrLayoutId,
  type OcrTextOnlyFallbackId,
} from './layouts';
import { scoreWeekStrip } from './layouts/week-strip';

export type OcrLayoutDetection = {
  /** Concrete layout, or text-only fallback when structure is unclear. */
  layoutId: ConcreteOcrLayoutId | OcrTextOnlyFallbackId;
  /** 0..1 confidence of the winner (0 for text-only fallback). */
  score: number;
  scores: Record<ConcreteOcrLayoutId, number>;
  reason: string;
  /** Where the winner came from */
  source?: 'image' | 'ocr-text' | 'merged';
};

/** Below this, prefer text-only fallback over a weak structural guess. */
export const OCR_LAYOUT_AUTO_MIN_SCORE = 0.42;

/** OCR score above this counts as a structural signal for ruled-table layouts. */
const OCR_RULED_SIGNAL = 0.15;

function pickWinner(scores: Record<ConcreteOcrLayoutId, number>): {
  layoutId: ConcreteOcrLayoutId;
  score: number;
} {
  let layoutId: ConcreteOcrLayoutId = 'month-matrix';
  let score = -1;
  for (const id of Object.keys(scores) as ConcreteOcrLayoutId[]) {
    if (scores[id] > score) {
      score = scores[id];
      layoutId = id;
    }
  }
  return { layoutId, score };
}

function asDetection(
  scores: Record<ConcreteOcrLayoutId, number>,
  source: OcrLayoutDetection['source'],
  reasonPrefix?: string
): OcrLayoutDetection {
  const { layoutId, score } = pickWinner(scores);
  if (score < OCR_LAYOUT_AUTO_MIN_SCORE) {
    return {
      layoutId: OCR_TEXT_ONLY_FALLBACK,
      score: 0,
      scores,
      source,
      reason:
        reasonPrefix ||
        `uncertain (best ${layoutId}=${score.toFixed(2)}) → text-only`,
    };
  }
  return {
    layoutId,
    score,
    scores,
    source,
    reason: reasonPrefix || `${layoutId} score=${score.toFixed(2)}`,
  };
}

function applyLayoutPriors(
  scores: Record<ConcreteOcrLayoutId, number>,
  priors?: Partial<Record<ConcreteOcrLayoutId, number>> | null
): void {
  if (!priors) return;
  for (const id of Object.keys(priors) as ConcreteOcrLayoutId[]) {
    const bump = Number(priors[id]);
    if (!Number.isFinite(bump) || bump === 0) continue;
    scores[id] = Math.max(0, Math.min(1, (scores[id] || 0) + bump));
  }
}

/**
 * Detect layout from one OCR result (text/geometry). Prefer image-first when available.
 * `dateDuty` from pack `parsers/ocr.json` — without it, date-duty scores 0.
 */
export function detectOcrLayout(
  ocr: {
    text: string;
    lines: OcrLine[];
    pageWidth: number;
    pageHeight?: number;
  },
  opts?: {
    dateDuty?: PackDateDutyConfig | null;
    layoutPriors?: Partial<Record<ConcreteOcrLayoutId, number>> | null;
  }
): OcrLayoutDetection {
  const scores: Record<ConcreteOcrLayoutId, number> = {
    'month-matrix': scoreMonthMatrix(ocr.lines, ocr.pageWidth, {
      pageHeight: ocr.pageHeight,
      dateDuty: opts?.dateDuty,
    }),
    'week-strip': scoreWeekStrip(ocr.text, ocr.lines, ocr.pageWidth),
    'date-duty': scoreDateDuty(
      ocr.text,
      ocr.lines,
      ocr.pageWidth,
      opts?.dateDuty,
      ocr.pageHeight
    ),
    'list-protocol': scoreListProtocol(ocr.text),
    'day-plan': scoreDayPlan(ocr.text),
    'single-calendar': scoreSingleCalendar(ocr.text, ocr.lines),
  };
  applyLayoutPriors(scores, opts?.layoutPriors);

  // Pack date×duty boards: left date gutter + duty vocab must beat week-strip /
  // month-matrix false positives (bare Mo/Di tokens + garbage 5–9 col grids).
  if (opts?.dateDuty?.columns?.length) {
    const cues = measureAxisCues(ocr.lines, ocr.pageWidth, ocr.pageHeight);
    if (looksLikeDateDutyAxes(cues) || cues.leftDateRows >= 10) {
      scores['date-duty'] = Math.max(scores['date-duty'], 0.78);
      scores['week-strip'] = Math.min(scores['week-strip'], 0.2);
      scores['month-matrix'] = Math.min(
        scores['month-matrix'],
        Math.max(0, scores['date-duty'] - 0.2)
      );
      scores['list-protocol'] = Math.min(scores['list-protocol'], 0.35);
    }
  }

  return asDetection(scores, 'ocr-text');
}

function emptyScores(): Record<ConcreteOcrLayoutId, number> {
  return {
    'month-matrix': 0,
    'week-strip': 0,
    'date-duty': 0,
    'list-protocol': 0,
    'day-plan': 0,
    'single-calendar': 0,
  };
}

/**
 * Merge image lattice scores with OCR-text scores.
 *
 * Month-matrix vs date-duty: OCR decides when it has a structural signal.
 * Image may still win week-strip / garbage-OCR cases.
 */
export function mergeLayoutDetections(
  image: ImageLayoutDetection | null | undefined,
  ocrText: OcrLayoutDetection | null | undefined
): OcrLayoutDetection {
  if (!image && ocrText) return { ...ocrText, source: ocrText.source || 'ocr-text' };
  if (image && !ocrText) {
    return {
      layoutId: image.layoutId,
      score: image.score,
      scores: image.scores,
      source: 'image',
      reason: image.reason,
    };
  }
  if (!image || !ocrText) {
    return {
      layoutId: OCR_TEXT_ONLY_FALLBACK,
      score: 0,
      scores: emptyScores(),
      source: 'merged',
      reason: 'no image/ocr layout signal → text-only',
    };
  }

  const scores: Record<ConcreteOcrLayoutId, number> = { ...emptyScores(), ...ocrText.scores };
  const ocrMm = ocrText.scores['month-matrix'] || 0;
  const ocrDd = ocrText.scores['date-duty'] || 0;
  const ocrRuled = ocrMm >= OCR_RULED_SIGNAL || ocrDd >= OCR_RULED_SIGNAL;

  for (const id of Object.keys(image.scores) as ConcreteOcrLayoutId[]) {
    const imgScore = image.scores[id] || 0;
    if (id === 'month-matrix' || id === 'date-duty') {
      // OCR owns the month vs date-duty call when it has structure.
      if (!ocrRuled) {
        scores[id] = Math.max(scores[id] || 0, imgScore);
      }
      continue;
    }
    scores[id] = Math.max(scores[id] || 0, imgScore);
  }

  const det = asDetection(scores, 'merged', 'merged image+ocr');

  // Preserve image attribution when OCR added no structural signal.
  if (
    ocrText.layoutId === OCR_TEXT_ONLY_FALLBACK &&
    image.layoutId !== OCR_TEXT_ONLY_FALLBACK &&
    image.score >= OCR_LAYOUT_AUTO_MIN_SCORE &&
    det.layoutId === image.layoutId
  ) {
    return {
      ...det,
      source: 'image',
      reason: image.reason,
    };
  }
  return det;
}
