import {
  biasLinesByPaintedRegions,
  buildOwnRowAssistGrid,
  relaxAssistGridOk,
} from '@/src/sources/ocr/assistPaintedRegions';
import type { OcrLine } from '@/src/sources/ocr/recognize';
import type { MonthMatrixGrid } from '@/src/sources/ocr/layouts/month-matrix/types';

function ln(text: string, x: number, y: number, w = 40, h = 14): OcrLine {
  return { text, boundingBox: { x, y, width: w, height: h } };
}

describe('assistPaintedRegions', () => {
  const pageW = 1000;
  const pageH = 800;

  it('biases lines to painted name + header + body', () => {
    const lines = [
      ln('PersonA', 50, 400),
      ln('Mo1', 200, 100),
      ln('F', 220, 400),
      ln('noise', 50, 50),
    ];
    const kept = biasLinesByPaintedRegions(
      lines,
      [
        { kind: 'name-column', box: { x: 0.02, y: 0.35, width: 0.12, height: 0.4 } },
        { kind: 'day-header', box: { x: 0.15, y: 0.1, width: 0.7, height: 0.06 } },
      ],
      pageW,
      pageH
    );
    const texts = kept.map((l) => l.text);
    expect(texts).toContain('PersonA');
    expect(texts).toContain('Mo1');
    expect(texts).toContain('F');
    expect(texts).not.toContain('noise');
  });

  it('builds own-row grid with calendar headers', () => {
    const lines = [
      ln('PersonB', 40, 400, 80),
      ln('F', 200, 400),
      ln('/', 280, 400),
      ln('M3', 360, 400),
      ln('U', 440, 400),
    ];
    const grid = buildOwnRowAssistGrid({
      lines,
      pageWidth: pageW,
      pageHeight: pageH,
      ownRow: { x: 0.02, y: 0.48, width: 0.9, height: 0.05 },
      monthYear: { year: 2026, month: 8 },
      preferredName: null,
    });
    expect(grid.ok).toBe(true);
    expect(grid.rows).toHaveLength(1);
    expect(grid.rows[0]!.name).toMatch(/PersonB/i);
    expect(grid.headers[0]).toMatch(/^Sa1$/); // Aug 1 2026 = Saturday
    expect(grid.headers.length).toBeGreaterThanOrEqual(3);
    expect(grid.rows[0]!.cells.length).toBe(grid.headers.length);
  });

  it('relaxes ok for a single assist row', () => {
    const weak: MonthMatrixGrid = {
      headers: ['Mo1', 'Di2', 'Mi3'],
      rows: [{ name: 'PersonC', yCenter: 10, cells: ['F', '/', 'M1'] }],
      ok: false,
      reason: 'need-two-rows',
    };
    expect(relaxAssistGridOk(weak).ok).toBe(true);
  });
});
