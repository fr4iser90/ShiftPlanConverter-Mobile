export type MatrixCell = {
  text: string;
  x: number;
  y: number;
};

export type MatrixRow = {
  name: string;
  yCenter: number;
  cells: string[]; // aligned to column headers (same length)
  /** Optional tight vertical extent of the name glyphs (page px) for overlays. */
  yNameTop?: number;
  yNameBot?: number;
};

export type MonthMatrixGrid = {
  headers: string[];
  rows: MatrixRow[];
  /** True when we found ≥2 person rows and ≥3 day columns */
  ok: boolean;
  /** Why ok is false (debug / layout-specific reject). */
  reason?: string;
  /** Column X centers — kept for pack-aware row refine after name pick */
  colCenters?: number[];
  nameMaxX?: number;
  colGap?: number;
  rowYPad?: number;
  /**
   * Page row skew: Δy/Δx in OCR page pixels (positive = row drops toward the right).
   * Used for cell assign + highlight overlay.
   */
  rowSlope?: number;
  /** Y center of the day-header strip (page pixels) — for overlay / crops. */
  headerBandY?: number;
};

/** Compact quality stats for status UI (one-shot; no second OCR). */
export type MonthMatrixMetrics = {
  headerCount: number;
  rowCount: number;
  fillRatio: number;
  /** How many distinct day-of-month numbers 1..31 appear in headers */
  dayCoverage: number;
};
