import { focusLinesOnMonthTable } from '../../src/sources/ocr/focusTable';
import { buildMonthMatrixGrid } from '../../src/sources/ocr/monthMatrix';
import { applyPackMappingToGrid } from '../../src/convert/parsers/ocr/applyPackMapping';
import { applyKnownSpellingsToGridRows } from '../../src/sources/ocr/names';
import type { MappingValue } from '../../src/convert/types';
import op from '../../src/packs/builtin/st-elisabeth-leipzig/mappings/pflege/op.json';
import { hasPrivateDump, loadMonthMatrixDump } from './_ocrFixtures';

describe('focusLinesOnMonthTable (private hires dump)', () => {
  const run = hasPrivateDump('hires-3000');

  const anaesthesie = (op as { presets: Record<string, Record<string, MappingValue>> }).presets
    .Anästhesie;
  const colors = (op as { colors: Record<string, string> }).colors;

  it('keeps a usable table band', () => {
    if (!run) return;
    const hires = loadMonthMatrixDump('hires-3000');
    const focused = focusLinesOnMonthTable(
      hires.lines,
      hires.pageWidth,
      hires.pageHeight || 2978
    );
    expect(focused.lines.length).toBeGreaterThan(80);
    expect(focused.lines.length).toBeLessThanOrEqual(hires.lines.length);
  });

  it('builds denser grid on 3000px dump', () => {
    if (!run) return;
    const hires = loadMonthMatrixDump('hires-3000');
    const grid = buildMonthMatrixGrid(hires.lines, hires.pageWidth);
    expect(grid.ok).toBe(true);
    expect(grid.headers.length).toBeGreaterThanOrEqual(14);
    expect(grid.rows.length).toBeGreaterThanOrEqual(14);

    const mapped = applyPackMappingToGrid(grid, anaesthesie, colors);
    const cells = mapped.rows.flatMap((r) => r.cells).filter(Boolean);
    expect(cells.some((c) => /^(F|F1|F2|MO|M1|M2|M3|S|ST|U)$/i.test(c))).toBe(true);
    expect(cells.every((c) => !/73#/.test(c))).toBe(true);

    const spelled = applyKnownSpellingsToGridRows(mapped.rows, 'Nordmann, Alice', null);
    expect(spelled.length).toBeGreaterThan(0);
  });
});
