import type { MonthMatrixGrid } from '@/src/sources/ocr/layouts/month-matrix/types';
import type { OcrLine } from '@/src/sources/ocr/recognize';
import {
  assessMatrixUsability,
  isJunkRosterName,
  isSolidRosterName,
} from '@/src/sources/ocr/matrixUsability';

function emptyGrid(
  partial: Partial<MonthMatrixGrid> & { rows: MonthMatrixGrid['rows'] }
): MonthMatrixGrid {
  return {
    ok: true,
    headers: partial.headers || [],
    nameMaxX: partial.nameMaxX ?? 100,
    colCenters: partial.colCenters || [],
    rosterMonth: partial.rosterMonth,
    rosterYear: partial.rosterYear,
    overlayLayout: partial.overlayLayout,
    rows: partial.rows,
  };
}

function line(text: string, x: number, y: number, w = 40, h = 12): OcrLine {
  return {
    text,
    boundingBox: { x, y, width: w, height: h },
  };
}

describe('matrixUsability', () => {
  it('flags junk comma-names that look plausible', () => {
    expect(isJunkRosterName('Bis, Uhr')).toBe(true);
    expect(isJunkRosterName('Dr., Frau')).toBe(true);
    expect(isSolidRosterName('Böhme, Patrick')).toBe(true);
    expect(isSolidRosterName('Müller, Anna')).toBe(true);
  });

  it('rejects near-empty month-matrix with junk names', () => {
    const headers = Array.from({ length: 30 }, (_, i) => String(i + 1));
    const empty = headers.map(() => '');
    const grid = emptyGrid({
      headers,
      rows: [
        { name: 'Bis, Uhr', yCenter: 10, cells: empty },
        { name: 'Dr., Frau', yCenter: 20, cells: empty },
        { name: 'Alle, Vom', yCenter: 30, cells: empty },
      ],
    });
    const a = assessMatrixUsability(grid, { layoutId: 'month-matrix' });
    expect(a.usable).toBe(false);
    expect(['junk-names', 'no-plausible-names', 'low-fill']).toContain(a.reason);
  });

  it('accepts a filled month-matrix with real names', () => {
    const headers = Array.from({ length: 10 }, (_, i) => String(i + 1));
    const cells = headers.map((_, i) => (i % 2 === 0 ? 'F' : 'U'));
    const grid = emptyGrid({
      headers,
      rows: [
        { name: 'Böhme, Patrick', yCenter: 10, cells },
        { name: 'Müller, Anna', yCenter: 20, cells },
        { name: 'Schmidt, Lea', yCenter: 30, cells },
      ],
    });
    const a = assessMatrixUsability(grid, { layoutId: 'month-matrix' });
    expect(a.usable).toBe(true);
    expect(a.reason).toBeNull();
    expect(a.solidNames).toBe(3);
  });

  it('rejects date-duty axes when layout is month-matrix', () => {
    const headers = Array.from({ length: 10 }, (_, i) => String(i + 1));
    const cells = headers.map(() => 'F');
    const grid = emptyGrid({
      headers,
      rows: [
        { name: 'Böhme, Patrick', yCenter: 100, cells },
        { name: 'Müller, Anna', yCenter: 120, cells },
      ],
    });
    const lines: OcrLine[] = [];
    for (let d = 1; d <= 12; d++) {
      lines.push(line(`${String(d).padStart(2, '0')}.09`, 20, 80 + d * 20));
    }
    lines.push(line('HD', 200, 10));
    const a = assessMatrixUsability(grid, {
      layoutId: 'month-matrix',
      lines,
      pageWidth: 800,
      pageHeight: 400,
    });
    expect(a.usable).toBe(false);
    expect(a.reason).toBe('layout-mismatch');
  });

  it('defers fill check when requested', () => {
    const headers = Array.from({ length: 20 }, (_, i) => String(i + 1));
    const empty = headers.map(() => '');
    const grid = emptyGrid({
      headers,
      rows: [
        { name: 'Böhme, Patrick', yCenter: 10, cells: empty },
        { name: 'Müller, Anna', yCenter: 20, cells: empty },
      ],
    });
    const early = assessMatrixUsability(grid, {
      layoutId: 'month-matrix',
      deferFillCheck: true,
    });
    expect(early.usable).toBe(true);
    const late = assessMatrixUsability(grid, { layoutId: 'month-matrix' });
    expect(late.usable).toBe(false);
    expect(late.reason).toBe('low-fill');
  });

  it('skips person-name floors for date-duty overlay', () => {
    const headers = ['HD', 'ND', 'BD'];
    const cells = ['OA Dr. X', '', 'FA Y'];
    const grid = emptyGrid({
      headers,
      overlayLayout: 'date-duty',
      rows: [
        { name: '01.09', yCenter: 10, cells },
        { name: '02.09', yCenter: 20, cells: ['', 'OA Z', ''] },
        { name: '03.09', yCenter: 30, cells: ['FA A', '', ''] },
      ],
    });
    const a = assessMatrixUsability(grid, { layoutId: 'date-duty' });
    expect(a.usable).toBe(true);
  });
});
