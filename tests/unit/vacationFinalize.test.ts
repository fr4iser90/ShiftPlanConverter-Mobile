import {
  expandVacationRuns,
  MATRIX_FREE_DAY,
} from '@/src/convert/parsers/ocr/applyPackMapping';
import type { MonthMatrixGrid } from '@/src/sources/ocr/layouts/month-matrix/types';
import type { InvertCellHit } from '@/src/sources/ocr/shortGlyphHits';
import { isMatrixWeekendColumn } from '@/src/sources/ocr/matrixCalendar';
import {
  clampVacationToSeedClusters,
  enforceWeekendFreeDays,
  finalizeShortGlyphVacation,
} from '@/src/sources/ocr/vacationFinalize';

function emptyGrid(partial: Partial<MonthMatrixGrid> & { rows: MonthMatrixGrid['rows'] }): MonthMatrixGrid {
  return {
    ok: true,
    headers: partial.headers || [],
    nameMaxX: partial.nameMaxX ?? 100,
    colCenters: partial.colCenters || [],
    rosterMonth: partial.rosterMonth,
    rosterYear: partial.rosterYear,
    dayFrames: partial.dayFrames,
    rows: partial.rows,
  };
}

describe('matrixCalendar / vacation finalize', () => {
  it('detects Sep 2026 weekends from numeric headers', () => {
    const grid = emptyGrid({
      headers: ['1', '2', '3', '4', '5', '6', '7'],
      rosterMonth: 9,
      rosterYear: 2026,
      colCenters: [1, 2, 3, 4, 5, 6, 7],
      rows: [{ name: 'X', yCenter: 1, cells: ['', '', '', '', '', '', ''] }],
    });
    expect(isMatrixWeekendColumn(grid, 4)).toBe(true); // Sa5
    expect(isMatrixWeekendColumn(grid, 5)).toBe(true); // So6
    expect(isMatrixWeekendColumn(grid, 3)).toBe(false); // Fr4
  });

  it('finalize: Böhme-like seeds → UUUU//UUU and no day-10 U', () => {
    const headers = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
    const grid = emptyGrid({
      headers,
      rosterMonth: 9,
      rosterYear: 2026,
      colCenters: headers.map((_, i) => 100 + i * 10),
      rows: [
        {
          name: 'Böhme, Patrick',
          yCenter: 50,
          cells: Array(12).fill(''),
        },
      ],
    });
    const hits: InvertCellHit[] = [
      { rowIndex: 0, dayIndex: 3, text: 'U', line: { text: 'U', boundingBox: { x: 0, y: 0, width: 1, height: 1 } } },
      { rowIndex: 0, dayIndex: 5, text: '/', line: { text: '/', boundingBox: { x: 0, y: 0, width: 1, height: 1 } } },
      { rowIndex: 0, dayIndex: 8, text: 'U', line: { text: 'U', boundingBox: { x: 0, y: 0, width: 1, height: 1 } } },
      // late false U — must not paint day 10
      { rowIndex: 0, dayIndex: 17, text: 'U', line: { text: 'U', boundingBox: { x: 0, y: 0, width: 1, height: 1 } } },
    ];
    // dayIndex 17 is out of range for 12-col grid — use index within + separate
    const wideHeaders = Array.from({ length: 20 }, (_, i) => String(i + 1));
    const wide = emptyGrid({
      headers: wideHeaders,
      rosterMonth: 9,
      rosterYear: 2026,
      colCenters: wideHeaders.map((_, i) => 100 + i * 10),
      rows: [{ name: 'Böhme, Patrick', yCenter: 50, cells: Array(20).fill('') }],
    });
    const out = finalizeShortGlyphVacation({
      grid: wide,
      glyphHits: [
        hits[0]!,
        hits[1]!,
        hits[2]!,
        {
          rowIndex: 0,
          dayIndex: 17,
          text: 'U',
          line: { text: 'U', boundingBox: { x: 0, y: 0, width: 1, height: 1 } },
        },
      ],
      lines: [],
      vacationCode: 'U',
    });
    expect(out.rows[0]!.cells.slice(0, 10)).toEqual([
      'U',
      'U',
      'U',
      'U',
      '/',
      '/',
      'U',
      'U',
      'U',
      '',
    ]);
    expect(out.rows[0]!.cells[17]).toBe('U');
  });

  it('enforceWeekendFreeDays turns U on Sa/So into slash', () => {
    const grid = emptyGrid({
      headers: ['4', '5', '6', '7'],
      rosterMonth: 9,
      rosterYear: 2026,
      colCenters: [1, 2, 3, 4],
      rows: [{ name: 'X', yCenter: 1, cells: ['U', 'U', 'U', 'U'] }],
    });
    const out = enforceWeekendFreeDays(grid);
    expect(out.rows[0]!.cells).toEqual(['U', '/', '/', 'U']);
  });

  it('expandVacationRuns does not bridge distant seeds', () => {
    const grid = emptyGrid({
      headers: ['7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18'],
      rosterMonth: 9,
      rosterYear: 2026,
      colCenters: [170, 180, 190, 200, 210, 220, 230, 240, 250, 260, 270, 280],
      rows: [
        {
          name: 'Böhme, Patrick',
          yCenter: 50,
          cells: ['U', 'U', 'U', '', '', '', '', '', '', '', '', 'U'],
        },
      ],
    });
    const out = expandVacationRuns(grid, [], 'U');
    expect(out.rows[0]!.cells[3]).toBe('');
    expect(out.rows[0]!.cells[11]).toBe('U');
  });

  it('clamp clears U past a seed cluster', () => {
    const grid = emptyGrid({
      headers: ['8', '9', '10'],
      rosterMonth: 9,
      rosterYear: 2026,
      colCenters: [1, 2, 3],
      rows: [{ name: 'X', yCenter: 1, cells: ['U', 'U', 'U'] }],
    });
    const seeds = new Map<number, number[]>([[0, [0]]]);
    const out = clampVacationToSeedClusters(grid, seeds, 'U', 6);
    expect(out.rows[0]!.cells).toEqual(['U', '', '']);
  });

  it('MATRIX_FREE_DAY is slash', () => {
    expect(MATRIX_FREE_DAY).toBe('/');
  });
});
