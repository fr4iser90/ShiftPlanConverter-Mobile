/**
 * OCR review grid → ShiftEntry[] for calendar ingest (confirm path only).
 */
import { timeRangeForCode } from '../../codeTimes';
import { resolveDutyCodes, type PackMapping, type ShiftEntry } from '../../types';
import {
  findDateDutyColumnByShort,
  resolveDateDutyColumnTime,
} from '@/src/packs/dateDutyTimes';
import type { PackDateDutyConfig } from '@/src/packs/types';
import type { MonthMatrixGrid } from '@/src/sources/ocr/layouts/month-matrix';
import {
  filterPreferredNameMatches,
  normalizeNameKeyPublic,
} from '@/src/sources/ocr/names';

export type OcrDutyCellPart = {
  short: string;
  start?: string;
  end?: string;
  endNextDay?: boolean;
};

/**
 * Parse `HD`, `HD+RD`, or `HD@11:30-08:30+1`.
 * Do not split the overnight `+1` marker as a duty separator.
 */
export function parseOcrDutyCell(raw: string): OcrDutyCellPart[] {
  const s = String(raw || '').trim();
  if (!s || s === '.' || s === '·' || s === '/' || s === '//') return [];
  const out: OcrDutyCellPart[] = [];
  const re =
    /([A-Za-z][A-Za-z0-9]*)(?:@(\d{2}:\d{2})-(\d{2}:\d{2})(\+1)?)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const short = m[1]!.toUpperCase();
    if (m[2] && m[3]) {
      out.push({
        short,
        start: m[2],
        end: m[3],
        endNextDay: !!m[4] || m[3] < m[2],
      });
    } else {
      out.push({ short });
    }
  }
  return out;
}

export function formatOcrDutyCell(parts: OcrDutyCellPart[]): string {
  if (!parts.length) return '';
  return parts
    .map((p) => {
      if (!p.start || !p.end) return p.short;
      const plus = p.endNextDay || p.end < p.start ? '+1' : '';
      return `${p.short}@${p.start}-${p.end}${plus}`;
    })
    .join('+');
}

function isoDate(year: number, month: number, day: number): string | null {
  if (!year || !month || !day) return null;
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
    return null;
  }
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

function matchedRows(grid: MonthMatrixGrid, matchedName: string) {
  const name = String(matchedName || '').trim();
  if (!name || !grid.rows.length) return [];
  const cands = grid.rows.map((r) => ({
    id: normalizeNameKeyPublic(r.name),
    label: r.name,
    yCenter: r.yCenter,
    height: 0,
  }));
  const keys = new Set(
    filterPreferredNameMatches(name, cands, null, 0.8).map((c) =>
      normalizeNameKeyPublic(c.label)
    )
  );
  if (!keys.size) {
    const k = normalizeNameKeyPublic(name);
    return grid.rows.filter((r) => normalizeNameKeyPublic(r.name) === k);
  }
  return grid.rows.filter((r) => keys.has(normalizeNameKeyPublic(r.name)));
}

/** Merge matched person rows into one cell list (non-empty wins / join uniques). */
function mergedCellsForPerson(grid: MonthMatrixGrid, matchedName: string): string[] {
  const rows = matchedRows(grid, matchedName);
  if (!rows.length) return [];
  const n = grid.headers.length;
  const cells = Array.from({ length: n }, () => '');
  for (const r of rows) {
    for (let i = 0; i < n; i++) {
      const c = String(r.cells[i] || '').trim();
      if (!c) continue;
      const prev = cells[i];
      if (!prev) cells[i] = c;
      else if (prev !== c && !prev.split('+').includes(c) && !c.split('+').includes(prev)) {
        cells[i] = `${prev}+${c}`;
      }
    }
  }
  return cells;
}

function resolvePartTimes(
  part: OcrDutyCellPart,
  date: Date,
  opts: {
    dateDuty?: PackDateDutyConfig | null;
    overlayLayout?: 'date-duty' | null;
    preset?: Record<string, import('../../types').MappingValue> | null;
  }
): { start?: string; end?: string } {
  if (part.start && part.end) {
    return { start: part.start, end: part.end };
  }
  if (opts.overlayLayout === 'date-duty' && opts.dateDuty) {
    const col = findDateDutyColumnByShort(opts.dateDuty, part.short);
    const t = col ? resolveDateDutyColumnTime(col, date) : null;
    if (t) return { start: t.start, end: t.end };
  }
  const tr = timeRangeForCode(part.short, opts.preset || null);
  if (tr) return { start: tr.start, end: tr.end };
  return {};
}

/**
 * Build calendar entries for the matched person from the OCR review grid.
 */
export function monthMatrixToShiftEntries(
  grid: MonthMatrixGrid,
  opts: {
    matchedName: string;
    dateDuty?: PackDateDutyConfig | null;
    mapping?: PackMapping | null;
    presetName?: string | null;
  }
): ShiftEntry[] {
  const name = String(opts.matchedName || '').trim();
  if (!grid.ok || !name) return [];

  const month = grid.rosterMonth;
  const year = grid.rosterYear;
  if (!month || !year) return [];

  const cells = mergedCellsForPerson(grid, name);
  if (!cells.length) return [];

  const preset = resolveDutyCodes(opts.mapping, opts.presetName) || null;

  const entries: ShiftEntry[] = [];
  for (let i = 0; i < grid.headers.length; i++) {
    const day = Number.parseInt(String(grid.headers[i] || '').trim(), 10);
    if (!Number.isFinite(day)) continue;
    const dateStr = isoDate(year, month, day);
    if (!dateStr) continue;
    const dateObj = new Date(year, month - 1, day);
    const parts = parseOcrDutyCell(cells[i] || '');
    for (const part of parts) {
      if (!part.short) continue;
      const times = resolvePartTimes(part, dateObj, {
        dateDuty: opts.dateDuty,
        overlayLayout: grid.overlayLayout === 'date-duty' ? 'date-duty' : null,
        preset,
      });
      const entry: ShiftEntry = {
        type: part.short,
        date: dateStr,
      };
      if (times.start && times.end) {
        entry.start = times.start;
        entry.end = times.end;
      } else {
        entry.allDay = true;
      }
      entries.push(entry);
    }
  }

  entries.sort(
    (a, b) => a.date.localeCompare(b.date) || (a.start || '').localeCompare(b.start || '')
  );
  return entries;
}

/** Patch one cell for all rows matching the preferred name. */
export function patchMonthMatrixCell(
  grid: MonthMatrixGrid,
  matchedName: string,
  dayHeader: string,
  newCell: string
): MonthMatrixGrid {
  const col = grid.headers.findIndex(
    (h) => String(h).trim() === String(dayHeader).trim()
  );
  if (col < 0) return grid;
  const rows = matchedRows(grid, matchedName);
  if (!rows.length) return grid;
  const names = new Set(rows.map((r) => r.name));
  return {
    ...grid,
    rows: grid.rows.map((r) => {
      if (!names.has(r.name)) return r;
      const cells = r.cells.slice();
      cells[col] = newCell;
      return { ...r, cells };
    }),
  };
}
