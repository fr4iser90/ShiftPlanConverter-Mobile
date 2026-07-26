/**
 * Single-shot layout detection for OCR `auto`.
 *
 * Preferred order (pro): image lattice first → OCR text cues only if image weak.
 * Never “month failed → try list → try week”.
 * Weak score → text-only fallback (not a layout).
 */
import type { OcrLine } from './recognize';
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

/**
 * Detect layout from one OCR result (text/geometry). Prefer image-first when available.
 */
export function detectOcrLayout(ocr: {
  text: string;
  lines: OcrLine[];
  pageWidth: number;
}): OcrLayoutDetection {
  const scores: Record<ConcreteOcrLayoutId, number> = {
    'month-matrix': scoreMonthMatrix(ocr.lines, ocr.pageWidth),
    'week-strip': scoreWeekStrip(ocr.text, ocr.lines, ocr.pageWidth),
    'list-protocol': scoreListProtocol(ocr.text),
    'day-plan': scoreDayPlan(ocr.text),
    'single-calendar': scoreSingleCalendar(ocr.text, ocr.lines),
  };
  return asDetection(scores, 'ocr-text');
}

/**
 * Merge image lattice scores with OCR-text scores (max per id).
 * Image-only confident month-matrix wins even when OCR text is garbage.
 */
export function mergeLayoutDetections(
  image: ImageLayoutDetection | null | undefined,
  ocrText: OcrLayoutDetection | null | undefined
): OcrLayoutDetection {
  if (image && image.layoutId !== OCR_TEXT_ONLY_FALLBACK && image.score >= OCR_LAYOUT_AUTO_MIN_SCORE) {
    // Image structure is authoritative when confident.
    return {
      layoutId: image.layoutId,
      score: image.score,
      scores: image.scores,
      source: 'image',
      reason: image.reason,
    };
  }

  if (!ocrText && image) {
    return {
      layoutId: image.layoutId,
      score: image.score,
      scores: image.scores,
      source: 'image',
      reason: image.reason,
    };
  }

  if (!image && ocrText) return { ...ocrText, source: ocrText.source || 'ocr-text' };
  if (!image || !ocrText) {
    return {
      layoutId: OCR_TEXT_ONLY_FALLBACK,
      score: 0,
      scores: {
        'month-matrix': 0,
        'week-strip': 0,
        'list-protocol': 0,
        'day-plan': 0,
        'single-calendar': 0,
      },
      source: 'merged',
      reason: 'no image/ocr layout signal → text-only',
    };
  }

  const scores: Record<ConcreteOcrLayoutId, number> = { ...ocrText.scores };
  for (const id of Object.keys(image.scores) as ConcreteOcrLayoutId[]) {
    scores[id] = Math.max(scores[id] || 0, image.scores[id] || 0);
  }
  return asDetection(scores, 'merged', `merged image+ocr`);
}
