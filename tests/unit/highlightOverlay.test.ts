import { estimateHighlightOverlays } from '../../src/sources/ocr/highlightOverlay';
import type { MonthMatrixGrid } from '../../src/sources/ocr/monthMatrix';
import { estimateRegionBoxes } from '../../src/sources/ocr/regionSnapshots';

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
  colCenters: [220, 320, 420, 520, 620, 720, 820],
  rowSlope: 0.05,
};

describe('highlightOverlay', () => {
  it('returns name + header boxes without match', () => {
    const boxes = estimateHighlightOverlays(baseGrid, 800, 600, null);
    expect(boxes.map((b) => b.kind)).toEqual(['name-column', 'day-header']);
  });

  it('adds own-row name strip + day segments when matched', () => {
    const boxes = estimateHighlightOverlays(baseGrid, 800, 600, 'Suedmann, Bianca');
    const owns = boxes.filter((b) => b.kind === 'own-row');
    expect(owns.length).toBeGreaterThan(1);
    // First own-row is the name-column strip (narrow, left).
    expect(owns[0]!.box.x).toBe(0);
    expect(owns[0]!.box.width).toBeLessThan(0.35);
    expect(owns[0]!.box.y).toBeGreaterThan(0.15);
    expect(owns[0]!.box.y).toBeLessThan(0.3);
  });

  it('returns empty when grid not ok', () => {
    expect(
      estimateHighlightOverlays({ ...baseGrid, ok: false }, 800, 600, 'Nordmann, Alice')
    ).toEqual([]);
  });
});

describe('estimateRegionBoxes header band', () => {
  it('keeps day-header height small (not pinned to y=40)', () => {
    const boxes = estimateRegionBoxes(baseGrid, 800, 600);
    expect(boxes).not.toBeNull();
    // With first row at y=100, header must not cover ~half the page.
    expect(boxes!.header.height).toBeLessThan(0.2);
    expect(boxes!.header.y).toBeGreaterThan(0.05);
  });
});
