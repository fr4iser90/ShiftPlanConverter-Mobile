/**
 * After OCR: keep only the month-table band (drop title banner + footer noise).
 * One geometry pass — no second OCR.
 */
import type { OcrLine } from './recognize';

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
  const t = clean(text);
  if (/^(MO|ST|OP|FT|RU)$/.test(t)) return false;
  return /^(Mo|Di|Mi|Do|Fr|Sa|So)(\d{1,2})?$/i.test(t);
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

  const headerYs = headers.map((l) => yCenter(l)).sort((a, b) => a - b);
  // Densest header band (ignore stray MO codes in the body).
  let bestStart = 0;
  let bestCount = 1;
  for (let i = 0; i < headerYs.length; i++) {
    let j = i;
    while (j + 1 < headerYs.length && headerYs[j + 1] - headerYs[i] <= 36) j++;
    if (j - i + 1 > bestCount) {
      bestCount = j - i + 1;
      bestStart = i;
    }
  }
  const bandYs = headerYs.slice(bestStart, bestStart + bestCount);
  const bandY = bandYs.reduce((s, y) => s + y, 0) / bandYs.length;

  // Person-name candidates: left third, letters, below header band.
  const nameLike = lines.filter((l) => {
    if (xCenter(l) > w * 0.32) return false;
    const t = clean(l.text);
    if (t.length < 3 || /\d/.test(t)) return false;
    if (/telefon|stationsleitung|fkt|februar|anästhesie|objekt/i.test(t)) return false;
    if (!/^[A-Za-zÄÖÜäöüß]/.test(t)) return false;
    return yCenter(l) > bandY + 10;
  });
  if (nameLike.length < 4) return empty;

  const nameYs = nameLike.map((l) => yCenter(l)).sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < nameYs.length; i++) gaps.push(nameYs[i] - nameYs[i - 1]);
  const medGap = median(gaps.filter((g) => g > 0 && g < 120)) || 30;
  // Cut before a huge footer jump (e.g. 500px to next block).
  let yBottom = nameYs[nameYs.length - 1];
  for (let i = 1; i < nameYs.length; i++) {
    if (nameYs[i] - nameYs[i - 1] > Math.max(90, medGap * 4.5)) {
      yBottom = nameYs[i - 1];
      break;
    }
  }

  const yTop = Math.max(0, bandY - 28);
  const yMax = Math.min(h, yBottom + medGap * 2.2);
  const leftNames = nameLike.filter((l) => yCenter(l) <= yBottom + 1);
  const xLeft = Math.max(
    0,
    Math.min(...leftNames.map((l) => l.boundingBox.x)) - 12
  );
  const rightHeaders = headers.filter((l) => Math.abs(yCenter(l) - bandY) < 40);
  const xRight = Math.min(
    w,
    Math.max(
      ...rightHeaders.map((l) => l.boundingBox.x + l.boundingBox.width),
      ...lines
        .filter((l) => yCenter(l) >= yTop && yCenter(l) <= yMax)
        .map((l) => l.boundingBox.x + l.boundingBox.width)
    ) + 8
  );

  if (yMax - yTop < h * 0.15 || xRight - xLeft < w * 0.35) return empty;

  const focused = lines.filter((l) => {
    const yc = yCenter(l);
    const xc = xCenter(l);
    if (yc < yTop || yc > yMax) return false;
    if (xc < xLeft - 4 || xc > xRight + 4) return false;
    // Drop remaining mega title glyphs inside the band
    if (/^februar$/i.test(clean(l.text)) && l.boundingBox.height > 40) return false;
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
