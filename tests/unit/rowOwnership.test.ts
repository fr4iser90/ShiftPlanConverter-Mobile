import {
  assignPersonBandsFromRuledFrames,
  bandsAreDisjoint,
  bandsFromOwnedGlyphs,
  enforceDisjointBands,
  lineBelongsToRow,
  nearestRowIndexAt,
  personSeparatorYs,
  rowMidBand,
} from '@/src/sources/ocr/monthMatrix/rowOwnership';
import { refinePersonRowFromOcr } from '@/src/convert/parsers/ocr/applyPackMapping';
import type { MonthMatrixGrid, MatrixRow } from '@/src/sources/ocr/monthMatrix/types';
import type { OcrLine } from '@/src/sources/ocr/recognize';
import type { MappingValue } from '@/src/convert/types';

describe('rowOwnership', () => {
  const rows = [{ yCenter: 100 }, { yCenter: 220 }, { yCenter: 340 }];

  it('splits tall rows at midpoints between names', () => {
    expect(rowMidBand(rows, 1)).toEqual({ yLo: 160, yHi: 280 });
  });

  it('assigns glyph to nearest skewed baseline (no soft pad steal)', () => {
    expect(nearestRowIndexAt(130, 400, rows, 0, 80)).toBe(0);
    expect(nearestRowIndexAt(190, 400, rows, 0, 80)).toBe(1);
  });

  it('scoop ownership is nearest-only for multiline rows', () => {
    const banded = [
      { yCenter: 100, yLo: 40, yHi: 150 },
      { yCenter: 220, yLo: 150, yHi: 300 },
    ];
    const lowerBlock = {
      text: '07:35',
      boundingBox: { x: 380, y: 120, width: 40, height: 14 },
    };
    expect(lineBelongsToRow(lowerBlock, 0, banded, 0, 80)).toBe(true);
    expect(lineBelongsToRow(lowerBlock, 1, banded, 0, 80)).toBe(false);
  });

  it('enforceDisjointBands never leaves overlapping interiors', () => {
    const overlapping: MatrixRow[] = [
      {
        name: 'A',
        yCenter: 100,
        cells: [],
        yNameTop: 90,
        yNameBot: 110,
        yLo: 80,
        yHi: 200, // overlaps B
      },
      {
        name: 'B',
        yCenter: 220,
        cells: [],
        yNameTop: 210,
        yNameBot: 230,
        yLo: 150,
        yHi: 280,
      },
    ];
    const fixed = enforceDisjointBands(overlapping);
    expect(bandsAreDisjoint(fixed)).toBe(true);
    expect(fixed[0]!.yHi!).toBeLessThanOrEqual(fixed[1]!.yLo!);
  });

  it('bandsFromOwnedGlyphs hug name+cells then disjoint', () => {
    const people: MatrixRow[] = [
      { name: 'A', yCenter: 100, cells: [], yNameTop: 90, yNameBot: 110 },
      { name: 'B', yCenter: 220, cells: [], yNameTop: 210, yNameBot: 230 },
    ];
    const out = bandsFromOwnedGlyphs(
      people,
      [
        { yTop: 90, yBot: 160 }, // synthetic 3-block row
        { yTop: 200, yBot: 240 },
      ],
      0,
      400
    );
    expect(bandsAreDisjoint(out)).toBe(true);
    // Already disjoint (163 < 200) — content hug kept; no forced midpoint shrink.
    expect(out[0]!.yHi!).toBeLessThanOrEqual(out[1]!.yLo!);
    expect(out[0]!.yHi!).toBeGreaterThan(150); // still covers 3-block extent
  });

  it('personSeparatorYs ignores inner duty H-peaks near name centers', () => {
    const names = [100, 220, 340];
    // Outer person borders 70/180/300/360 + duty sub-rows glued to names.
    const ruled = [50, 70, 100, 130, 180, 220, 250, 300, 340, 360];
    const seps = personSeparatorYs(ruled, names);
    expect(seps).toContain(70);
    expect(seps).toContain(180);
    expect(seps).toContain(300);
    expect(seps).not.toContain(100);
    expect(seps).not.toContain(130);
    expect(seps).not.toContain(220);
    expect(seps).not.toContain(250);
  });

  it('personSeparatorYs still finds H just above next name in a wide gap', () => {
    // Outlier gap must not inflate medGap / searchHi so the real border is clipped.
    const names = [612, 797, 890];
    const ruled = [608, 780, 874, 1016];
    const seps = personSeparatorYs(ruled, names);
    expect(seps).toContain(780);
    expect(seps).not.toContain(704.5); // old soft-mid failure mode
  });

  it('assignPersonBandsFromRuledFrames uses printed rules between people', () => {
    const people: MatrixRow[] = [
      { name: 'A', yCenter: 100, cells: [], yNameTop: 90, yNameBot: 110 },
      { name: 'B', yCenter: 220, cells: [], yNameTop: 210, yNameBot: 230 },
      { name: 'C', yCenter: 340, cells: [], yNameTop: 330, yNameBot: 350 },
    ];
    // Rules at person cell borders (A is 3-line tall: 70→180).
    const ruled = [50, 70, 180, 300, 360];
    const out = assignPersonBandsFromRuledFrames(
      people,
      [
        { yTop: 90, yBot: 170 },
        { yTop: 210, yBot: 250 },
        { yTop: 330, yBot: 350 },
      ],
      ruled,
      0,
      400,
      55
    );
    expect(out).not.toBeNull();
    expect(bandsAreDisjoint(out!)).toBe(true);
    expect(out![0]!.yLo).toBe(70);
    expect(out![0]!.yHi).toBe(180); // full 3-block frame, not name-only
    expect(out![1]!.yLo).toBe(180);
    expect(out![1]!.yHi).toBe(300);
    expect(out![2]!.yLo).toBe(300);
    expect(out![2]!.yHi).toBe(360);
  });

  it('assignPersonBandsFromRuledFrames soft-caps weak/sparse H via midpoints', () => {
    const people: MatrixRow[] = [
      { name: 'A', yCenter: 100, cells: [], yNameTop: 90, yNameBot: 110 },
      { name: 'B', yCenter: 220, cells: [], yNameTop: 210, yNameBot: 230 },
      { name: 'C', yCenter: 340, cells: [], yNameTop: 330, yNameBot: 350 },
    ];
    // Only page-edge H peaks — gap separators become soft mids, not a null grid.
    const out = assignPersonBandsFromRuledFrames(
      people,
      [null, null, null],
      [40, 380],
      0,
      400,
      50
    );
    expect(out).not.toBeNull();
    expect(bandsAreDisjoint(out!)).toBe(true);
    for (const r of out!) {
      expect(r.yHi! - r.yLo!).toBeLessThan(160);
      expect(r.yHi! - r.yLo!).toBeGreaterThan(40);
    }
  });

  it('assignPersonBandsFromRuledFrames caps absurd page-spanning bands', () => {
    const people: MatrixRow[] = [
      { name: 'A', yCenter: 100, cells: [], yNameTop: 90, yNameBot: 110 },
      { name: 'B', yCenter: 220, cells: [], yNameTop: 210, yNameBot: 230 },
    ];
    // Enough H peaks to pass density, but last gap has no person border → soft mid
    // + page-bottom rule would make B huge without the height cap.
    const out = assignPersonBandsFromRuledFrames(
      people,
      [
        { yTop: 90, yBot: 110 },
        { yTop: 210, yBot: 230 },
      ],
      [40, 55, 360, 380],
      0,
      400,
      40
    );
    expect(out).not.toBeNull();
    for (const r of out!) {
      expect(r.yHi! - r.yLo!).toBeLessThan(120 * 1.8);
    }
    // Cap uses neighbor midpoints (~person pitch), not glyph-tight strips.
    expect(out![1]!.yHi! - out![1]!.yLo!).toBeGreaterThan(80);
  });
});

describe('refinePersonRow neighbor bleed', () => {
  const preset: Record<string, MappingValue> = {
    '07:35-15:50': { code: 'F', type: 'work', isValidated: true },
    U: { code: 'U', type: 'off', isValidated: true },
  };

  it('does not pull upper neighbor duty time into lower person row', () => {
    const grid: MonthMatrixGrid = {
      ok: true,
      headers: ['Di1'],
      colCenters: [400],
      nameMaxX: 120,
      colGap: 40,
      rowYPad: 80,
      rowSlope: 0,
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

  it('keeps upper neighbor time on the upper row', () => {
    const grid: MonthMatrixGrid = {
      ok: true,
      headers: ['Di1'],
      colCenters: [400],
      nameMaxX: 120,
      colGap: 40,
      rowYPad: 80,
      rowSlope: 0,
      rows: [
        { name: 'Person-A, One', yCenter: 100, cells: [''], yLo: 40, yHi: 160 },
        { name: 'Person-B, Two', yCenter: 220, cells: [''], yLo: 160, yHi: 300 },
      ],
    };
    const lines: OcrLine[] = [
      { text: '07:35-15:50', boundingBox: { x: 380, y: 130, width: 70, height: 16 } },
      { text: 'U', boundingBox: { x: 390, y: 200, width: 20, height: 16 } },
    ];
    const out = refinePersonRowFromOcr(grid, 'Person-A, One', lines, preset);
    expect(out.rows[0]!.cells[0]).toBe('F');
  });
});
