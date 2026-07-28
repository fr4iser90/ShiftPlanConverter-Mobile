import { estimateHighlightOverlays } from '../../src/sources/ocr/highlightOverlay';
import type { MonthMatrixGrid } from '../../src/sources/ocr/monthMatrix';

const baseGrid: MonthMatrixGrid = {
  ok: true,
  headers: ['1', '2', '3', '4', '5', '6', '7'],
  rows: [
    { name: 'Nordmann, Alice', yCenter: 100, cells: ['F', 'U', 'F', 'U', 'F', 'U', 'F'] },
    { name: 'Suedmann, Bianca', yCenter: 140, cells: ['U', 'F', 'U', 'F', 'U', 'F', 'U'] },
    { name: 'Westmann, Clara', yCenter: 180, cells: ['F', 'F', 'U', 'U', 'F', 'F', 'U'] },
  ],
  nameMaxX: 160,
  rowYPad: 18,
};

describe('highlightOverlay', () => {
  it('returns name + header boxes without match', () => {
    const boxes = estimateHighlightOverlays(baseGrid, 800, 600, null);
    expect(boxes.map((b) => b.kind)).toEqual(['name-column', 'day-header']);
  });

  it('adds own-row when matchedName hits a row', () => {
    const boxes = estimateHighlightOverlays(baseGrid, 800, 600, 'Suedmann, Bianca');
    expect(boxes.map((b) => b.kind)).toEqual(['name-column', 'day-header', 'own-row']);
    const row = boxes.find((b) => b.kind === 'own-row')!;
    expect(row.box.y).toBeGreaterThan(0);
    expect(row.box.height).toBeGreaterThan(0);
    expect(row.box.width).toBe(1);
  });

  it('returns empty when grid not ok', () => {
    expect(
      estimateHighlightOverlays({ ...baseGrid, ok: false }, 800, 600, 'Nordmann, Alice')
    ).toEqual([]);
  });
});
