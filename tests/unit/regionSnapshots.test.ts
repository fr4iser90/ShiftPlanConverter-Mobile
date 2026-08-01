import { estimateRegionBoxes } from '../../src/sources/ocr/regionSnapshots';
import type { MonthMatrixGrid } from '../../src/sources/ocr/layouts/month-matrix';

describe('regionSnapshots', () => {
  it('estimates name + header boxes from a good grid', () => {
    const grid: MonthMatrixGrid = {
      ok: true,
      headers: ['1', '2'],
      rows: [
        { name: 'PersonA, Alpha', yCenter: 80, cells: ['F', 'U'] },
        { name: 'PersonB, Beta', yCenter: 120, cells: ['U', 'F'] },
      ],
      nameMaxX: 160,
      rowYPad: 18,
    };
    const boxes = estimateRegionBoxes(grid, 800, 600);
    expect(boxes).not.toBeNull();
    expect(boxes!.name.width).toBeGreaterThan(0.1);
    expect(boxes!.header.x).toBeGreaterThan(0);
    expect(boxes!.header.height).toBeGreaterThan(0);
  });

  it('returns null when grid not ok', () => {
    expect(
      estimateRegionBoxes(
        { ok: false, reason: 'x', headers: [], rows: [] },
        800,
        600
      )
    ).toBeNull();
  });
});
