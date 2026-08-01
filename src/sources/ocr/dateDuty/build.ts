/**
 * Generic date × duty-column board (OCR).
 *
 * Engine: dates as rows, labeled columns across, person names in cells.
 * Column ids / match strings / short labels come from pack `parsers/ocr.json`
 * → `dateDuty` — never hardcode employer duty names here.
 */
import type { PackDateDutyConfig, PackDateDutyColumn } from '@/src/packs/types';
import type { MonthMatrixGrid, MatrixRow } from '../monthMatrix/types';
import { detectMonthYearFromOcr } from '../monthMatrix/dayHeaders';
import { cleanCell, xCenter, yCenter } from '../monthMatrix/geometry';
import { isPlausiblePersonName } from '../names';
import type { OcrLine } from '../recognize';

const DATE_LINE_RE =
  /^(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\s*\.?\s*(Mo|Di|Mi|Do|Fr|Sa|So)?\b/i;

export type DateDutyAssignment = {
  day: number;
  month: number;
  year: number;
  dutyId: string;
  personLabel: string;
  yCenter: number;
  xCenter: number;
};

export type DateDutyBuild = {
  ok: boolean;
  reason?: string;
  month: number;
  year: number;
  duties: { id: string; label: string; short: string; xCenter: number }[];
  assignments: DateDutyAssignment[];
};

function normKey(s: string): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function columnMatch(normalizedHeader: string, col: PackDateDutyColumn): boolean {
  const needles = (col.match || []).map(normKey).filter(Boolean);
  if (!needles.length || !normalizedHeader) return false;
  if (col.matchAll) return needles.every((n) => normalizedHeader.includes(n));
  return needles.some((n) => normalizedHeader.includes(n));
}

/** Map header OCR text → pack column id (first match in pack order). */
export function classifyDutyHeader(
  raw: string,
  columns: PackDateDutyColumn[] | null | undefined
): PackDateDutyColumn | null {
  if (!columns?.length) return null;
  const s = normKey(raw);
  if (!s || s.length > 48) return null;
  for (const col of columns) {
    if (columnMatch(s, col)) return col;
  }
  return null;
}

export function cleanPersonCell(
  raw: string,
  roleSuffixes?: string[] | null
): string {
  let t = cleanCell(raw).replace(/\s+/g, ' ').trim();
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
 */
export function scoreDateDuty(
  text: string,
  lines: OcrLine[],
  pageWidth: number,
  config?: PackDateDutyConfig | null
): number {
  const columns = config?.columns;
  if (!columns?.length) return 0;

  const raw = String(text || '');
  if (!raw.trim() && !lines.length) return 0;

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
  if (lines.length && pageWidth > 0) {
    for (const l of lines) {
      const t = cleanCell(l.text);
      if (parseDateToken(t)) dateLines += 1;
      if (classifyDutyHeader(t, columns)) dutyHeaders += 1;
    }
  }

  const dates = Math.max(uniqueDates.size, dateLines);
  if (dates < 8 && dutyHits < 2 && dutyHeaders < 2) return 0;

  let score = 0;
  score += Math.min(0.45, dates / 28);
  score += Math.min(0.4, (dutyHits + dutyHeaders) / Math.max(4, columns.length));

  for (const marker of config?.boardMarkers || []) {
    const m = String(marker || '').trim();
    if (m && new RegExp(m, 'i').test(raw)) {
      score += 0.06;
      break;
    }
  }

  if (dayStrip >= 10) score *= 0.35;
  if (commaNames >= 6 && dates < 10) score *= 0.4;

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
    return {
      ok: false,
      reason: 'no-pack-dateDuty',
      month: 0,
      year: 0,
      duties: [],
      assignments: [],
    };
  }
  if (!lines.length || pageWidth <= 0) {
    return { ok: false, reason: 'no-lines', month: 0, year: 0, duties: [], assignments: [] };
  }

  const pageHeight = opts.pageHeight;
  const h =
    pageHeight && pageHeight > 0
      ? pageHeight
      : Math.max(...lines.map((l) => (l.boundingBox?.y || 0) + (l.boundingBox?.height || 0)), 1);

  const ym = detectMonthYearFromOcr(lines) || { month: 0, year: 0 };
  let month = ym.month || 0;
  let year = ym.year || 0;

  const headerBand = h * 0.28;
  const dutyMap = new Map<
    string,
    { id: string; label: string; short: string; xCenter: number }
  >();
  for (const l of lines) {
    if (yCenter(l) > headerBand) continue;
    const t = cleanCell(l.text);
    const col = classifyDutyHeader(t, columns);
    if (!col) continue;
    const xc = xCenter(l);
    const prev = dutyMap.get(col.id);
    const short = String(col.short || col.id).trim() || col.id;
    if (!prev || t.length > prev.label.length) {
      dutyMap.set(col.id, { id: col.id, label: t, short, xCenter: xc });
    }
  }
  const duties = [...dutyMap.values()].sort((a, b) => a.xCenter - b.xCenter);
  if (duties.length < 2) {
    return {
      ok: false,
      reason: 'few-duty-headers',
      month,
      year,
      duties,
      assignments: [],
    };
  }

  type DateRow = { day: number; month: number; year: number; yCenter: number };
  const dateRows: DateRow[] = [];
  for (const l of lines) {
    const t = cleanCell(l.text);
    const d = parseDateToken(t);
    if (!d) continue;
    if (!month && d.month) month = d.month;
    if (!year && d.yearHint) year = d.yearHint;
    const useMonth = d.month || month || 1;
    const useYear = d.yearHint || year || new Date().getFullYear();
    dateRows.push({
      day: d.day,
      month: useMonth,
      year: useYear,
      yCenter: yCenter(l),
    });
  }
  dateRows.sort((a, b) => a.yCenter - b.yCenter);
  const byDay = new Map<number, DateRow>();
  for (const r of dateRows) {
    if (!byDay.has(r.day)) byDay.set(r.day, r);
  }
  const rows = [...byDay.values()].sort((a, b) => a.yCenter - b.yCenter);
  if (rows.length < 5) {
    return {
      ok: false,
      reason: 'few-date-rows',
      month,
      year,
      duties,
      assignments: [],
    };
  }

  const nameMaxX = Math.min(...duties.map((d) => d.xCenter)) - pageWidth * 0.02;
  const roleSuffixes = opts.dateDuty?.roleSuffixes;

  const assignments: DateDutyAssignment[] = [];
  for (const l of lines) {
    const xc = xCenter(l);
    const yc = yCenter(l);
    if (yc < headerBand) continue;
    if (xc < nameMaxX * 0.85) continue;
    const person = cleanPersonCell(l.text, roleSuffixes);
    if (!person || person.length < 3) continue;
    if (classifyDutyHeader(person, columns)) continue;
    if (parseDateToken(person)) continue;
    if (!isPlausiblePersonName(person)) continue;

    let bestRow = rows[0]!;
    let bestDy = Math.abs(yc - bestRow.yCenter);
    for (const r of rows) {
      const dy = Math.abs(yc - r.yCenter);
      if (dy < bestDy) {
        bestDy = dy;
        bestRow = r;
      }
    }
    const rowPitch =
      rows.length >= 2
        ? Math.abs(rows[1]!.yCenter - rows[0]!.yCenter)
        : h * 0.03;
    if (bestDy > Math.max(rowPitch * 0.65, h * 0.02)) continue;

    let bestDuty = duties[0]!;
    let bestDx = Math.abs(xc - bestDuty.xCenter);
    for (const d of duties) {
      const dx = Math.abs(xc - d.xCenter);
      if (dx < bestDx) {
        bestDx = dx;
        bestDuty = d;
      }
    }
    const colPitch =
      duties.length >= 2
        ? Math.abs(duties[1]!.xCenter - duties[0]!.xCenter)
        : pageWidth * 0.1;
    if (bestDx > Math.max(colPitch * 0.7, pageWidth * 0.06)) continue;

    assignments.push({
      day: bestRow.day,
      month: bestRow.month || month,
      year: bestRow.year || year,
      dutyId: bestDuty.id,
      personLabel: person,
      yCenter: yc,
      xCenter: xc,
    });
  }

  const ok = assignments.length >= 3 && rows.length >= 5 && duties.length >= 2;
  return {
    ok,
    reason: ok ? undefined : 'few-assignments',
    month: month || rows[0]?.month || 0,
    year: year || rows[0]?.year || 0,
    duties,
    assignments,
  };
}

/** Project assignments → person × day grid (cells = pack short labels). */
export function dateDutyToPersonDayGrid(built: DateDutyBuild): MonthMatrixGrid {
  if (!built.ok) {
    return { headers: [], rows: [], ok: false, reason: built.reason || 'date-duty-failed' };
  }

  const shortById = new Map(built.duties.map((d) => [d.id, d.short || d.id]));
  const days = [...new Set(built.assignments.map((a) => a.day))].sort((a, b) => a - b);
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

  return {
    headers,
    rows: matrixRows,
    ok: matrixRows.length >= 1 && filled >= 3,
    reason: matrixRows.length ? undefined : 'no-people',
    colCenters: days.map((_, i) => 100 + i * 40),
    nameMaxX: 80,
  };
}
