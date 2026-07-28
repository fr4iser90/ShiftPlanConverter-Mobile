import type { OcrLine } from '../recognize';
import {
  cleanCell,
  clusterSorted,
  looksLikeDayHeader,
  looksLikeDayNumber,
  looksLikeWeekdayOnly,
  median,
  normalizeHeader,
  xCenter,
  yCenter,
} from './geometry';
import { fitSlope } from './skew';

function fitHeaderSlope(lines: OcrLine[]): number {
  if (lines.length < 3) return 0;
  return fitSlope(
    lines.map((l) => xCenter(l)),
    lines.map((l) => yCenter(l))
  );
}

const WD_RE = /^(Mo|Di|Mi|Do|Fr|Sa|So)$/i;
/** OCR often collapses Mi/Di/Fr/So to a single letter inside glued headers. */
const WD_STUB: Record<string, string> = { D: 'Di', M: 'Mi', F: 'Fr', S: 'So' };

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const;

function normalizeWd(raw: string): string {
  const t = raw.slice(0, 2);
  return `${t[0].toUpperCase()}${t.slice(1).toLowerCase()}`;
}

function shiftWeekday(wd: string, steps: number): string {
  const i = WEEKDAYS.findIndex((w) => w.toLowerCase() === wd.toLowerCase());
  if (i < 0) return wd;
  return WEEKDAYS[(i + steps + WEEKDAYS.length * 8) % WEEKDAYS.length];
}

function parseHeaderDay(label: string): { wd: string | null; day: number | null } {
  const t = cleanCell(label).replace(/\s+/g, '');
  const full = t.match(/^(Mo|Di|Mi|Do|Fr|Sa|So)(\d{1,2})$/i);
  if (full) return { wd: normalizeWd(full[1]), day: Number(full[2]) };
  const rev = t.match(/^(\d{1,2})(Mo|Di|Mi|Do|Fr|Sa|So)$/i);
  if (rev) return { wd: normalizeWd(rev[2]), day: Number(rev[1]) };
  const ocr1 = t.match(/^(Mo|Di|Mi|Do|Fr|Sa|So)[tlI|](\d)$/i);
  if (ocr1) return { wd: normalizeWd(ocr1[1]), day: Number(`1${ocr1[2]}`) };
  const wdOnly = t.match(/^(Mo|Di|Mi|Do|Fr|Sa|So)$/i);
  if (wdOnly) return { wd: normalizeWd(wdOnly[1]), day: null };
  if (/^\d{1,2}$/.test(t)) {
    const n = Number(t);
    if (n >= 1 && n <= 31) return { wd: null, day: n };
  }
  return { wd: null, day: null };
}

/**
 * Split ML Kit mega-tokens like "MI5Do", "24D25M26Do", "20Fr21SoP" into day headers.
 * Returns [] when the token is already atomic (or not a multi-day glue blob).
 */
export function splitGluedDayHeaderText(text: string): string[] {
  const t = cleanCell(text).replace(/\s+/g, '');
  if (!t) return [];
  // So2 often OCR'd as "o2"
  const oOnly = t.match(/^o(\d{1,2})$/i);
  if (oOnly) return [`So${oOnly[1]}`];
  if (t.length === 1 && WD_STUB[t.toUpperCase()]) return [WD_STUB[t.toUpperCase()]];
  if (WD_RE.test(t)) return [`${t[0].toUpperCase()}${t.slice(1).toLowerCase()}`];
  if (looksLikeDayHeader(t) || looksLikeDayNumber(t)) return [];
  // Keep calendar years intact — "2025" must not become day crumbs 20+25.
  if (/^20\d{2}$/.test(t)) return [];

  const out: string[] = [];
  let i = 0;
  while (i < t.length) {
    const wd = t.slice(i).match(/^(Mo|Di|Mi|Do|Fr|Sa|So)/i);
    if (wd) {
      const label = `${wd[1][0].toUpperCase()}${wd[1].slice(1).toLowerCase()}`;
      i += wd[1].length;
      const num = t.slice(i).match(/^\d{1,2}/);
      if (num) {
        out.push(`${label}${num[0]}`);
        i += num[0].length;
      } else {
        out.push(label);
      }
      continue;
    }
    const stub = WD_STUB[t[i].toUpperCase()];
    if (stub && !t.slice(i).match(/^(Mo|Di|Mi|Do|Fr|Sa|So)/i)) {
      const num = t.slice(i + 1).match(/^\d{1,2}/);
      if (num) {
        out.push(`${stub}${num[0]}`);
        i += 1 + num[0].length;
        continue;
      }
    }
    const num = t.slice(i).match(/^\d{1,2}/);
    if (num) {
      out.push(num[0]);
      i += num[0].length;
      continue;
    }
    i += 1;
  }
  return out.length >= 2 ? out : [];
}

/**
 * Expand glued header lines into one synthetic line per day, x spaced across the parent box.
 * Also normalizes lone OCR stubs ("o2"→So2, "D"→Di) in the header strip.
 */
export function expandGluedDayHeaderTokens(lines: OcrLine[]): OcrLine[] {
  const out: OcrLine[] = [];
  for (const l of lines) {
    const raw = cleanCell(l.text).replace(/\s+/g, '');
    const o2 = raw.match(/^o(\d{1,2})$/i);
    if (o2) {
      out.push({ text: `So${o2[1]}`, boundingBox: { ...l.boundingBox } });
      continue;
    }
    // "24Di" / "20Fr" → Di24 / Fr20 (atomic, do not split into day+wd).
    const rev = raw.match(/^(\d{1,2})(Mo|Di|Mi|Do|Fr|Sa|So)$/i);
    if (rev) {
      const wd = `${rev[2][0].toUpperCase()}${rev[2].slice(1).toLowerCase()}`;
      out.push({ text: `${wd}${rev[1]}`, boundingBox: { ...l.boundingBox } });
      continue;
    }
    // "Mot7" / "Mol7" → Mo17 (OCR 1→t/l/I).
    const ocr1 = raw.match(/^(Mo|Di|Mi|Do|Fr|Sa|So)[tlI|](\d)$/i);
    if (ocr1) {
      const wd = `${ocr1[1][0].toUpperCase()}${ocr1[1].slice(1).toLowerCase()}`;
      out.push({ text: `${wd}1${ocr1[2]}`, boundingBox: { ...l.boundingBox } });
      continue;
    }
    // Do not rewrite single-letter stubs (F/D/M/S) — those are often duty codes in the body.
    const parts = splitGluedDayHeaderText(l.text);
    if (parts.length < 2) {
      out.push(l);
      continue;
    }
    const { x, y, width, height } = l.boundingBox;
    const n = parts.length;
    const slot = Math.max(1, width / n);
    for (let i = 0; i < n; i++) {
      out.push({
        text: parts[i],
        boundingBox: {
          x: x + i * slot,
          y,
          width: slot,
          height,
        },
      });
    }
  }
  return out;
}

/**
 * ML Kit elements often split "Sa 1" into "Sa" + "1". Merge those for column headers.
 * Digits bind to the nearest weekday on the left (avoids So stealing Mo's "10").
 */
export function mergeSplitDayHeaderTokens(lines: OcrLine[]): OcrLine[] {
  if (lines.length < 2) return lines;
  const sorted = lines
    .slice()
    .sort((a, b) => a.boundingBox.y - b.boundingBox.y || a.boundingBox.x - b.boundingBox.x);
  const wdHeights = sorted
    .filter((l) => looksLikeWeekdayOnly(l.text))
    .map((l) => l.boundingBox.height)
    .filter((h) => h > 0);
  const medH = Math.max(8, median(wdHeights) || 12);
  const maxDx = Math.max(36, medH * 5);
  const maxDy = Math.max(10, medH * 1.35);

  type Pair = { wi: number; di: number; score: number; asDay1?: boolean };
  const pairs: Pair[] = [];
  for (let di = 0; di < sorted.length; di++) {
    const b = sorted[di];
    if (!looksLikeDayNumber(b.text)) continue;
    let best: Pair | null = null;
    for (let wi = 0; wi < sorted.length; wi++) {
      if (wi === di) continue;
      const a = sorted[wi];
      if (!looksLikeWeekdayOnly(a.text)) continue;
      const dy = Math.abs(yCenter(b) - yCenter(a));
      if (dy > maxDy) continue;
      const aRight = a.boundingBox.x + a.boundingBox.width;
      const dx = b.boundingBox.x - aRight;
      if (dx < -medH || dx > maxDx) continue;
      const digit = cleanCell(b.text);
      // Sa+"11" next to So2 is OCR doubling the stem of day 1 — bind as Sa1, not Sa11.
      const forceDay1 =
        /^(Sa|So)$/i.test(cleanCell(a.text)) &&
        digit === '11' &&
        sorted.some(
          (o, oi) =>
            oi !== wi &&
            oi !== di &&
            /^(So2|o2)$/i.test(cleanCell(o.text).replace(/\s+/g, '')) &&
            xCenter(o) > xCenter(b) &&
            xCenter(o) - xCenter(b) < maxDx * 2.5
        );
      const score = Math.abs(Math.max(dx, 0)) * 3 + dy;
      if (!best || score < best.score) best = { wi, di, score, asDay1: forceDay1 || undefined };
    }
    if (best) pairs.push(best);
  }

  pairs.sort((a, b) => a.score - b.score);
  const usedW = new Set<number>();
  const usedD = new Set<number>();
  const chosen: Pair[] = [];
  for (const p of pairs) {
    if (usedW.has(p.wi) || usedD.has(p.di)) continue;
    usedW.add(p.wi);
    usedD.add(p.di);
    chosen.push(p);
  }

  const out: OcrLine[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (usedD.has(i)) continue;
    if (usedW.has(i)) {
      const p = chosen.find((c) => c.wi === i)!;
      const a = sorted[p.wi];
      const b = sorted[p.di];
      const box = {
        x: Math.min(a.boundingBox.x, b.boundingBox.x),
        y: Math.min(a.boundingBox.y, b.boundingBox.y),
        width:
          Math.max(a.boundingBox.x + a.boundingBox.width, b.boundingBox.x + b.boundingBox.width) -
          Math.min(a.boundingBox.x, b.boundingBox.x),
        height:
          Math.max(a.boundingBox.y + a.boundingBox.height, b.boundingBox.y + b.boundingBox.height) -
          Math.min(a.boundingBox.y, b.boundingBox.y),
      };
      const wdRaw = cleanCell(a.text).slice(0, 2);
      const wd = `${wdRaw[0].toUpperCase()}${wdRaw.slice(1).toLowerCase()}`;
      const dayNum = p.asDay1 ? '1' : cleanCell(b.text);
      out.push({
        text: `${wd}${dayNum}`,
        boundingBox: box,
      });
      continue;
    }
    if (
      looksLikeDayNumber(sorted[i].text) &&
      cleanCell(sorted[i].text) === '11' &&
      sorted.some((o) => /^(Sa)$/i.test(cleanCell(o.text)) && xCenter(o) < xCenter(sorted[i])) &&
      sorted.some(
        (o) =>
          /^(So2|o2)$/i.test(cleanCell(o.text).replace(/\s+/g, '')) &&
          xCenter(o) > xCenter(sorted[i])
      )
    ) {
      continue;
    }
    out.push(sorted[i]);
  }
  return out;
}

/**
 * Weekend headers (Sa8/So9) are often grey-on-grey and collapse into glued OCR.
 * One path: between two OCR day-numbers, insert missing calendar days at interpolated X.
 */
export function fillCalendarDayGaps(
  centers: number[],
  headers: string[]
): { centers: number[]; headers: string[] } {
  if (centers.length !== headers.length || centers.length < 2) {
    return { centers, headers };
  }

  type Col = { x: number; label: string; day: number | null; wd: string | null };
  const cols: Col[] = centers.map((x, i) => {
    const p = parseHeaderDay(headers[i]);
    return { x, label: headers[i], day: p.day, wd: p.wd };
  });

  if (cols[0]?.wd === 'Sa' && cols[0].day == null && cols[1]?.day === 2) {
    cols[0] = { ...cols[0], day: 1, label: 'Sa1' };
  }

  // Leading Saturday missing entirely (OCR dropped Sa1) while calendar starts at So2.
  if (cols[0]?.day === 2 && cols[0]?.wd === 'So') {
    const gap =
      cols.length >= 2 && cols[1].x > cols[0].x
        ? cols[1].x - cols[0].x
        : cols.length >= 2
          ? Math.abs(cols[1].x - cols[0].x) || 40
          : 40;
    cols.unshift({ x: cols[0].x - gap, day: 1, wd: 'Sa', label: 'Sa1' });
  }

  const out: Col[] = [];
  for (let i = 0; i < cols.length; i++) {
    const cur = cols[i];
    const prevNum = [...out].reverse().find((c) => c.day != null);
    const nextNum = cols.slice(i).find((c) => c.day != null);

    if (
      cur.day == null &&
      prevNum?.day != null &&
      nextNum?.day != null &&
      nextNum.day - prevNum.day > 1 &&
      nextNum.day - prevNum.day <= 6 &&
      cur.x > prevNum.x &&
      cur.x < nextNum.x
    ) {
      continue;
    }

    if (prevNum?.day != null && cur.day != null && cur.day > prevNum.day + 1) {
      const gap = cur.day - prevNum.day;
      if (gap <= 6 && prevNum.wd) {
        for (let step = 1; step < gap; step++) {
          const day = prevNum.day + step;
          const wd = shiftWeekday(prevNum.wd, step);
          const x = prevNum.x + ((cur.x - prevNum.x) * step) / gap;
          out.push({ x, day, wd, label: `${wd}${day}` });
        }
      }
    }

    if (cur.day != null && !cur.wd && prevNum?.day != null && prevNum.wd) {
      const step = cur.day - prevNum.day;
      if (step >= 0 && step <= 6) {
        const wd = shiftWeekday(prevNum.wd, step);
        out.push({ ...cur, wd, label: `${wd}${cur.day}` });
        continue;
      }
    }

    out.push(cur);
  }

  return {
    centers: out.map((c) => c.x),
    headers: out.map((c) => (c.day != null && c.wd ? `${c.wd}${c.day}` : c.label)),
  };
}

/**
 * Day columns from the header strip only (not body shift cells).
 * Prefer weekday+day labels; if OCR drops weekdays, recover from day-numbers
 * (+ optional month/year in the OCR for calendar weekday names).
 */
export type DayColumns = {
  centers: number[];
  headers: string[];
  /** Mean Y of the chosen header strip (page pixels). */
  bandY: number;
};

export function collectDayColumns(
  lines: OcrLine[],
  pageWidth: number,
  nameMaxX: number
): DayColumns {
  const seedWeekdays = lines.filter(
    (l) =>
      xCenter(l) >= nameMaxX * 0.55 &&
      (looksLikeDayHeader(l.text) || looksLikeWeekdayOnly(l.text))
  );
  if (seedWeekdays.length < 2) {
    return collectDayColumnsFromDayNumbers(lines, pageWidth, nameMaxX);
  }

  // Steep detection must ignore body weekday-noise (duty "Mo"/reverse crumbs).
  const pageH = Math.max(
    ...lines.map((l) => l.boundingBox.y + l.boundingBox.height),
    1
  );
  const topish = seedWeekdays.filter((l) => yCenter(l) < pageH * 0.45);
  const steepProbe = topish.length >= 4 ? topish : seedWeekdays;
  const seedYs = steepProbe.map((l) => yCenter(l)).sort((a, b) => a - b);
  const ySpan = seedYs[seedYs.length - 1]! - seedYs[0]!;
  const seedSlope = fitHeaderSlope(steepProbe);
  const steep =
    (ySpan > Math.max(120, pageWidth * 0.06) && Math.abs(seedSlope) > 0.05) ||
    Math.abs(seedSlope) > 0.12;
  const xMin = nameMaxX * (steep ? 0.55 : 0.85);
  const weekdays = steep
    ? seedWeekdays
    : seedWeekdays.filter((l) => xCenter(l) >= xMin);
  if (weekdays.length < 2) {
    return collectDayColumnsFromDayNumbers(lines, pageWidth, nameMaxX);
  }

  const ys = weekdays.map((l) => yCenter(l)).sort((a, b) => a - b);

  let headerBand: OcrLine[];
  let bandY: number;
  let bandTol: number;
  let slopeForBand = seedSlope;

  if (steep) {
    // Skewed strip: cluster by residual from the header slope, not raw Y.
    const x0 = median(weekdays.map((l) => xCenter(l)));
    const y0 = median(weekdays.map((l) => yCenter(l)));
    const residual = (l: OcrLine) =>
      yCenter(l) - (y0 + seedSlope * (xCenter(l) - x0));
    const residuals = weekdays.map(residual).sort((a, b) => a - b);
    const bandGaps: number[] = [];
    for (let i = 1; i < residuals.length; i++) {
      bandGaps.push(residuals[i]! - residuals[i - 1]!);
    }
    const bandGap = Math.max(12, median(bandGaps.filter((g) => g > 0 && g < 80)) || 18);
    const yBands = clusterSorted(
      weekdays.map((l) => ({ v: residual(l), item: l })),
      bandGap * 1.25
    );
    headerBand = yBands.reduce((best, g) => (g.length > best.length ? g : best), yBands[0]!);
    bandY =
      headerBand.reduce((s, l) => s + yCenter(l), 0) / Math.max(1, headerBand.length);
    slopeForBand = fitHeaderSlope(headerBand) || seedSlope;
    bandTol = Math.max(22, bandGap * 1.6, pageWidth * Math.abs(slopeForBand) * 0.08);
  } else {
    // Prefer raw-Y densest band (stable on mild photos). Widen tol with header slope.
    const bandGaps: number[] = [];
    for (let i = 1; i < ys.length; i++) bandGaps.push(ys[i]! - ys[i - 1]!);
    const bandGap = Math.max(12, median(bandGaps.filter((g) => g > 0 && g < 80)) || 18);
    const yBands = clusterSorted(
      weekdays.map((l) => ({ v: yCenter(l), item: l })),
      bandGap * 1.1
    );
    headerBand = yBands.reduce((best, g) => (g.length > best.length ? g : best), yBands[0]!);
    bandY =
      headerBand.reduce((s, l) => s + yCenter(l), 0) / Math.max(1, headerBand.length);
    slopeForBand = fitHeaderSlope(headerBand);
    const skewPad = Math.max(12, pageWidth * Math.abs(slopeForBand) * 0.55 + pageWidth * 0.004);
    bandTol = Math.max(14, bandGap * 1.4, skewPad);
  }

  const xAnchor = median(headerBand.map((l) => xCenter(l)));
  const inBand = (l: OcrLine) => {
    const yExp = bandY + slopeForBand * (xCenter(l) - xAnchor);
    return Math.abs(yCenter(l) - yExp) <= bandTol;
  };
  const headerTokens = lines.filter(
    (l) => xCenter(l) >= xMin && inBand(l) && looksLikeDayHeader(l.text)
  );
  const loneWeekdays = lines.filter(
    (l) => xCenter(l) >= xMin && inBand(l) && looksLikeWeekdayOnly(l.text)
  );
  const orphanDays = lines.filter(
    (l) =>
      xCenter(l) >= xMin &&
      inBand(l) &&
      looksLikeDayNumber(l.text) &&
      !headerTokens.some(
        (h) =>
          Math.abs(xCenter(h) - xCenter(l)) < 22 &&
          Math.abs(yCenter(h) - yCenter(l)) < bandTol
      )
  );

  const anchors: { x: number; label: string }[] = [
    ...headerTokens.map((l) => ({ x: xCenter(l), label: normalizeHeader(l.text) })),
    ...loneWeekdays.map((l) => {
      const wd = cleanCell(l.text).slice(0, 2);
      return {
        x: xCenter(l),
        label: `${wd[0].toUpperCase()}${wd.slice(1).toLowerCase()}`,
      };
    }),
    ...orphanDays.map((l) => ({ x: xCenter(l), label: cleanCell(l.text) })),
  ].sort((a, b) => a.x - b.x);

  if (anchors.length < 3) {
    return collectDayColumnsFromDayNumbers(lines, pageWidth, nameMaxX);
  }

  const labeledXs = anchors
    .filter((a) => /^(Mo|Di|Mi|Do|Fr|Sa|So)/i.test(a.label))
    .map((a) => a.x);
  const labeledGaps: number[] = [];
  for (let i = 1; i < labeledXs.length; i++) {
    labeledGaps.push(labeledXs[i]! - labeledXs[i - 1]!);
  }
  const minLabeledGap = Math.min(...labeledGaps.filter((g) => g > 8), pageWidth);
  const colGap = Math.max(10, Math.min(minLabeledGap * 0.55, pageWidth / 22));

  const groups: { x: number; label: string }[][] = [];
  const isWd = (label: string) => /^(Mo|Di|Mi|Do|Fr|Sa|So)/i.test(label);
  for (const a of anchors) {
    const last = groups[groups.length - 1];
    if (
      last &&
      a.x - last[last.length - 1]!.x <= colGap &&
      !(isWd(last[last.length - 1]!.label) && isWd(a.label))
    ) {
      last.push(a);
    } else {
      groups.push([a]);
    }
  }

  const centers = groups.map((g) => g.reduce((s, a) => s + a.x, 0) / g.length);
  const headers = groups.map((g) => {
    const labeled =
      g.find((a) => isWd(a.label) && /\d/.test(a.label)) || g.find((a) => isWd(a.label));
    return labeled?.label || g[0]!.label;
  });
  const labeled = enforceCalendarColumnLabels(centers, headers, detectMonthYearFromOcr(lines));
  const deduped = dedupeDayColumns(labeled.centers, labeled.headers);
  return { ...deduped, bandY };
}

/**
 * One column per calendar day. Drops OCR doubles (same day twice) keeping the
 * better label (wd+day) and left-er X when tied.
 */
export function dedupeDayColumns(
  centers: number[],
  headers: string[]
): { centers: number[]; headers: string[] } {
  if (centers.length !== headers.length || centers.length < 2) {
    return { centers, headers };
  }
  type Col = { x: number; label: string; day: number | null; score: number };
  const cols: Col[] = centers.map((x, i) => {
    const p = parseHeaderDay(headers[i]!);
    const score =
      (p.day != null ? 10 : 0) + (p.wd ? 5 : 0) + (/\d/.test(headers[i]!) ? 2 : 0);
    return { x, label: headers[i]!, day: p.day, score };
  });
  const byDay = new Map<number, Col>();
  const undated: Col[] = [];
  for (const c of cols) {
    if (c.day == null || c.day < 1 || c.day > 31) {
      undated.push(c);
      continue;
    }
    const prev = byDay.get(c.day);
    if (!prev || c.score > prev.score || (c.score === prev.score && c.x < prev.x)) {
      byDay.set(c.day, c);
    }
  }
  const dated = [...byDay.values()].sort((a, b) => a.x - b.x);
  // Keep undated only if they sit in an X-gap (rare weekday-only stubs).
  const kept = dated.slice();
  for (const u of undated) {
    const near = kept.some((c) => Math.abs(c.x - u.x) < 18);
    if (!near) kept.push(u);
  }
  kept.sort((a, b) => a.x - b.x);
  // Prefer ascending day order when we have mostly numbered days.
  if (dated.length >= Math.max(5, kept.length * 0.6)) {
    return {
      centers: dated.map((c) => c.x),
      headers: dated.map((c) => c.label),
    };
  }
  return { centers: kept.map((c) => c.x), headers: kept.map((c) => c.label) };
}

/** Parse "März 2025" / "March 2025" / "02/2026" style cues from OCR. */
export function detectMonthYearFromOcr(
  lines: OcrLine[]
): { year: number; month: number } | null {
  const blob = lines
    .map((l) => cleanCell(l.text))
    .filter(Boolean)
    .join(' ');
  const months: Record<string, number> = {
    jan: 1,
    januar: 1,
    january: 1,
    feb: 2,
    februar: 2,
    february: 2,
    mär: 3,
    maer: 3,
    marz: 3,
    märz: 3,
    march: 3,
    apr: 4,
    april: 4,
    mai: 5,
    may: 5,
    jun: 6,
    juni: 6,
    june: 6,
    jul: 7,
    juli: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    okt: 10,
    oct: 10,
    oktober: 10,
    october: 10,
    nov: 11,
    november: 11,
    dez: 12,
    dec: 12,
    dezember: 12,
    december: 12,
  };
  const lower = blob.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  let month: number | null = null;
  for (const [k, v] of Object.entries(months)) {
    if (new RegExp(`(^|[^a-z])${k}([^a-z]|$)`, 'i').test(lower)) {
      month = v;
      break;
    }
  }
  const y = blob.match(/(20\d{2})/);
  if (!month || !y) return null;
  const year = Number(y[1]);
  if (year < 2000 || year > 2100) return null;
  return { year, month };
}

function germanWeekdayForDate(year: number, month: number, day: number): string {
  // JS: 0=Sun … 6=Sat → German roster labels
  const map = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'] as const;
  return map[new Date(year, month - 1, day).getDay()];
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

type DayCol = { x: number; label: string; day: number | null; wd: string | null };

/**
 * Fix OCR day-number traps that shift every column after them:
 * - Sa+"11" → Sa1 (stem of 1 doubled next to So2)
 * - Mi2 after Di11 → Mi12 (dropped tens digit)
 * Then, when month/year is known, force weekday labels from the calendar
 * (X positions stay; labels are rewritten — one path, no second parser).
 */
export function enforceCalendarColumnLabels(
  centers: number[],
  headers: string[],
  cal: { year: number; month: number } | null
): { centers: number[]; headers: string[] } {
  if (centers.length !== headers.length || centers.length < 2) {
    return { centers, headers };
  }

  const cols: DayCol[] = centers.map((x, i) => {
    const p = parseHeaderDay(headers[i]);
    return { x, label: headers[i], day: p.day, wd: p.wd };
  });

  // Sa11 / So11 next to day-2 Sunday → day 1
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    if (c.day !== 11 || !c.wd || !/^(Sa|So)$/i.test(c.wd)) continue;
    const right = cols.slice(i + 1, i + 4).find((o) => o.day != null);
    if (right && (right.day === 2 || (right.wd === 'So' && right.day == null))) {
      cols[i] = { ...c, day: 1, label: `${c.wd}1` };
    }
  }

  // Dropped tens digit: … Di11, Mi2 → Mi12 (single digit that should continue the decade)
  for (let i = 1; i < cols.length; i++) {
    const prev = cols[i - 1];
    const cur = cols[i];
    if (prev.day == null || cur.day == null) continue;
    if (cur.day >= 10 || cur.day < 1) continue;
    if (cur.day > prev.day) continue; // still ascending in the same decade
    const repaired = cur.day + 10 * Math.floor(prev.day / 10);
    // Prefer +10 when it continues the sequence (prev+1), else +10 if prev was 10–19 and cur < prev
    if (repaired === prev.day + 1 && repaired <= 31) {
      const wd = cur.wd || (prev.wd ? shiftWeekday(prev.wd, 1) : null);
      cols[i] = {
        ...cur,
        day: repaired,
        wd,
        label: wd ? `${wd}${repaired}` : String(repaired),
      };
    } else if (prev.day >= 10 && cur.day < prev.day && cur.day + 10 <= 31) {
      const d = cur.day + 10;
      if (d === prev.day + 1 || d === prev.day + 2) {
        const wd = cur.wd || (prev.wd ? shiftWeekday(prev.wd, d - prev.day) : null);
        cols[i] = { ...cur, day: d, wd, label: wd ? `${wd}${d}` : String(d) };
      }
    }
  }

  // Impossible day numbers (>31) → drop day, keep X for gap fill
  for (let i = 0; i < cols.length; i++) {
    if (cols[i].day != null && (cols[i].day! < 1 || cols[i].day! > 31)) {
      cols[i] = { ...cols[i], day: null, label: cols[i].wd || cols[i].label };
    }
  }

  // With calendar: force WD from date; keep day numbers (after repair).
  if (cal) {
    const maxDay = daysInMonth(cal.year, cal.month);
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      if (c.day == null || c.day < 1 || c.day > maxDay) continue;
      const wd = germanWeekdayForDate(cal.year, cal.month, c.day);
      cols[i] = { ...c, wd, label: `${wd}${c.day}` };
    }
  } else {
    // No month/year: still repair WD from previous numbered column when inconsistent.
    for (let i = 1; i < cols.length; i++) {
      const prev = [...cols.slice(0, i)].reverse().find((c) => c.day != null && c.wd);
      const cur = cols[i];
      if (!prev?.day || !prev.wd || cur.day == null) continue;
      const step = cur.day - prev.day;
      if (step < 0 || step > 6) continue;
      const expectWd = shiftWeekday(prev.wd, step);
      if (!cur.wd || cur.wd.toLowerCase() !== expectWd.toLowerCase()) {
        cols[i] = { ...cur, wd: expectWd, label: `${expectWd}${cur.day}` };
      }
    }
  }

  const centersOut = cols.map((c) => c.x);
  const headersOut = cols.map((c) =>
    c.day != null && c.wd ? `${c.wd}${c.day}` : c.label
  );
  // Gap fill after label repair (may insert missing weekend columns).
  return fillCalendarDayGaps(centersOut, headersOut);
}

/**
 * When weekday glyphs are unreadable, recover columns from a row of day numbers.
 */
export function collectDayColumnsFromDayNumbers(
  lines: OcrLine[],
  pageWidth: number,
  nameMaxX: number
): DayColumns {
  const empty: DayColumns = { centers: [], headers: [], bandY: 0 };
  const nums = lines.filter(
    (l) => xCenter(l) >= nameMaxX * 0.55 && looksLikeDayNumber(l.text)
  );
  if (nums.length < 8) return empty;

  // Skew-aware: cluster by residual from a seed slope fit on day numbers.
  const seedSlope = fitHeaderSlope(nums);
  const x0 = xCenter(nums[0]!);
  const y0 = yCenter(nums[0]!);
  const residual = (l: OcrLine) => yCenter(l) - (y0 + seedSlope * (xCenter(l) - x0));
  const residuals = nums.map(residual).sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < residuals.length; i++) gaps.push(residuals[i]! - residuals[i - 1]!);
  const bandGap = Math.max(10, median(gaps.filter((g) => g > 0 && g < 60)) || 14);
  const skewPad = Math.max(16, pageWidth * 0.014);
  const yBands = clusterSorted(
    nums.map((l) => ({ v: residual(l), item: l })),
    Math.max(bandGap * 1.15, skewPad)
  );
  // Prefer the band with the most unique calendar days (header strip).
  let best = yBands[0] || [];
  let bestScore = -1;
  for (const g of yBands) {
    const uniq = new Set(g.map((l) => Number(cleanCell(l.text))));
    const score = uniq.size * 10 + g.length;
    if (score > bestScore) {
      bestScore = score;
      best = g;
    }
  }
  const uniqDays = new Set(best.map((l) => Number(cleanCell(l.text))));
  if (uniqDays.size < 8) return empty;

  const bandY = best.reduce((s, l) => s + yCenter(l), 0) / Math.max(1, best.length);

  const sorted = best
    .slice()
    .sort((a, b) => xCenter(a) - xCenter(b) || Number(cleanCell(a.text)) - Number(cleanCell(b.text)));
  const colGap = Math.max(8, pageWidth / 40);
  const groups: OcrLine[][] = [];
  for (const l of sorted) {
    const last = groups[groups.length - 1];
    const day = Number(cleanCell(l.text));
    if (
      last &&
      xCenter(l) - xCenter(last[last.length - 1]) <= colGap &&
      Number(cleanCell(last[0].text)) === day
    ) {
      last.push(l);
    } else if (last && xCenter(l) - xCenter(last[last.length - 1]) <= colGap * 0.45) {
      // same column, prefer keeping first
      continue;
    } else {
      groups.push([l]);
    }
  }

  // Deduplicate by day number keeping left-to-right first occurrence of each day in order
  const seen = new Set<number>();
  const cols: { x: number; day: number }[] = [];
  for (const g of groups) {
    const day = Number(cleanCell(g[0].text));
    if (seen.has(day)) continue;
    // Prefer ascending calendar order; allow OCR reorder noise
    seen.add(day);
    cols.push({
      x: g.reduce((s, l) => s + xCenter(l), 0) / g.length,
      day,
    });
  }
  cols.sort((a, b) => a.x - b.x);
  if (cols.length < 8) return empty;

  const cal = detectMonthYearFromOcr(lines);
  const centers = cols.map((c) => c.x);
  const headers = cols.map((c) => {
    if (cal) {
      const wd = germanWeekdayForDate(cal.year, cal.month, c.day);
      return `${wd}${c.day}`;
    }
    return String(c.day);
  });
  const labeled = enforceCalendarColumnLabels(centers, headers, cal);
  const deduped = dedupeDayColumns(labeled.centers, labeled.headers);
  return { ...deduped, bandY };
}

/**
 * Left edge of the day grid = just left of the leftmost day-header token.
 * On heavily skewed photos the leftmost header dips into the name column —
 * use a robust low percentile instead of the absolute min.
 */
export function inferNameMaxX(lines: OcrLine[], pageWidth: number): number {
  const fallback = pageWidth * 0.22;
  const dayHeaders = lines.filter(
    (l) =>
      looksLikeDayHeader(l.text) ||
      looksLikeWeekdayOnly(l.text) ||
      looksLikeDayNumber(l.text)
  );
  if (dayHeaders.length >= 2) {
    const pageH = Math.max(...lines.map((l) => l.boundingBox.y + l.boundingBox.height), 1);
    const top = dayHeaders.filter((l) => yCenter(l) < pageH * 0.35);
    const seed = top.length >= 5 ? top : dayHeaders;
    const slope = fitHeaderSlope(seed.length >= 3 ? seed : dayHeaders);
    const ySpanSeed =
      Math.max(...seed.map((l) => yCenter(l))) - Math.min(...seed.map((l) => yCenter(l)));
    const steep = Math.abs(slope) > 0.08 && ySpanSeed > pageWidth * 0.1;
    // Steep diagonal: top-third alone is only the right end of the strip — use all headers.
    const use = steep ? dayHeaders : seed;
    const xs = use.map((l) => l.boundingBox.x).sort((a, b) => a - b);
    const idx = steep
      ? Math.min(xs.length - 1, Math.max(0, Math.floor(xs.length * 0.2)))
      : 0;
    const left = xs[idx]!;
    const cap = steep ? pageWidth * 0.38 : pageWidth * 0.32;
    return Math.max(pageWidth * 0.08, Math.min(left - 8, cap));
  }
  return fallback;
}
