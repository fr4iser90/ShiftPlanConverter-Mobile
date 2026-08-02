/**
 * Generic date × duty-column board (OCR).
 *
 * Engine: dates as rows, labeled columns across, person names in cells.
 * Column ids / match strings / short labels come from pack `parsers/ocr.json`
 * → `dateDuty` — never hardcode employer duty names here.
 */
import type { PackDateDutyConfig, PackDateDutyColumn } from '@/src/packs/types';
import { isPlausiblePersonName } from '../../names';
import type { OcrLine } from '../../recognize';
import { looksLikeDateDutyAxes, measureAxisCues } from '../axisCues';
import { detectMonthYearFromOcr } from '../month-matrix/dayHeaders';
import {
  cleanCell,
  looksLikeWeekdayOnly,
  xCenter,
  yCenter,
} from '../month-matrix/geometry';
import type { MonthMatrixGrid, MatrixRow } from '../month-matrix/types';

/** Same tolerance as axisCues — trailing `,` / `.` / glued weekday from ML Kit. */
const DATE_LINE_RE =
  /^(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\s*[,.]?\s*(Mo|Di|Mi|Do|Fr|Sa|So)?\.?\s*[,.]?$/i;

/** Leading honorific / role tokens ML Kit often emits as separate boxes. */
const TITLE_TOKEN_RE =
  /^(?:OÄ|OA|FA|CA|FOA|AA|Prof\.?|Dr\.?|Frau|Herr|Hr\.?|Fr\.?)$/i;

/** Strip OCR junk / confusable accents so "|OA" / "OẢ" still count as titles. */
function normalizeTitleToken(text: string): string {
  let t = String(text || '')
    .replace(/^[^A-Za-zÄÖÜäöüß]+/, '')
    .replace(/[^A-Za-zÄÖÜäöüß.]+$/, '')
    .trim();
  // ML Kit often reads OÄ/OA as OẢ / OÀ / ÓA
  if (/^O[ẢÀÁÂÃÅĀĄ]/i.test(t) && t.length <= 3) t = `OA${t.slice(2)}`;
  return t;
}

type GeomTok = {
  text: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  xc: number;
  yc: number;
};

function lineToTok(l: OcrLine): GeomTok | null {
  const text = cleanCell(l.text);
  if (!text) return null;
  const box = l.boundingBox;
  if (!box) return null;
  const x0 = box.x;
  const x1 = box.x + box.width;
  const y0 = box.y;
  const y1 = box.y + box.height;
  return {
    text,
    x0,
    x1,
    y0,
    y1,
    xc: (x0 + x1) / 2,
    yc: (y0 + y1) / 2,
  };
}

/**
 * Cluster tokens into horizontal rows first (by y), then merge left→right.
 * Global y-then-x sort interleaves neighboring columns when glyph yc drifts
 * by a few px — that splits "OA|Dr.|Zeuner" and glues across duty cells.
 */
function clusterRows(toks: GeomTok[], maxDyPx: number): GeomTok[][] {
  if (!toks.length) return [];
  const sorted = [...toks].sort((a, b) => a.yc - b.yc || a.x0 - b.x0);
  const rows: GeomTok[][] = [];
  let cur: GeomTok[] = [sorted[0]!];
  let rowY = sorted[0]!.yc;
  for (let i = 1; i < sorted.length; i++) {
    const t = sorted[i]!;
    if (Math.abs(t.yc - rowY) <= maxDyPx) {
      cur.push(t);
      rowY = (rowY * (cur.length - 1) + t.yc) / cur.length;
    } else {
      rows.push(cur);
      cur = [t];
      rowY = t.yc;
    }
  }
  rows.push(cur);
  return rows;
}

/** Merge left-to-right tokens within each y-row (small x-gap). */
function mergeRowPhrases(
  toks: GeomTok[],
  maxGapPx: number,
  maxDyPx: number
): GeomTok[] {
  if (!toks.length) return [];
  const out: GeomTok[] = [];
  for (const row of clusterRows(toks, maxDyPx)) {
    const sorted = [...row].sort((a, b) => a.x0 - b.x0);
    let cur = { ...sorted[0]! };
    for (let i = 1; i < sorted.length; i++) {
      const t = sorted[i]!;
      const gap = t.x0 - cur.x1;
      if (gap >= -4 && gap <= maxGapPx) {
        const x0 = Math.min(cur.x0, t.x0);
        const x1 = Math.max(cur.x1, t.x1);
        const y0 = Math.min(cur.y0, t.y0);
        const y1 = Math.max(cur.y1, t.y1);
        cur = {
          text: `${cur.text} ${t.text}`.replace(/\s+/g, ' ').trim(),
          x0,
          x1,
          y0,
          y1,
          xc: (x0 + x1) / 2,
          yc: (y0 + y1) / 2,
        };
      } else {
        out.push(cur);
        cur = { ...t };
      }
    }
    out.push(cur);
  }
  return out;
}

/**
 * Person cells: ML Kit often splits "OA Dr. Zeuner" into separate boxes.
 * Merge by geometry (same row, small x-gap). Prefer title→surname runs when
 * a bare proximity merge would glue two neighboring duty cells.
 */
export function mergePersonPhrases(
  toks: GeomTok[],
  roleSuffixes?: string[] | null,
  maxGapPx = 28,
  maxDyPx = 12
): GeomTok[] {
  const isTitle = (text: string) => {
    const norm = normalizeTitleToken(text);
    if (TITLE_TOKEN_RE.test(norm)) return true;
    return (roleSuffixes || []).some(
      (r) => String(r || '').trim().toLowerCase() === norm.toLowerCase()
    );
  };
  // First: tight proximity merge (OA|Dr.|Zeuner).
  const prox = mergeRowPhrases(toks, maxGapPx, maxDyPx);
  // Drop title-only crumbs; keep plausible names (and title+surname).
  const out: GeomTok[] = [];
  for (const p of prox) {
    const parts = p.text.split(/\s+/).filter(Boolean);
    if (!parts.length) continue;
    if (parts.every(isTitle)) continue;
    out.push(p);
  }
  return out;
}

export type DateDutyAssignment = {
  day: number;
  month: number;
  year: number;
  dutyId: string;
  personLabel: string;
  yCenter: number;
  xCenter: number;
};

export type DateDutyRowGeo = {
  day: number;
  month: number;
  year: number;
  yCenter: number;
};

export type DateDutyBuild = {
  ok: boolean;
  reason?: string;
  month: number;
  year: number;
  duties: { id: string; label: string; short: string; xCenter: number }[];
  assignments: DateDutyAssignment[];
  /** Unique date rows (sorted by y), for overlays. */
  dateRows: DateDutyRowGeo[];
  dateColRight: number;
  headerBandTop: number;
  headerBandBot: number;
  contentLeft: number;
  contentRight: number;
  contentTop: number;
  contentBottom: number;
  pageWidth: number;
  pageHeight: number;
};

function emptyBuild(reason: string, partial?: Partial<DateDutyBuild>): DateDutyBuild {
  return {
    ok: false,
    reason,
    month: 0,
    year: 0,
    duties: [],
    assignments: [],
    dateRows: [],
    dateColRight: 0,
    headerBandTop: 0,
    headerBandBot: 0,
    contentLeft: 0,
    contentRight: 0,
    contentTop: 0,
    contentBottom: 0,
    pageWidth: 0,
    pageHeight: 0,
    ...partial,
  };
}

function normKey(s: string): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Digit-only needles must be exact / trailing tokens — not "2" inside "schmerz2". */
function needleHits(normalizedHeader: string, needle: string): boolean {
  if (!needle) return false;
  if (/^\d+$/.test(needle)) {
    return (
      normalizedHeader === needle ||
      new RegExp(`(?:^|\\s)${escapeRe(needle)}$`).test(normalizedHeader)
    );
  }
  return normalizedHeader.includes(needle);
}

function columnMatch(normalizedHeader: string, col: PackDateDutyColumn): boolean {
  const needles = (col.match || []).map(normKey).filter(Boolean);
  if (!needles.length || !normalizedHeader) return false;
  if (col.matchAll) return needles.every((n) => needleHits(normalizedHeader, n));
  return needles.some((n) => needleHits(normalizedHeader, n));
}

/**
 * How tightly a header phrase matches a pack column (0..1).
 * Prefers short OCR titles over mega-glued header strips.
 */
function headerMatchQuality(normalizedHeader: string, col: PackDateDutyColumn): number {
  const needles = (col.match || []).map(normKey).filter(Boolean);
  if (!needles.length || !normalizedHeader) return 0;
  if (col.matchAll) {
    if (!needles.every((n) => needleHits(normalizedHeader, n))) return 0;
    const cov =
      needles.reduce((a, n) => a + n.length, 0) / Math.max(1, normalizedHeader.length);
    return Math.min(1, cov);
  }
  let best = 0;
  for (const n of needles) {
    if (!needleHits(normalizedHeader, n)) continue;
    best = Math.max(best, n.length / Math.max(1, normalizedHeader.length));
  }
  return best;
}

/** Map header OCR text → pack column (best coverage, not pack-order first hit). */
export function classifyDutyHeader(
  raw: string,
  columns: PackDateDutyColumn[] | null | undefined
): PackDateDutyColumn | null {
  if (!columns?.length) return null;
  const s = normKey(raw);
  if (!s || s.length > 48) return null;
  let best: PackDateDutyColumn | null = null;
  let bestQ = 0;
  for (const col of columns) {
    const q = headerMatchQuality(s, col);
    if (q > bestQ) {
      bestQ = q;
      best = col;
    }
  }
  return bestQ > 0 ? best : null;
}

export function cleanPersonCell(
  raw: string,
  roleSuffixes?: string[] | null
): string {
  let t = cleanCell(raw).replace(/\s+/g, ' ').trim();
  // Board OCR glues date-gutter crumbs / pipes onto the first duty cell.
  t = t.replace(/^[\|\[\(\/{<•·.]+/, '').trim();
  t = t
    .replace(/^(?:\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?\s*[,.]?\s*)+/i, '')
    .trim();
  t = t.replace(/^(?:Mo|Di|Mi|Do|Fr|Sa|So)\.?\s+/i, '').trim();
  t = t.replace(/\bO[ẢÀÁÂÃÅĀĄ]\b/gi, 'OA');
  const suffixes = (roleSuffixes || []).map((s) => String(s || '').trim()).filter(Boolean);
  if (suffixes.length) {
    const re = new RegExp(`\\b(?:${suffixes.map(escapeRe).join('|')})\\s*$`, 'i');
    t = t.replace(re, '').replace(/\s+/g, ' ').trim();
  }
  return t;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseDateToken(
  text: string
): { day: number; month: number; yearHint: number | null; weekday: string | null } | null {
  const m = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .match(DATE_LINE_RE);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  if (!(day >= 1 && day <= 31 && month >= 1 && month <= 12)) return null;
  let yearHint: number | null = null;
  if (m[3]) {
    const y = Number(m[3]);
    yearHint = y < 100 ? 2000 + y : y;
  }
  return { day, month, yearHint, weekday: m[4] || null };
}

/**
 * Score 0..1. Without pack `dateDuty.columns` → 0 (layout not configured).
 * Axis cues: left date gutter + pack duty headers in the top band beat month-matrix noise.
 */
export function scoreDateDuty(
  text: string,
  lines: OcrLine[],
  pageWidth: number,
  config?: PackDateDutyConfig | null,
  pageHeight?: number
): number {
  const columns = config?.columns;
  if (!columns?.length) return 0;

  const raw = String(text || '');
  if (!raw.trim() && !lines.length) return 0;

  const cues = measureAxisCues(lines, pageWidth, pageHeight);

  const dateHits = raw.match(/\b\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?\b/g) || [];
  const uniqueDates = new Set(dateHits.map((d) => d.replace(/\s/g, '')));

  let dutyHits = 0;
  for (const col of columns) {
    for (const needle of col.match || []) {
      const n = normKey(needle);
      if (!n) continue;
      if (normKey(raw).includes(n)) dutyHits += 1;
    }
  }

  const dayStrip = (raw.match(/\b(?:Mo|Di|Mi|Do|Fr|Sa|So)\s*\d{1,2}\b/gi) || []).length;
  const commaNames = (raw.match(/[A-ZÄÖÜ][A-Za-zÄÖÜäöüß\-']{2,},\s*[A-ZÄÖÜ]/g) || [])
    .length;

  let dateLines = 0;
  let dutyHeaders = 0;
  let topDutyHeaders = 0;
  if (lines.length && pageWidth > 0) {
    let maxY = 0;
    for (const l of lines) {
      const y1 = l.boundingBox.y + l.boundingBox.height;
      if (y1 > maxY) maxY = y1;
    }
    const h = pageHeight && pageHeight > 0 ? pageHeight : Math.max(maxY, 1);
    const topBand = h * 0.14;
    for (const l of lines) {
      const t = cleanCell(l.text);
      if (!t) continue;
      if (parseDateToken(t)) dateLines += 1;
      if (classifyDutyHeader(t, columns)) {
        dutyHeaders += 1;
        if (yCenter(l) <= topBand) topDutyHeaders += 1;
      }
    }
  }

  const dates = Math.max(uniqueDates.size, dateLines, cues.leftDateRows);
  if (dates < 8 && dutyHits < 2 && dutyHeaders < 2) return 0;

  let score = 0;
  score += Math.min(0.45, dates / 28);
  score += Math.min(0.4, (dutyHits + dutyHeaders) / Math.max(4, columns.length));
  // Geometry: left dates + duty heads in header band are decisive for Anästhesie boards.
  if (cues.leftDateRows >= 8) score += 0.12;
  if (topDutyHeaders >= 2) score += Math.min(0.18, topDutyHeaders * 0.04);
  if (looksLikeDateDutyAxes(cues) && (dutyHeaders >= 2 || dutyHits >= 2)) {
    score += 0.15;
  }

  for (const marker of config?.boardMarkers || []) {
    const m = String(marker || '').trim();
    if (m && new RegExp(m, 'i').test(raw)) {
      score += 0.08;
      break;
    }
  }

  // Month-matrix hallmarks → dampen (do not confuse with person×day).
  if (cues.moDiHeaders >= 10 || dayStrip >= 10) score *= 0.3;
  if (commaNames >= 6 && dates < 10 && cues.leftDateRows < 6) score *= 0.4;

  return Math.max(0, Math.min(1, score));
}

export type DateDutyBuildOpts = {
  dateDuty?: PackDateDutyConfig | null;
  pageHeight?: number;
};

/**
 * Geometry parse: pack duty headers (top) × date rows (left) × name cells.
 */
export function buildDateDutyFromLines(
  lines: OcrLine[],
  pageWidth: number,
  opts: DateDutyBuildOpts = {}
): DateDutyBuild {
  const columns = opts.dateDuty?.columns;
  if (!columns?.length) {
    return emptyBuild('no-pack-dateDuty', { pageWidth });
  }
  if (!lines.length || pageWidth <= 0) {
    return emptyBuild('no-lines', { pageWidth });
  }

  const pageHeightOpt = opts.pageHeight;
  const h =
    pageHeightOpt && pageHeightOpt > 0
      ? pageHeightOpt
      : Math.max(...lines.map((l) => (l.boundingBox?.y || 0) + (l.boundingBox?.height || 0)), 1);

  const ym = detectMonthYearFromOcr(lines) || { month: 0, year: 0 };
  let month = ym.month || 0;
  let year = ym.year || 0;

  // Duty titles sit in a thin top strip — do NOT use a deep % band (that eats date rows).
  const headerSearchMaxY = h * 0.22;
  const headerToks: GeomTok[] = [];
  for (const l of lines) {
    if (yCenter(l) > headerSearchMaxY) continue;
    const tok = lineToTok(l);
    if (tok) headerToks.push(tok);
  }
  // Tight gap: duty titles are spaced; a wide gap would glue "Hausdienst"+"HD Nacht".
  const headerPhrases = [
    ...headerToks,
    ...mergeRowPhrases(
      headerToks,
      Math.min(20, Math.max(10, pageWidth * 0.01)),
      14
    ),
  ];
  const dutyMap = new Map<
    string,
    {
      id: string;
      label: string;
      short: string;
      xCenter: number;
      y0: number;
      y1: number;
      quality: number;
    }
  >();
  for (const phrase of headerPhrases) {
    const col = classifyDutyHeader(phrase.text, columns);
    if (!col) continue;
    const short = String(col.short || col.id).trim() || col.id;
    const quality = headerMatchQuality(normKey(phrase.text), col);
    const prev = dutyMap.get(col.id);
    // Prefer tight titles ("Prämedikation") over glued strips that still match.
    const better =
      !prev ||
      quality > prev.quality + 0.02 ||
      (Math.abs(quality - prev.quality) <= 0.02 &&
        phrase.text.length < prev.label.length);
    if (better) {
      dutyMap.set(col.id, {
        id: col.id,
        label: phrase.text,
        short,
        xCenter: phrase.xc,
        y0: phrase.y0,
        y1: phrase.y1,
        quality,
      });
    }
  }
  const dutiesRaw = [...dutyMap.values()].sort((a, b) => a.xCenter - b.xCenter);
  const duties = dutiesRaw.map(({ id, label, short, xCenter: xc }) => ({
    id,
    label,
    short,
    xCenter: xc,
  }));
  if (duties.length < 2) {
    return emptyBuild('few-duty-headers', {
      month,
      year,
      duties,
      pageWidth,
      pageHeight: h,
    });
  }

  const firstDutyLeft = Math.min(...duties.map((d) => d.xCenter));
  const dateRowsRaw: DateDutyRowGeo[] = [];
  let dateColLeft = pageWidth;
  let dateColRightFromDates = 0;
  // Date gutter is left of the first duty column — ignore footer stamps (e.g. 08.07.2026).
  const dateGutterMaxX = Math.min(firstDutyLeft - 2, pageWidth * 0.28);
  const dateGutterMaxY = h * 0.96;
  for (const l of lines) {
    const t = cleanCell(l.text);
    const d = parseDateToken(t);
    if (!d) continue;
    const box = l.boundingBox;
    const xc = xCenter(l);
    const yc = yCenter(l);
    if (xc > dateGutterMaxX) continue;
    if (yc > dateGutterMaxY) continue;
    if (!month && d.month) month = d.month;
    if (!year && d.yearHint) year = d.yearHint;
    const useMonth = d.month || month || 1;
    const useYear = d.yearHint || year || new Date().getFullYear();
    if (box) {
      dateColLeft = Math.min(dateColLeft, box.x);
      dateColRightFromDates = Math.max(dateColRightFromDates, box.x + box.width);
    }
    dateRowsRaw.push({
      day: d.day,
      month: useMonth,
      year: useYear,
      yCenter: yc,
    });
  }
  dateRowsRaw.sort((a, b) => a.yCenter - b.yCenter);
  const byDay = new Map<number, DateDutyRowGeo>();
  for (const r of dateRowsRaw) {
    if (!byDay.has(r.day)) byDay.set(r.day, r);
  }
  let rows = [...byDay.values()].sort((a, b) => a.yCenter - b.yCenter);
  rows = fillDateRowGaps(rows, h);
  if (rows.length < 5) {
    return emptyBuild('few-date-rows', {
      month,
      year,
      duties,
      dateRows: rows,
      pageWidth,
      pageHeight: h,
    });
  }

  // Date gutter right edge = OCR date glyphs; never invent a fixed pixel width.
  const dateColRight =
    dateColRightFromDates > 0
      ? Math.min(firstDutyLeft - 4, dateColRightFromDates + pageWidth * 0.01)
      : firstDutyLeft - pageWidth * 0.02;
  const roleSuffixes = opts.dateDuty?.roleSuffixes;
  const headerBandBotEarly = Math.max(...dutiesRaw.map((d) => d.y1));
  // Cells start below the printed duty header strip (OCR y), not a page-fraction guess.
  const contentMinY = headerBandBotEarly + Math.max(4, h * 0.004);

  const cellToks: GeomTok[] = [];
  for (const l of lines) {
    const yc = yCenter(l);
    const xc = xCenter(l);
    if (yc < contentMinY) continue;
    if (xc < dateColRight * 0.9) continue;
    const tok = lineToTok(l);
    if (!tok) continue;
    if (parseDateToken(tok.text)) continue;
    // Bare weekday boxes sit between date gutter and HD — must not glue onto names.
    if (looksLikeWeekdayOnly(tok.text)) continue;
    if (classifyDutyHeader(tok.text, columns)) continue;
    cellToks.push(tok);
  }
  // Cap gap vs page width: at 3000px, 2%≈60px still ok for title fragments,
  // but keep an absolute ceiling so neighboring duty cells never merge.
  const personPhrases = mergePersonPhrases(
    cellToks,
    roleSuffixes,
    Math.min(48, Math.max(22, pageWidth * 0.014)),
    Math.max(10, h * 0.012)
  );

  const assignments: DateDutyAssignment[] = [];
  const rowPitch =
    rows.length >= 2
      ? Math.abs(rows[1]!.yCenter - rows[0]!.yCenter)
      : h * 0.03;
  const colPitch =
    duties.length >= 2
      ? Math.abs(duties[1]!.xCenter - duties[0]!.xCenter)
      : pageWidth * 0.1;

  for (const phrase of personPhrases) {
    const person = cleanPersonCell(phrase.text, roleSuffixes);
    if (!person || person.length < 3) continue;
    if (classifyDutyHeader(person, columns)) continue;
    if (parseDateToken(person)) continue;
    if (!isPlausiblePersonName(person)) continue;

    let bestRow = rows[0]!;
    let bestDy = Math.abs(phrase.yc - bestRow.yCenter);
    for (const r of rows) {
      const dy = Math.abs(phrase.yc - r.yCenter);
      if (dy < bestDy) {
        bestDy = dy;
        bestRow = r;
      }
    }
    // Loose enough for skewed photos / interpolated bottom date bands.
    if (bestDy > Math.max(rowPitch * 1.05, h * 0.035)) continue;

    let bestDuty = duties[0]!;
    let bestDx = Math.abs(phrase.xc - bestDuty.xCenter);
    for (const d of duties) {
      const dx = Math.abs(phrase.xc - d.xCenter);
      if (dx < bestDx) {
        bestDx = dx;
        bestDuty = d;
      }
    }
    if (bestDx > Math.max(colPitch * 0.9, pageWidth * 0.085)) continue;

    assignments.push({
      day: bestRow.day,
      month: bestRow.month || month,
      year: bestRow.year || year,
      dutyId: bestDuty.id,
      personLabel: person,
      yCenter: phrase.yc,
      xCenter: phrase.xc,
    });
  }

  // Use median duty-header band (ignore outlier matches from page title etc.).
  const dutyYs = [...dutiesRaw].map((d) => (d.y0 + d.y1) / 2).sort((a, b) => a - b);
  const midY = dutyYs[Math.floor(dutyYs.length / 2)]!;
  const headerCluster = dutiesRaw.filter(
    (d) => Math.abs((d.y0 + d.y1) / 2 - midY) <= Math.max(28, h * 0.04)
  );
  const bandSrc = headerCluster.length ? headerCluster : dutiesRaw;
  const headerBandTop = Math.min(...bandSrc.map((d) => d.y0));
  const headerBandBot = Math.max(...bandSrc.map((d) => d.y1));
  const contentLeft = Math.max(0, Number.isFinite(dateColLeft) ? dateColLeft - 4 : 0);
  const contentRight = Math.min(
    pageWidth,
    Math.max(...duties.map((d) => d.xCenter)) + colPitch * 0.55
  );
  const contentTop = Math.max(0, headerBandTop - 4);
  const contentBottom = Math.min(
    h,
    (rows[rows.length - 1]?.yCenter || h) + rowPitch * 0.55
  );

  const ok = assignments.length >= 3 && rows.length >= 5 && duties.length >= 2;
  return {
    ok,
    reason: ok ? undefined : 'few-assignments',
    month: month || rows[0]?.month || 0,
    year: year || rows[0]?.year || 0,
    duties,
    assignments,
    dateRows: rows,
    dateColRight: Math.max(contentLeft + 24, dateColRight),
    headerBandTop,
    headerBandBot,
    contentLeft,
    contentRight,
    contentTop,
    contentBottom,
    pageWidth,
    pageHeight: h,
  };
}

function dutyDayFrames(
  duties: DateDutyBuild['duties'],
  dateColRight: number,
  contentRight: number
): { dayIndex: number; label: string; x0: number; x1: number }[] {
  return duties.map((d, i) => {
    const prev = duties[i - 1];
    const next = duties[i + 1];
    const x0 = prev ? (prev.xCenter + d.xCenter) / 2 : dateColRight;
    const x1 = next ? (d.xCenter + next.xCenter) / 2 : contentRight;
    return {
      dayIndex: i,
      label: d.short || d.id,
      x0: Math.min(x0, d.xCenter - 4),
      x1: Math.max(x1, d.xCenter + 4),
    };
  });
}

/**
 * Fill missing calendar days between first/last OCR dates (and extend toward
 * month end when the bottom of the page still has room). Needed when ML Kit
 * drops the lower date gutter.
 */
function fillDateRowGaps(rows: DateDutyRowGeo[], pageHeight: number): DateDutyRowGeo[] {
  if (rows.length < 3) return rows;
  const byY = [...rows].sort((a, b) => a.yCenter - b.yCenter);
  const pitches: number[] = [];
  for (let i = 1; i < byY.length; i++) {
    const dy = byY[i]!.yCenter - byY[i - 1]!.yCenter;
    const dd = byY[i]!.day - byY[i - 1]!.day;
    if (dd === 1 && dy > 6 && dy < pageHeight * 0.08) pitches.push(dy);
  }
  pitches.sort((a, b) => a - b);
  const pitch =
    pitches.length > 0
      ? pitches[Math.floor(pitches.length / 2)]!
      : byY.length >= 2
        ? Math.abs(byY[byY.length - 1]!.yCenter - byY[0]!.yCenter) /
          Math.max(1, byY[byY.length - 1]!.day - byY[0]!.day)
        : pageHeight * 0.028;
  if (!(pitch > 4)) return rows;

  const byDay = new Map<number, DateDutyRowGeo>();
  for (const r of byY) byDay.set(r.day, r);

  const minDay = Math.min(...byY.map((r) => r.day));
  const maxDay = Math.max(...byY.map((r) => r.day));
  const proto = byY[0]!;

  for (let d = minDay; d <= maxDay; d++) {
    if (byDay.has(d)) continue;
    let prev: DateDutyRowGeo | null = null;
    let next: DateDutyRowGeo | null = null;
    for (let p = d - 1; p >= minDay; p--) {
      if (byDay.has(p)) {
        prev = byDay.get(p)!;
        break;
      }
    }
    for (let n = d + 1; n <= maxDay; n++) {
      if (byDay.has(n)) {
        next = byDay.get(n)!;
        break;
      }
    }
    let y: number;
    if (prev && next && next.day !== prev.day) {
      const t = (d - prev.day) / (next.day - prev.day);
      y = prev.yCenter + t * (next.yCenter - prev.yCenter);
    } else if (prev) {
      y = prev.yCenter + pitch * (d - prev.day);
    } else if (next) {
      y = next.yCenter - pitch * (next.day - d);
    } else {
      continue;
    }
    byDay.set(d, {
      day: d,
      month: proto.month,
      year: proto.year,
      yCenter: y,
    });
  }

  // Extend toward month end if the page still has vertical room (dropped OCR footer dates).
  let last = byDay.get(Math.max(...byDay.keys()))!;
  for (let d = last.day + 1; d <= 31; d++) {
    const y = last.yCenter + pitch * (d - last.day);
    if (y > pageHeight * 0.97) break;
    byDay.set(d, {
      day: d,
      month: last.month,
      year: last.year,
      yCenter: y,
    });
    last = byDay.get(d)!;
  }

  return [...byDay.values()].sort((a, b) => a.yCenter - b.yCenter);
}

function dateRowBands(
  dateRows: DateDutyRowGeo[],
  pageHeight: number
): { day: number; yLo: number; yHi: number; yCenter: number }[] {
  if (!dateRows.length) return [];
  const pitch =
    dateRows.length >= 2
      ? Math.abs(dateRows[1]!.yCenter - dateRows[0]!.yCenter)
      : Math.max(18, pageHeight * 0.028);
  return dateRows.map((r, i) => {
    const prev = dateRows[i - 1];
    const next = dateRows[i + 1];
    const yLo = prev ? (prev.yCenter + r.yCenter) / 2 : r.yCenter - pitch * 0.5;
    const yHi = next ? (r.yCenter + next.yCenter) / 2 : r.yCenter + pitch * 0.5;
    return { day: r.day, yLo, yHi, yCenter: r.yCenter };
  });
}

/** Project assignments → person × day grid (cells = pack short labels). */
export function dateDutyToPersonDayGrid(built: DateDutyBuild): MonthMatrixGrid {
  if (!built.ok) {
    return { headers: [], rows: [], ok: false, reason: built.reason || 'date-duty-failed' };
  }

  const shortById = new Map(built.duties.map((d) => [d.id, d.short || d.id]));
  // Full calendar from date gutter (not only days that already have a name) so the
  // review table is not a sparse stub with empty middle columns.
  const days = [
    ...new Set([
      ...built.dateRows.map((r) => r.day),
      ...built.assignments.map((a) => a.day),
    ]),
  ].sort((a, b) => a - b);
  if (days.length < 3) {
    return { headers: [], rows: [], ok: false, reason: 'few-days' };
  }
  const headers = days.map(String);
  const dayIndex = new Map(days.map((d, i) => [d, i]));

  const byPerson = new Map<string, { label: string; cells: string[]; y: number }>();
  for (const a of built.assignments) {
    const key = normKey(a.personLabel);
    if (!key) continue;
    let row = byPerson.get(key);
    if (!row) {
      row = {
        label: a.personLabel,
        cells: headers.map(() => ''),
        y: a.yCenter,
      };
      byPerson.set(key, row);
    }
    const idx = dayIndex.get(a.day);
    if (idx == null) continue;
    const short = shortById.get(a.dutyId) || a.dutyId;
    const prev = row.cells[idx] || '';
    row.cells[idx] = prev && prev !== short ? `${prev}+${short}` : short;
    row.y = (row.y + a.yCenter) / 2;
  }

  const matrixRows: MatrixRow[] = [...byPerson.values()]
    .sort((a, b) => a.y - b.y)
    .map((r) => ({
      name: r.label,
      cells: r.cells,
      yCenter: r.y,
    }));

  const filled = matrixRows.reduce(
    (n, r) => n + r.cells.filter((c) => String(c || '').trim()).length,
    0
  );

  const pageW = built.pageWidth || 1000;
  const pageH = built.pageHeight || 1000;
  const dateColRight = built.dateColRight || pageW * 0.18;
  const contentRight = built.contentRight || pageW * 0.98;
  const dayFrames = dutyDayFrames(built.duties, dateColRight, contentRight);
  const bands = dateRowBands(built.dateRows, pageH);
  const rowPitch =
    bands.length >= 2 ? Math.abs(bands[1]!.yCenter - bands[0]!.yCenter) : pageH * 0.03;

  return {
    headers,
    rows: matrixRows,
    ok: matrixRows.length >= 1 && filled >= 3,
    reason: matrixRows.length ? undefined : 'no-people',
    overlayLayout: 'date-duty',
    // Duty columns (not calendar days) — overlays use these with overlayLayout.
    colCenters: built.duties.map((d) => d.xCenter),
    dayFrames,
    nameMaxX: dateColRight,
    headerBandTop: built.headerBandTop,
    headerBandBot: built.headerBandBot,
    headerBandY: (built.headerBandTop + built.headerBandBot) / 2,
    headerFrame: {
      y0: built.headerBandTop,
      y1: built.headerBandBot,
    },
    contentLeft: built.contentLeft,
    contentRight,
    contentTop: built.contentTop,
    contentBottom: built.contentBottom,
    rowYPad: rowPitch * 0.5,
    dateDutyRows: bands,
    dateDutyAssignments: built.assignments.map((a) => ({
      day: a.day,
      dutyId: a.dutyId,
      personLabel: a.personLabel,
      xCenter: a.xCenter,
      yCenter: a.yCenter,
    })),
    rosterMonth: built.month || undefined,
    rosterYear: built.year || undefined,
  };
}
