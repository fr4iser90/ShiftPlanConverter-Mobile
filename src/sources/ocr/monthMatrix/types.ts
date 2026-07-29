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
  /**
   * Duty-row band at the name column (page px): midpoint to neighbor names.
   * Same geometry for cell scoop + own-row overlay (incl. 2–3 block rows).
   */
  yLo?: number;
  yHi?: number;
  /** Printed frame source for this person band. */
  bandSource?: 'ruled' | 'soft';
};

export type DayFrame = {
  dayIndex: number;
  label: string;
  x0: number;
  x1: number;
};

export type PersonFrame = {
  rowIndex: number;
  y0: number;
  y1: number;
  source: 'ruled' | 'soft';
};

export type HeaderFrame = {
  y0: number;
  y1: number;
};

export type LatticeQuality = {
  ok: boolean;
  reason?: string;
  hLines: number;
  vLines: number;
  expectedCols?: number;
  inferredCols?: number;
  regularity?: number;
  keepRatio?: number;
  dayPitchCv?: number;
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
  /** Tight Mo/Di glyph band (not the rule line under the headers). */
  headerBandTop?: number;
  headerBandBot?: number;
  /** Exact printed or reconstructed day frames used for scoop/overlay. */
  dayFrames?: DayFrame[];
  /** Exact person frames used for scoop/overlay. */
  personFrames?: PersonFrame[];
  /** Exact header strip used for overlay/validation. */
  headerFrame?: HeaderFrame;
  /** One-path lattice readiness and diagnostics. */
  latticeQuality?: LatticeQuality;
  /**
   * OCR content AABB (page px) — table ink, not photo margins / metal frame.
   * Overlays clamp to this so name/own-row strips don't span the whole image.
   */
  contentLeft?: number;
  contentRight?: number;
  contentTop?: number;
  contentBottom?: number;
};

/** Compact quality stats for status UI (one-shot; no second OCR). */
export type MonthMatrixMetrics = {
  headerCount: number;
  rowCount: number;
  fillRatio: number;
  /** How many distinct day-of-month numbers 1..31 appear in headers */
  dayCoverage: number;
};
