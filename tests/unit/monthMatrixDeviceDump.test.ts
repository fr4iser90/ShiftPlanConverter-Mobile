import {
  buildMonthMatrixGrid,
  formatMonthMatrixTable,
  matrixRowsAsNameCandidates,
} from '../../src/sources/ocr/monthMatrix';
import { isPlausiblePersonName } from '../../src/sources/ocr/names';
import { hasPrivateDump, loadMonthMatrixDump } from './_ocrFixtures';

describe('private device OCR dump (workplace — local /tmp only)', () => {
  const run = hasPrivateDump('crop-1920');

  it('builds a matrix with real person names (not day/time junk)', () => {
    if (!run) return;
    const fixture = loadMonthMatrixDump('crop-1920');
    const grid = buildMonthMatrixGrid(fixture.lines, fixture.pageWidth);
    expect(grid.ok).toBe(true);
    expect(grid.headers.some((h) => /^(Di|Mi|Do|Fr|Mo|Sa|So)/i.test(h))).toBe(true);
    expect(grid.headers.some((h) => /\d{1,2}[:.]\d{2}/.test(h))).toBe(false);
    expect(grid.rows.length).toBeGreaterThanOrEqual(8);
    for (const r of grid.rows) {
      expect(isPlausiblePersonName(r.name)).toBe(true);
    }
    const names = matrixRowsAsNameCandidates(grid).map((n) => n.label);
    expect(names.every((n) => !/Sa\s*\d|Tabelle|1150/i.test(n))).toBe(true);
  });

  it('formats week chunks with all people (phone-readable)', () => {
    if (!run) return;
    const fixture = loadMonthMatrixDump('crop-1920');
    const grid = buildMonthMatrixGrid(fixture.lines, fixture.pageWidth);
    const matched =
      grid.rows.find((r) => /Alice|Bianca|Clara/i.test(r.name))?.name ||
      grid.rows[0]?.name ||
      '';
    const table = formatMonthMatrixTable(grid, {
      title: `Roster (month matrix) — ${grid.rows.length} people`,
      matchedName: matched,
    });
    expect(table).toContain('│');
    expect(table).toMatch(/>/);
    expect(table).toMatch(/people/);
  });
});
