import {
  analyzeLayoutUncertainty,
  OCR_LAYOUT_CLOSE_GAP,
} from '../../src/sources/ocr/layoutUncertainty';
import type { ConcreteOcrLayoutId } from '../../src/sources/ocr/layouts/types';

function scores(partial: Partial<Record<ConcreteOcrLayoutId, number>>): Record<ConcreteOcrLayoutId, number> {
  return {
    'month-matrix': 0,
    'week-strip': 0,
    'list-protocol': 0,
    'day-plan': 0,
    'single-calendar': 0,
    ...partial,
  };
}

describe('layoutUncertainty', () => {
  it('flags weak best score as uncertain', () => {
    const u = analyzeLayoutUncertainty(scores({ 'month-matrix': 0.2, 'week-strip': 0.05 }));
    expect(u.uncertain).toBe(true);
    expect(u.bestId).toBe('month-matrix');
    expect(u.reason).toMatch(/^weak/);
  });

  it('flags close top-2 as uncertain', () => {
    const u = analyzeLayoutUncertainty(
      scores({ 'month-matrix': 0.55, 'week-strip': 0.55 - OCR_LAYOUT_CLOSE_GAP / 2 })
    );
    expect(u.uncertain).toBe(true);
    expect(u.secondId).toBe('week-strip');
    expect(u.reason).toMatch(/^close/);
  });

  it('is confident when gap is large enough', () => {
    const u = analyzeLayoutUncertainty(scores({ 'month-matrix': 0.7, 'week-strip': 0.2 }));
    expect(u.uncertain).toBe(false);
    expect(u.bestId).toBe('month-matrix');
  });

  it('respects pack allow-list', () => {
    const u = analyzeLayoutUncertainty(
      scores({ 'month-matrix': 0.9, 'week-strip': 0.85 }),
      ['week-strip']
    );
    expect(u.bestId).toBe('week-strip');
    expect(u.secondId).toBeNull();
  });
});
