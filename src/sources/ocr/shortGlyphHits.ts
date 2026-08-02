/**
 * Short-glyph cell evidence applied onto a month-matrix grid.
 * No I/O — safe for unit tests and finalize pipeline.
 */
import { cleanCell } from './layouts/month-matrix/geometry';
import type { MonthMatrixGrid } from './layouts/month-matrix/types';
import type { OcrLine } from './recognize';

export type InvertCellHit = {
  rowIndex: number;
  dayIndex: number;
  text: string;
  line: OcrLine;
};

function isDigitNoiseCell(text: string): boolean {
  const t = cleanCell(text);
  return /^\d{3,}$/.test(t);
}

/** Apply glyph hits directly onto grid cell strings. */
export function applyInvertCellHitsToGrid(
  grid: MonthMatrixGrid,
  hits: InvertCellHit[]
): MonthMatrixGrid {
  if (!hits.length) return grid;
  const rows = grid.rows.map((r, ri) => {
    const mine = hits.filter((h) => h.rowIndex === ri);
    if (!mine.length) return r;
    const cells = r.cells.slice();
    for (const h of mine) {
      const cur = cleanCell(cells[h.dayIndex] || '');
      // Prefer shape-match short glyphs over vacation-expand fill.
      if (!cur || isDigitNoiseCell(cur) || cur === '/' || cur === 'U') {
        cells[h.dayIndex] = h.text;
      }
    }
    return { ...r, cells };
  });
  return { ...grid, rows };
}
