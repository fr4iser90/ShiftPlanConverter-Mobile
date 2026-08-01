/**
 * Month-matrix layout: person × day wall-plan geometry + score + overlays.
 * Import from `./layouts/month-matrix` for the public API.
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
export {
  MONTH_MATRIX_LAYOUT,
  scoreMonthMatrix,
  scoreMonthMatrixHints,
} from './score';
export { estimateMonthMatrixHighlightOverlays } from './overlays';
export {
  estimateMonthMatrixOwnNameBox,
  estimateMonthMatrixRegionBoxes,
} from './regionBoxes';
