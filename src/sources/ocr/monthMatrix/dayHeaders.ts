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
    if (raw.length === 1 && WD_STUB[raw.toUpperCase()]) {
      out.push({ text: WD_STUB[raw.toUpperCase()], boundingBox: { ...l.boundingBox } });
      continue;
    }
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

  type Pair = { wi: number; di: number; score: number };
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
      // Reject Sa+"11" when So2 sits just to the right (OCR doubled the 1).
      if (
        /^(Sa|So)$/i.test(cleanCell(a.text)) &&
        digit === '11' &&
        sorted.some(
          (o, oi) =>
            oi !== wi &&
            oi !== di &&
            /^(So2|o2)$/i.test(cleanCell(o.text).replace(/\s+/g, '')) &&
            xCenter(o) > xCenter(b) &&
            xCenter(o) - xCenter(b) < maxDx * 2.5
        )
      ) {
        continue;
      }
      const score = Math.abs(Math.max(dx, 0)) * 3 + dy;
      if (!best || score < best.score) best = { wi, di, score };
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
      out.push({
        text: `${wd}${cleanCell(b.text)}`,
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
 */
export function collectDayColumns(
  lines: OcrLine[],
  pageWidth: number,
  nameMaxX: number
): { centers: number[]; headers: string[] } {
  const weekdays = lines.filter(
    (l) =>
      xCenter(l) >= nameMaxX * 0.85 &&
      (looksLikeDayHeader(l.text) || looksLikeWeekdayOnly(l.text))
  );
  if (weekdays.length < 2) {
    return { centers: [], headers: [] };
  }

  const ys = weekdays.map((l) => yCenter(l)).sort((a, b) => a - b);
  const bandGaps: number[] = [];
  for (let i = 1; i < ys.length; i++) bandGaps.push(ys[i] - ys[i - 1]);
  const bandGap = Math.max(12, median(bandGaps.filter((g) => g > 0 && g < 80)) || 18);
  const yBands = clusterSorted(
    weekdays.map((l) => ({ v: yCenter(l), item: l })),
    bandGap * 1.1
  );
  const headerBand = yBands.reduce((best, g) => (g.length > best.length ? g : best), yBands[0]);
  const bandY =
    headerBand.reduce((s, l) => s + yCenter(l), 0) / Math.max(1, headerBand.length);
  const bandTol = Math.max(14, bandGap * 1.4);

  const inBand = (l: OcrLine) => Math.abs(yCenter(l) - bandY) <= bandTol;
  const headerTokens = lines.filter(
    (l) => xCenter(l) >= nameMaxX * 0.85 && inBand(l) && looksLikeDayHeader(l.text)
  );
  const loneWeekdays = lines.filter(
    (l) => xCenter(l) >= nameMaxX * 0.85 && inBand(l) && looksLikeWeekdayOnly(l.text)
  );
  const orphanDays = lines.filter(
    (l) =>
      xCenter(l) >= nameMaxX &&
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
    return { centers: [], headers: [] };
  }

  const labeledXs = anchors
    .filter((a) => /^(Mo|Di|Mi|Do|Fr|Sa|So)/i.test(a.label))
    .map((a) => a.x);
  const labeledGaps: number[] = [];
  for (let i = 1; i < labeledXs.length; i++) {
    labeledGaps.push(labeledXs[i] - labeledXs[i - 1]);
  }
  const minLabeledGap = Math.min(...labeledGaps.filter((g) => g > 8), pageWidth);
  const colGap = Math.max(10, Math.min(minLabeledGap * 0.55, pageWidth / 22));

  const groups: { x: number; label: string }[][] = [];
  const isWd = (label: string) => /^(Mo|Di|Mi|Do|Fr|Sa|So)/i.test(label);
  for (const a of anchors) {
    const last = groups[groups.length - 1];
    if (
      last &&
      a.x - last[last.length - 1].x <= colGap &&
      !(isWd(last[last.length - 1].label) && isWd(a.label))
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
    return labeled?.label || g[0].label;
  });
  return fillCalendarDayGaps(centers, headers);
}

/**
 * Left edge of the day grid = just left of the leftmost day-header token.
 */
export function inferNameMaxX(lines: OcrLine[], pageWidth: number): number {
  const fallback = pageWidth * 0.22;
  const dayHeaders = lines.filter(
    (l) => looksLikeDayHeader(l.text) || looksLikeWeekdayOnly(l.text)
  );
  if (dayHeaders.length >= 2) {
    const leftmost = Math.min(...dayHeaders.map((l) => l.boundingBox.x));
    return Math.max(pageWidth * 0.08, leftmost - 8);
  }
  return fallback;
}
