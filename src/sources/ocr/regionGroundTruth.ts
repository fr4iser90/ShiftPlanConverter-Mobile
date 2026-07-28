/**
 * Hand-marked geometry ground truth for OCR overlay / column checks.
 *
 * Put next to a private photo as `<stem>.regions.json` under tmp/test-files/
 * (gitignored — never commit real roster photos or marks):
 *
 * {
 *   "photo": "roster-a.jpg",
 *   "imageWidth": 4096,
 *   "imageHeight": 3072,
 *   "nameColumn": { "x": 0.02, "y": 0.30, "width": 0.16, "height": 0.40 },
 *   "dayHeader":  { "x": 0.18, "y": 0.26, "width": 0.78, "height": 0.04 },
 *   "ownRow":     { "x": 0.02, "y": 0.40, "width": 0.95, "height": 0.035 },
 *   "dayXs": { "Di4": 0.315, "Mi5": 0.348, "Do6": 0.380 }
 * }
 *
 * All boxes are normalized 0..1 on the *display* image (EXIF already applied).
 * dayXs optional — fraction of image width for column centers.
 *
 * Checker (OCR_CHECK_REGIONS=1) compares estimateHighlightOverlays + grid.headers
 * against these marks and fails when mean |dy| or day-x error exceeds thresholds.
 */
export type NormRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type OcrRegionGroundTruth = {
  photo: string;
  imageWidth?: number;
  imageHeight?: number;
  nameColumn?: NormRect;
  dayHeader?: NormRect;
  ownRow?: NormRect;
  /** Optional day label → normalized x center (0..1). */
  dayXs?: Record<string, number>;
};

export type RegionCheckReport = {
  stem: string;
  ok: boolean;
  issues: string[];
  metrics: Record<string, number>;
};

function rectCenterY(r: NormRect): number {
  return r.y + r.height / 2;
}

function meanAbs(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + Math.abs(b), 0) / nums.length;
}

/**
 * Compare auto overlays to hand marks.
 * Thresholds in *normalized* image coords (≈2% of height ≈ mild drift).
 */
export function checkOverlaysAgainstGroundTruth(opts: {
  stem: string;
  gt: OcrRegionGroundTruth;
  overlays: { kind: string; box: NormRect }[];
  headers?: string[];
  colCenters?: number[];
  pageWidth?: number;
  /** Max mean |Δy| for own-row / header centers (normalized). */
  maxMeanDy?: number;
  /** Max |Δx| for a day column (normalized). */
  maxDayDx?: number;
}): RegionCheckReport {
  const maxDy = opts.maxMeanDy ?? 0.028;
  const maxDx = opts.maxDayDx ?? 0.035;
  const issues: string[] = [];
  const metrics: Record<string, number> = {};

  const own = opts.overlays.filter((o) => o.kind === 'own-row');
  const hdr = opts.overlays.filter((o) => o.kind === 'day-header');

  if (opts.gt.ownRow && own.length) {
    const gtY = rectCenterY(opts.gt.ownRow);
    const dys = own.map((o) => rectCenterY(o.box) - gtY);
    const m = meanAbs(dys);
    metrics.ownRowMeanAbsDy = m;
    // Also flag if slope invents large end-to-end drop
    const ySpan = Math.max(...own.map((o) => rectCenterY(o.box))) - Math.min(...own.map((o) => rectCenterY(o.box)));
    metrics.ownRowYSpan = ySpan;
    if (m > maxDy) issues.push(`own-row mean |dy|=${m.toFixed(3)} > ${maxDy}`);
    if (ySpan > maxDy * 2.5) issues.push(`own-row y-span=${ySpan.toFixed(3)} (too skewed vs flat GT)`);
  } else if (opts.gt.ownRow && !own.length) {
    issues.push('own-row missing in overlays');
  }

  if (opts.gt.dayHeader && hdr.length) {
    const gtY = rectCenterY(opts.gt.dayHeader);
    const dys = hdr.map((o) => rectCenterY(o.box) - gtY);
    const m = meanAbs(dys);
    metrics.headerMeanAbsDy = m;
    const ySpan =
      Math.max(...hdr.map((o) => rectCenterY(o.box))) - Math.min(...hdr.map((o) => rectCenterY(o.box)));
    metrics.headerYSpan = ySpan;
    if (m > maxDy) issues.push(`day-header mean |dy|=${m.toFixed(3)} > ${maxDy}`);
    if (ySpan > maxDy * 2.5) issues.push(`day-header y-span=${ySpan.toFixed(3)} (too skewed vs flat GT)`);
  }

  const dayXs = opts.gt.dayXs || {};
  const headers = opts.headers || [];
  const centers = opts.colCenters || [];
  const pageW = opts.pageWidth || 1;
  if (Object.keys(dayXs).length && headers.length && centers.length) {
    let n = 0;
    let sum = 0;
    for (const [label, xNorm] of Object.entries(dayXs)) {
      const i = headers.findIndex(
        (h) => h.toLowerCase() === label.toLowerCase() || h.replace(/\s/g, '') === label.replace(/\s/g, '')
      );
      if (i < 0) {
        issues.push(`day ${label}: header missing`);
        continue;
      }
      const got = centers[i]! / pageW;
      const dx = Math.abs(got - xNorm);
      sum += dx;
      n++;
      if (dx > maxDx) issues.push(`day ${label}: |dx|=${dx.toFixed(3)} > ${maxDx}`);
    }
    if (n) metrics.dayMeanAbsDx = sum / n;
  }

  return { stem: opts.stem, ok: issues.length === 0, issues, metrics };
}
