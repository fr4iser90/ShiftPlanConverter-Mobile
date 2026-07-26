export type MatrixCell = {
  text: string;
  x: number;
  y: number;
};

export type MatrixRow = {
  name: string;
  yCenter: number;
  cells: string[]; // aligned to column headers (same length)
};

export type MonthMatrixGrid = {
  headers: string[];
  rows: MatrixRow[];
  /** True when we found ≥2 person rows and ≥3 day columns */
  ok: boolean;
  /** Column X centers — kept for pack-aware row refine after name pick */
  colCenters?: number[];
  nameMaxX?: number;
  colGap?: number;
  rowYPad?: number;
};

/** Compact quality stats for status UI (one-shot; no second OCR). */
export type MonthMatrixMetrics = {
  headerCount: number;
  rowCount: number;
  fillRatio: number;
  /** How many distinct day-of-month numbers 1..31 appear in headers */
  dayCoverage: number;
};
