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
 *   "ownName":    { "x": 0.02, "y": 0.40, "width": 0.14, "height": 0.035 },
 *   "dayXs": { "Mo1": 0.315, "Di2": 0.348, "Mi3": 0.380 }
 * }
 *
 * Makierung colors: cyan=nameColumn, orange=dayHeader, blue=ownRow, red=ownName.
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
  /** Optional: only the matched person's name cell (red mark). */
  ownName?: NormRect;
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

function rectIoU(a: NormRect, b: NormRect): number {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.width, b.x + b.width);
  const y1 = Math.min(a.y + a.height, b.y + b.height);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  const union = a.width * a.height + b.width * b.height - inter;
  return union > 0 ? inter / union : 0;
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
  const minIoU = 0.7;
  const issues: string[] = [];
  const metrics: Record<string, number> = {};

  const own = opts.overlays.filter((o) => o.kind === 'own-row');
  const hdr = opts.overlays.filter((o) => o.kind === 'day-header');

  if (opts.gt.ownRow && own.length) {
    const ownUnion = {
      x: Math.min(...own.map((o) => o.box.x)),
      y: Math.min(...own.map((o) => o.box.y)),
      width:
        Math.max(...own.map((o) => o.box.x + o.box.width)) -
        Math.min(...own.map((o) => o.box.x)),
      height:
        Math.max(...own.map((o) => o.box.y + o.box.height)) -
        Math.min(...own.map((o) => o.box.y)),
    };
    const gtY = rectCenterY(opts.gt.ownRow);
    const dys = own.map((o) => rectCenterY(o.box) - gtY);
    const m = meanAbs(dys);
    metrics.ownRowMeanAbsDy = m;
    const ySpan = Math.max(...own.map((o) => rectCenterY(o.box))) - Math.min(...own.map((o) => rectCenterY(o.box)));
    metrics.ownRowYSpan = ySpan;
    // Union height of own-row overlays vs hand mark — catch "too tall / too short".
    const autoTop = Math.min(...own.map((o) => o.box.y));
    const autoBot = Math.max(...own.map((o) => o.box.y + o.box.height));
    const autoH = autoBot - autoTop;
    const gtH = opts.gt.ownRow.height;
    metrics.ownRowAutoHeight = autoH;
    metrics.ownRowGtHeight = gtH;
    metrics.ownRowIoU = rectIoU(ownUnion, opts.gt.ownRow);
    if (m > maxDy) issues.push(`own-row mean |dy|=${m.toFixed(3)} > ${maxDy}`);
    if (metrics.ownRowIoU < minIoU) issues.push(`own-row IoU=${metrics.ownRowIoU.toFixed(3)} < ${minIoU}`);
    if (ySpan > maxDy * 2.5) issues.push(`own-row y-span=${ySpan.toFixed(3)} (too skewed vs flat GT)`);
    // Auto strip must not be wildly taller than the mark (overlap into neighbors).
    if (gtH > 0.005 && autoH > gtH * 2.2) {
      issues.push(`own-row height=${autoH.toFixed(3)} >> gt ${gtH.toFixed(3)} (overlaps neighbors)`);
    }
    // Must cover the mark center (not sit entirely above/below).
    if (gtY < autoTop - 0.01 || gtY > autoBot + 0.01) {
      issues.push(`own-row band misses GT center y=${gtY.toFixed(3)}`);
    }
  } else if (opts.gt.ownRow && !own.length) {
    issues.push('own-row missing in overlays');
  }

  if (opts.gt.dayHeader && hdr.length) {
    const hdrUnion = {
      x: Math.min(...hdr.map((o) => o.box.x)),
      y: Math.min(...hdr.map((o) => o.box.y)),
      width:
        Math.max(...hdr.map((o) => o.box.x + o.box.width)) -
        Math.min(...hdr.map((o) => o.box.x)),
      height:
        Math.max(...hdr.map((o) => o.box.y + o.box.height)) -
        Math.min(...hdr.map((o) => o.box.y)),
    };
    const gtY = rectCenterY(opts.gt.dayHeader);
    const dys = hdr.map((o) => rectCenterY(o.box) - gtY);
    const m = meanAbs(dys);
    metrics.headerMeanAbsDy = m;
    const ySpan =
      Math.max(...hdr.map((o) => rectCenterY(o.box))) - Math.min(...hdr.map((o) => rectCenterY(o.box)));
    metrics.headerYSpan = ySpan;
    metrics.headerIoU = rectIoU(hdrUnion, opts.gt.dayHeader);
    if (m > maxDy) issues.push(`day-header mean |dy|=${m.toFixed(3)} > ${maxDy}`);
    if (metrics.headerIoU < minIoU) issues.push(`day-header IoU=${metrics.headerIoU.toFixed(3)} < ${minIoU}`);
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
