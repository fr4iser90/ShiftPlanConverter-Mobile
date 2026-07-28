/**
 * Helpers for OCR auto layout uncertainty (one-path: ask, don't chain).
 */
import type { ConcreteOcrLayoutId } from './layouts/types';
import { OCR_LAYOUT_AUTO_MIN_SCORE, type OcrLayoutDetection } from './detectLayout';

/** Top-2 scores this close → ask user instead of guessing. */
export const OCR_LAYOUT_CLOSE_GAP = 0.12;

export type LayoutUncertainty = {
  uncertain: boolean;
  /** Best concrete id even when score is weak (for suggestions). */
  bestId: ConcreteOcrLayoutId;
  secondId: ConcreteOcrLayoutId | null;
  bestScore: number;
  secondScore: number;
  reason: string;
};

export function analyzeLayoutUncertainty(
  scores: Record<ConcreteOcrLayoutId, number>,
  allowed?: ConcreteOcrLayoutId[] | null
): LayoutUncertainty {
  const ids = (Object.keys(scores) as ConcreteOcrLayoutId[]).filter(
    (id) => !allowed?.length || allowed.includes(id)
  );
  const ranked = ids
    .map((id) => ({ id, score: scores[id] || 0 }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0] || { id: 'month-matrix' as ConcreteOcrLayoutId, score: 0 };
  const second = ranked[1] || null;
  const close =
    second != null &&
    best.score >= 0.15 &&
    best.score - second.score < OCR_LAYOUT_CLOSE_GAP;
  const weak = best.score < OCR_LAYOUT_AUTO_MIN_SCORE;
  const uncertain = weak || close;
  return {
    uncertain,
    bestId: best.id,
    secondId: second?.id || null,
    bestScore: best.score,
    secondScore: second?.score || 0,
    reason: weak
      ? `weak best ${best.id}=${best.score.toFixed(2)}`
      : close
        ? `close ${best.id}=${best.score.toFixed(2)} vs ${second!.id}=${second!.score.toFixed(2)}`
        : `confident ${best.id}=${best.score.toFixed(2)}`,
  };
}

/** Detection is uncertain when winner is text-only or analysis says so. */
export function detectionNeedsUserChoice(det: OcrLayoutDetection): boolean {
  if (det.layoutId === 'text-only') return true;
  const u = analyzeLayoutUncertainty(det.scores);
  return u.uncertain;
}
