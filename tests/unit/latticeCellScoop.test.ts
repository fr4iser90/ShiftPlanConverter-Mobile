import { buildMonthMatrixGrid } from '@/src/sources/ocr/layouts/month-matrix/build';
import { glyphInLatticeCell } from '@/src/sources/ocr/layouts/month-matrix/lattice';
import type { OcrLine } from '@/src/sources/ocr/recognize';
import { refinePersonRowFromOcr } from '@/src/convert/parsers/ocr/applyPackMapping';
import type { MappingValue } from '@/src/convert/types';
import type { MonthMatrixGrid } from '@/src/sources/ocr/layouts/month-matrix/types';

function line(text: string, x: number, y: number, w = 36, h = 14): OcrLine {
  return { text, boundingBox: { x, y, width: w, height: h } };
}

describe('lattice cell scoop', () => {
  it('buildMonthMatrixGrid scoops only glyphs inside person×day frames', () => {
    // Synthetic ruled wall: 2 people × 3 days. Neighbor duty must not bleed.
    const hYs = [40, 80, 140, 200];
    const vXs = [100, 180, 260, 340];
    // Day centers sit on V midpoints 140 / 220 / 300 (vXs 100,180,260,340).
    const lines: OcrLine[] = [
      line('Di1', 125, 55, 28, 12),
      line('Mi2', 205, 55, 28, 12),
      line('Do3', 285, 55, 28, 12),
      line('PersonA, One', 20, 100, 70, 16),
      line('PersonB, Two', 20, 160, 70, 16),
      line('F', 130, 105, 20, 14),
      line('07:35-15:50', 120, 118, 55, 12),
      // Neighbor duty — must stay on PersonB, not bleed into A
      line('U', 130, 165, 18, 14),
      line('F', 210, 165, 20, 14),
    ];
    const grid = buildMonthMatrixGrid(lines, 420, 240, {
      lattice: { hYs, vXs },
    });
    expect(grid.ok).toBe(true);
    expect(grid.rows.length).toBeGreaterThanOrEqual(2);
    const a = grid.rows.find((r) => /PersonA/i.test(r.name));
    const b = grid.rows.find((r) => /PersonB/i.test(r.name));
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(a!.yLo).toBeDefined();
    expect(a!.yHi).toBeDefined();
    // A owns day-1 F(+time); must not include U from B's row.
    const a0 = (a!.cells[0] || '').toUpperCase();
    expect(a0).toMatch(/F|07:35/);
    expect(a0).not.toMatch(/\bU\b/);
    expect((b!.cells[0] || '').toUpperCase()).toMatch(/U/);
  });

  it('refinePersonRowFromOcr respects lattice cell membership over nearest-name', () => {
    const preset: Record<string, MappingValue> = {
      '07:35-15:50': { code: 'F', type: 'work', isValidated: true },
      U: { code: 'U', type: 'off', isValidated: true },
    };
    const grid: MonthMatrixGrid = {
      ok: true,
      headers: ['Di1'],
      colCenters: [400],
      nameMaxX: 120,
      colGap: 40,
      rowYPad: 80,
      rowSlope: 0,
      dayFrames: [{ dayIndex: 0, label: 'Di1', x0: 360, x1: 440 }],
      rows: [
        { name: 'Person-A, One', yCenter: 100, cells: [''], yLo: 40, yHi: 160 },
        { name: 'Person-B, Two', yCenter: 220, cells: [''], yLo: 160, yHi: 300 },
      ],
    };
    const lines: OcrLine[] = [
      { text: '07:35-15:50', boundingBox: { x: 380, y: 130, width: 70, height: 16 } },
      { text: 'U', boundingBox: { x: 390, y: 200, width: 20, height: 16 } },
    ];
    const out = refinePersonRowFromOcr(grid, 'Person-B, Two', lines, preset);
    expect(out.rows[1]!.cells[0]).toBe('U');
    expect(out.rows[1]!.cells[0]).not.toMatch(/F|07:35/);
  });

  it('rejects glyph just outside skewed cell bottom', () => {
    const row = { yLo: 100, yHi: 140 };
    const col = { x0: 200, x1: 280 };
    // At x=240 with slope 0.1, bottom edge ≈ 140 + 0.1*(240-80) = 156
    expect(glyphInLatticeCell(240, 150, row, col, 0.1, 80)).toBe(true);
    expect(glyphInLatticeCell(240, 165, row, col, 0.1, 80)).toBe(false);
  });
});
