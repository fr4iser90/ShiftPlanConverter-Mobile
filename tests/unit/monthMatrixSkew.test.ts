import {
  clampSlope,
  estimateRowSlopeFromHeaders,
  expectedYAtX,
  fitSlope,
  slopeToDegrees,
} from '../../src/sources/ocr/layouts/month-matrix/skew';
import { buildMonthMatrixGrid } from '../../src/sources/ocr/layouts/month-matrix';
import type { OcrLine } from '../../src/sources/ocr/recognize';
import { estimateHighlightOverlays } from '../../src/sources/ocr/highlightOverlay';
import { deskewDegreesFromOcrLines } from '../../src/sources/ocr/deskew';

function L(text: string, x: number, y: number, w = 40, h = 14): OcrLine {
  return { text, boundingBox: { x, y, width: w, height: h } };
}

describe('monthMatrix skew', () => {
  it('fits a positive slope from header lattice', () => {
    const slope = fitSlope([200, 400, 600, 800], [20, 30, 40, 50]);
    expect(slope).toBeCloseTo(0.05, 3);
    expect(slopeToDegrees(slope)).toBeGreaterThan(2);
  });

  it('clamps absurd slopes', () => {
    expect(Math.abs(clampSlope(2))).toBeLessThanOrEqual(0.85);
  });

  it('expectedYAtX follows slope from name anchor', () => {
    expect(expectedYAtX(100, 50, 250, 0.1)).toBeCloseTo(120, 5);
  });

  it('estimates slope from day headers', () => {
    const lines = [
      L('Mo1', 200, 20),
      L('Di2', 400, 30),
      L('Mi3', 600, 40),
      L('Do4', 800, 50),
    ];
    const slope = estimateRowSlopeFromHeaders(lines, 1000, 150);
    expect(slope).toBeGreaterThan(0.04);
  });

  it('ignores stray title MO above a flat header strip', () => {
    const lines = [
      L('MO', 200, 20), // title noise
      L('Di4', 400, 200),
      L('Mi5', 500, 201),
      L('Do6', 600, 200),
      L('Fr7', 700, 202),
      L('Sa8', 800, 201),
    ];
    expect(estimateRowSlopeFromHeaders(lines, 1000, 150)).toBe(0);
  });

  it('keeps mild header skew (~1°) for overlay parallelograms', () => {
    // Δy≈24 over Δx=1800 → slope≈0.013 — previously zeroed by median-Y flatten.
    const lines = [
      L('Mo1', 200, 100),
      L('Di2', 500, 104),
      L('Mi3', 800, 108),
      L('Do4', 1100, 112),
      L('Fr5', 1400, 116),
      L('Sa6', 1700, 120),
      L('So7', 2000, 124),
    ];
    const slope = estimateRowSlopeFromHeaders(lines, 3000, 150);
    expect(slope).toBeGreaterThan(0.01);
    expect(slope).toBeLessThan(0.02);
  });

  it('deskew gate returns degrees for clear skew', () => {
    const lines = [
      L('Mo1', 200, 20),
      L('Di2', 400, 35),
      L('Mi3', 600, 50),
      L('Do4', 800, 65),
      L('Fr5', 1000, 80),
    ];
    const deg = deskewDegreesFromOcrLines(lines, 1200);
    expect(Math.abs(deg)).toBeGreaterThanOrEqual(1.2);
  });
});

describe('skew-aware cell assign', () => {
  it('keeps cells on a skewed row with the name, not the neighbor', () => {
    // Name at y=100; cells drop ~0.05·x toward the right.
    // Neighbor name at y=145 — without slope, right-side cells would bleed.
    const slope = 0.05;
    const lines: OcrLine[] = [
      L('Mo1', 200, 20 + 200 * slope, 30),
      L('Di2', 400, 20 + 400 * slope, 30),
      L('Mi3', 600, 20 + 600 * slope, 30),
      L('Do4', 800, 20 + 800 * slope, 30),
      L('PersonA', 10, 95, 70),
      L('Alpha', 10, 110, 50),
      L('F', 200, 100 + (200 - 40) * slope, 20),
      L('M2', 400, 100 + (400 - 40) * slope, 20),
      L('F1', 600, 100 + (600 - 40) * slope, 20),
      L('U', 800, 100 + (800 - 40) * slope, 20),
      L('PersonB', 10, 140, 70),
      L('Beta', 10, 155, 50),
      // Neighbor cells intentionally near PersonA's flat y on the right
      L('X', 200, 148, 20),
      L('Y', 400, 148, 20),
      L('Z', 600, 148, 20),
      L('W', 800, 148, 20),
    ];
    const grid = buildMonthMatrixGrid(lines, 1000);
    expect(grid.ok).toBe(true);
    expect(Math.abs(grid.rowSlope || 0)).toBeGreaterThan(0.02);
    const nord = grid.rows.find((r) => /PersonA/i.test(r.name));
    expect(nord).toBeTruthy();
    const joined = (nord!.cells || []).join(' ');
    expect(joined).toMatch(/F/);
    expect(joined).not.toMatch(/\bX\b/);
    expect(joined).not.toMatch(/\bW\b/);
  });

  it('own-row highlight is anchored at name column (not CSS-rotated full width)', () => {
    const grid = {
      ok: true as const,
      headers: ['1', '2', '3'],
      rows: [
        { name: 'PersonA, Alpha', yCenter: 100, cells: ['F', 'U', 'F'] },
        { name: 'PersonB, Beta', yCenter: 140, cells: ['U', 'F', 'U'] },
      ],
      nameMaxX: 160,
      rowYPad: 18,
      rowSlope: 0.05,
      colCenters: [250, 450, 650],
    };
    const boxes = estimateHighlightOverlays(grid, 800, 600, 'PersonA, Alpha');
    const owns = boxes.filter((b) => b.kind === 'own-row');
    expect(owns[0]!.box.width).toBeLessThan(0.3);
    expect(owns.length).toBeGreaterThan(1);
  });
});
