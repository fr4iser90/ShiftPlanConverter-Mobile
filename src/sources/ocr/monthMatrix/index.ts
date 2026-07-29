/**
 * Month-matrix OCR: name × day grid from wall-plan geometry.
 * Split modules — import from `./monthMatrix` (this index) for a stable public API.
 */
export type { MatrixCell, MatrixRow, MonthMatrixGrid, MonthMatrixMetrics } from './types';
export { buildMonthMatrixGrid, type BuildMonthMatrixOpts } from './build';
export {
  dayColBoundsFromVerticals,
  clipLatticeToContent,
  headerBandFromLattice,
  owningColIndexFromBounds,
  snapDayCentersToLattice,
} from './lattice';
export type { LatticeColBound, RuledLattice, ContentBounds } from './lattice';
export {
  splitGluedDayHeaderText,
  expandGluedDayHeaderTokens,
  mergeSplitDayHeaderTokens,
  fillCalendarDayGaps,
  collectDayColumns,
  collectDayColumnsFromDayNumbers,
  detectMonthYearFromOcr,
  enforceCalendarColumnLabels,
} from './dayHeaders';
export {
  formatMonthMatrixTable,
  formatShiftCell,
  matrixRowsAsNameCandidates,
  computeMonthMatrixMetrics,
} from './format';
export {
  cleanCell,
  looksLikeDayHeader,
  normalizeHeader,
  median,
  xCenter,
  yCenter,
} from './geometry';
export {
  clampSlope,
  estimateRowSlopeFromHeaders,
  expectedYAtX,
  fitSlope,
  slopeToDegrees,
} from './skew';
