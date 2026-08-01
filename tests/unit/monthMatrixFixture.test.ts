import {
  buildMonthMatrixGrid,
  formatMonthMatrixTable,
  matrixRowsAsNameCandidates,
} from '../../src/sources/ocr/layouts/month-matrix';
import { isPlausiblePersonName } from '../../src/sources/ocr/names';
import type { OcrLine } from '../../src/sources/ocr/recognize';

function L(text: string, x: number, y: number, w = 40, h = 14): OcrLine {
  return { text, boundingBox: { x, y, width: w, height: h } };
}

/** Synthetic anonymized board — no workplace PII. */
function syntheticMonthBoard(): { pageWidth: number; lines: OcrLine[] } {
  const pageWidth = 1200;
  const headers = ['Sa1', 'So2', 'Mo3', 'Di4', 'Mi5', 'Do6', 'Fr7', 'Sa8', 'So9', 'Mo10'];
  const people: [string, string][] = [
    ['PersonA', 'Alpha'],
    ['PersonB', 'Beta'],
    ['PersonC', 'Gamma'],
    ['PersonD', 'Zeta'],
    ['PersonE', 'Eta'],
    ['PersonF', 'Theta'],
    ['PersonG', 'Iota'],
    ['PersonH', 'Kappa'],
    ['PersonI', 'Lambda'],
    ['PersonJ', 'Mu'],
  ];
  const lines: OcrLine[] = [];
  headers.forEach((h, i) => {
    lines.push(L(h, 220 + i * 90, 20, 36));
  });
  people.forEach(([last, first], r) => {
    const y = 70 + r * 48;
    lines.push(L(last, 12, y, 70));
    lines.push(L(first, 12, y + 16, 50));
    headers.forEach((_, i) => {
      const cx = 220 + i * 90;
      if (i % 3 === 0) lines.push(L('U', cx, y + 4, 18));
      else if (i % 3 === 1) {
        lines.push(L('F', cx, y + 2, 14));
        lines.push(L('07:35-15:50', cx, y + 16, 70));
      } else lines.push(L('S', cx, y + 4, 14));
    });
  });
  return { pageWidth, lines };
}

describe('month-matrix synthetic fixture (no workplace PII)', () => {
  const fixture = syntheticMonthBoard();

  it('builds a full name×day grid with plausible person names only', () => {
    const grid = buildMonthMatrixGrid(fixture.lines, fixture.pageWidth);
    expect(grid.ok).toBe(true);
    expect(grid.headers.length).toBeGreaterThanOrEqual(7);
    expect(grid.rows.length).toBeGreaterThanOrEqual(8);

    for (const r of grid.rows) {
      expect(isPlausiblePersonName(r.name)).toBe(true);
    }
    expect(grid.rows.some((r) => /Stationsleitung|Februar|Fkt/i.test(r.name))).toBe(false);

    const names = matrixRowsAsNameCandidates(grid);
    expect(names.length).toBeGreaterThanOrEqual(8);
    expect(names.some((n) => /PersonA|PersonB/i.test(n.label))).toBe(true);
  });

  it('formats a comparable ASCII matrix (week chunks, all people)', () => {
    const grid = buildMonthMatrixGrid(fixture.lines, fixture.pageWidth);
    const table = formatMonthMatrixTable(grid, {
      title: 'Roster (month matrix)',
      matchedName: 'PersonA, Alpha',
    });
    expect(table).toContain('│');
    expect(table).toMatch(/people|Personen/i);
    expect(table).toMatch(/PersonA|PersonB/i);
    expect(table.split('\n').filter((l) => l.includes('│')).length).toBeGreaterThan(8);
  });
});
