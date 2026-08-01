/**
 * After OCR: keep only the month-table band (drop title banner + footer noise).
 * One geometry pass — no second OCR.
 */
import type { OcrLine } from './recognize';
import { fitSlope } from './layouts/month-matrix/skew';

function yCenter(l: OcrLine): number {
  return l.boundingBox.y + l.boundingBox.height / 2;
}

function xCenter(l: OcrLine): number {
  return l.boundingBox.x + l.boundingBox.width / 2;
}

function clean(t: string): string {
  return String(t || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isWeekdayish(text: string): boolean {
  const t = clean(text).replace(/\s+/g, '');
  if (/^(Mo|Di|Mi|Do|Fr|Sa|So)\d{1,2}$/i.test(t)) return true;
  // Reverse OCR: "24Di", "20Fr".
  if (/^\d{1,2}(Mo|Di|Mi|Do|Fr|Sa|So)$/i.test(t)) return true;
  // Bare weekday: Title Case only — all-caps short tokens are duty codes, not headers.
  return /^(Mo|Di|Mi|Do|Fr|Sa|So)$/.test(t);
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = nums.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export type FocusedOcrLines = {
  lines: OcrLine[];
  pageWidth: number;
  pageHeight: number;
  /** True when a non-trivial table band was applied. */
  focused: boolean;
};

/**
 * Clip OCR lines to the duty-roster table (header strip + name rows).
 * Drops huge "Februar" titles and footer blocks far below the last person.
 * Skewed photos: band along header residual (not a flat Y window).
 */
export function focusLinesOnMonthTable(
  lines: OcrLine[],
  pageWidth: number,
  pageHeight: number
): FocusedOcrLines {
  const empty = {
    lines,
    pageWidth,
    pageHeight:
      pageHeight > 0
        ? pageHeight
        : Math.max(...lines.map((l) => l.boundingBox.y + l.boundingBox.height), 1),
    focused: false,
  };
  if (lines.length < 20) return empty;

  const w =
    pageWidth > 0
      ? pageWidth
      : Math.max(...lines.map((l) => l.boundingBox.x + l.boundingBox.width), 1);
  const h =
    pageHeight > 0
      ? pageHeight
      : Math.max(...lines.map((l) => l.boundingBox.y + l.boundingBox.height), 1);

  const headers = lines.filter((l) => isWeekdayish(l.text));
  if (headers.length < 3) return empty;

  const headerXs = headers.map((l) => xCenter(l));
  const headerYs = headers.map((l) => yCenter(l));
  const ySpan = Math.max(...headerYs) - Math.min(...headerYs);
  const slope = fitSlope(headerXs, headerYs);
  const x0 = median(headerXs);
  const y0 = median(headerYs);
  const residual = (l: OcrLine) => yCenter(l) - (y0 + slope * (xCenter(l) - x0));

  // Densest header band in residual space (handles steep diagonals).
  const flatWindow = Math.max(36, Math.min(120, w * 0.035));
  const resWindow =
    ySpan > flatWindow * 1.5 || Math.abs(slope) > 0.05
      ? Math.max(28, Math.min(90, w * 0.03))
      : flatWindow;
  const headerRes = headers.map(residual).sort((a, b) => a - b);
  let bestStart = 0;
  let bestCount = 1;
  for (let i = 0; i < headerRes.length; i++) {
    let j = i;
    while (j + 1 < headerRes.length && headerRes[j + 1]! - headerRes[i]! <= resWindow) j++;
    if (j - i + 1 > bestCount) {
      bestCount = j - i + 1;
      bestStart = i;
    }
  }
  const bandRes = headerRes.slice(bestStart, bestStart + bestCount);
  const bandResMid = bandRes.reduce((s, r) => s + r, 0) / bandRes.length;
  const bandHeaders = headers.filter((l) => Math.abs(residual(l) - bandResMid) <= resWindow);
  const bandY =
    bandHeaders.reduce((s, l) => s + yCenter(l), 0) / Math.max(1, bandHeaders.length);

  // Person-name candidates: left third, letters, below header strip in residual space.
  const nameLike = lines.filter((l) => {
    if (xCenter(l) > w * 0.38) return false;
    const t = clean(l.text);
    if (t.length < 3 || /\d/.test(t)) return false;
    if (!/^[A-Za-zÄÖÜäöüß]/.test(t)) return false;
    return residual(l) > bandResMid + 8;
  });
  if (nameLike.length < 4) return empty;

  const nameRes = nameLike.map(residual).sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < nameRes.length; i++) gaps.push(nameRes[i]! - nameRes[i - 1]!);
  const medGap = median(gaps.filter((g) => g > 0 && g < 120)) || 30;
  // Cut before a huge footer jump in residual space.
  let resBottom = nameRes[nameRes.length - 1]!;
  for (let i = 1; i < nameRes.length; i++) {
    if (nameRes[i]! - nameRes[i - 1]! > Math.max(90, medGap * 4.5)) {
      resBottom = nameRes[i - 1]!;
      break;
    }
  }

  const resTop = bandResMid - Math.max(24, resWindow * 0.6);
  const resMax = resBottom + medGap * 2.2;
  const leftNames = nameLike.filter((l) => residual(l) <= resBottom + 1);
  const xLeft = Math.max(
    0,
    Math.min(...leftNames.map((l) => l.boundingBox.x)) - 12
  );
  const rightHeaders = bandHeaders.length ? bandHeaders : headers;
  const xRight = Math.min(
    w,
    Math.max(
      ...rightHeaders.map((l) => l.boundingBox.x + l.boundingBox.width),
      ...lines
        .filter((l) => {
          const r = residual(l);
          return r >= resTop && r <= resMax;
        })
        .map((l) => l.boundingBox.x + l.boundingBox.width)
    ) + 8
  );

  // Axis-aligned bbox must still cover the skewed table (use header+name extents).
  const yTop = Math.max(
    0,
    Math.min(...bandHeaders.map((l) => l.boundingBox.y), ...leftNames.map((l) => l.boundingBox.y)) -
      28
  );
  const yMax = Math.min(
    h,
    Math.max(
      ...leftNames.map((l) => l.boundingBox.y + l.boundingBox.height),
      ...bandHeaders.map((l) => l.boundingBox.y + l.boundingBox.height)
    ) +
      medGap * 2.2
  );

  if (yMax - yTop < h * 0.15 || xRight - xLeft < w * 0.35) return empty;

  const focused = lines.filter((l) => {
    const r = residual(l);
    const xc = xCenter(l);
    if (r < resTop || r > resMax) return false;
    if (xc < xLeft - 4 || xc > xRight + 4) return false;
    // Keep lines inside the AABB of the skewed table as a soft gate.
    const yc = yCenter(l);
    if (yc < yTop - 8 || yc > yMax + 8) return false;
    // Drop remaining mega title glyphs inside the band (tall letter-only banners).
    {
      const tt = clean(l.text);
      if (
        l.boundingBox.height > 40 &&
        tt.length >= 5 &&
        !/\d/.test(tt) &&
        /^[A-Za-zÄÖÜäöüß]+$/i.test(tt)
      ) {
        return false;
      }
    }
    return true;
  });

  if (focused.length < lines.length * 0.25 || focused.length < 40) return empty;

  return {
    lines: focused,
    pageWidth: w,
    pageHeight: h,
    focused: true,
  };
}
