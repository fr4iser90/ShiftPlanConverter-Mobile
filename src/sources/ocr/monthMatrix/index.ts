/**
 * Month-matrix OCR: name × day grid from wall-plan geometry.
 * Split modules — import from `./monthMatrix` (this index) for a stable public API.
 */
export type { MatrixCell, MatrixRow, MonthMatrixGrid, MonthMatrixMetrics } from './types';
export { buildMonthMatrixGrid } from './build';
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
