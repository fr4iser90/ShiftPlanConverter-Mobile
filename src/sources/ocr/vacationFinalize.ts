/**
 * Single post-refine stage for short-glyph vacation / free-day marks.
 *
 * Evidence → expand (bounded) → restore evidence → calendar weekends → cluster clamp.
 * cameraOcr should call this once after refine (and again only after a person-row re-scoop).
 */
import {
  expandVacationRuns,
  MATRIX_FREE_DAY,
} from '@/src/convert/parsers/ocr/applyPackMapping';
import type { MonthMatrixGrid } from './layouts/month-matrix/types';
import type { OcrLine } from './recognize';
import {
  applyInvertCellHitsToGrid,
  type InvertCellHit,
} from './shortGlyphHits';
import { isMatrixWeekendColumn } from './matrixCalendar';
import { VACATION_RUN_POLICY } from './shortGlyphPolicy';

export type ShortGlyphVacationInput = {
  grid: MonthMatrixGrid;
  /** Shape-match (and similar) cell evidence — not pack duties. */
  glyphHits: InvertCellHit[];
  lines?: OcrLine[] | null;
  vacationCode?: string | null;
};

/** Force Sa/So off vacation U; empty weekend → free-day slash. */
export function enforceWeekendFreeDays(grid: MonthMatrixGrid): MonthMatrixGrid {
  if (!grid.rosterMonth || !grid.rosterYear) return grid;
  const rows = grid.rows.map((row) => {
    const cells = row.cells.slice();
    for (let i = 0; i < cells.length; i++) {
      if (!isMatrixWeekendColumn(grid, i)) continue;
      const cur = (cells[i] || '').trim().toUpperCase();
      if (!cur || cur === 'U') cells[i] = MATRIX_FREE_DAY;
    }
    return { ...row, cells };
  });
  return { ...grid, rows };
}

/**
 * Keep vacation U only inside/near glyph-U seed clusters.
 * Rows with no glyph U seeds are left unchanged (OCR-only U stays).
 */
export function clampVacationToSeedClusters(
  grid: MonthMatrixGrid,
  seedDayIndexesByRow: Map<number, number[]>,
  vacationCode: string = VACATION_RUN_POLICY.defaultCode,
  maxGap = VACATION_RUN_POLICY.maxSeedGap
): MonthMatrixGrid {
  const vac = vacationCode.toUpperCase();
  const rows = grid.rows.map((row, ri) => {
    const seeds = (seedDayIndexesByRow.get(ri) || [])
      .filter((d) => d >= 0)
      .sort((a, b) => a - b);
    if (!seeds.length) return row;
    const allowed = new Set<number>();
    let clusterStart = seeds[0]!;
    let prev = seeds[0]!;
    const flush = (from: number, to: number) => {
      for (let i = from; i <= to; i++) allowed.add(i);
    };
    for (let s = 1; s < seeds.length; s++) {
      const cur = seeds[s]!;
      if (cur - prev > maxGap) {
        flush(clusterStart, prev);
        clusterStart = cur;
      }
      prev = cur;
    }
    flush(clusterStart, prev);
    const cells = row.cells.slice();
    for (let i = 0; i < cells.length; i++) {
      if ((cells[i] || '').trim().toUpperCase() !== vac) continue;
      if (allowed.has(i)) continue;
      // Left-fill of the first seed in a cluster (expand left).
      const nearSeed = seeds.some((s) => i < s && s - i <= maxGap && allowed.has(s));
      if (nearSeed) continue;
      cells[i] = '';
    }
    return { ...row, cells };
  });
  return { ...grid, rows };
}

function glyphUSeedsByRow(hits: InvertCellHit[]): Map<number, number[]> {
  const map = new Map<number, number[]>();
  for (const h of hits) {
    if (h.text !== 'U' && h.text.toUpperCase() !== 'U') continue;
    const list = map.get(h.rowIndex) || [];
    list.push(h.dayIndex);
    map.set(h.rowIndex, list);
  }
  return map;
}

/**
 * Apply short-glyph vacation finalization in one ordered pass.
 */
export function finalizeShortGlyphVacation(input: ShortGlyphVacationInput): MonthMatrixGrid {
  const vac = (input.vacationCode || VACATION_RUN_POLICY.defaultCode).toUpperCase();
  const hits = input.glyphHits;
  if (!hits.length) return input.grid;

  let grid = applyInvertCellHitsToGrid(input.grid, hits);
  grid = expandVacationRuns(grid, input.lines ?? null, vac);
  // Evidence wins over expand (especially `/` on weekends).
  grid = applyInvertCellHitsToGrid(grid, hits);
  grid = enforceWeekendFreeDays(grid);
  grid = clampVacationToSeedClusters(grid, glyphUSeedsByRow(hits), vac);
  return grid;
}
