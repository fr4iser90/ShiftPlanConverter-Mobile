import { isPlausiblePersonName } from '../names';
import { cleanCell } from './geometry';
import type { MonthMatrixGrid, MonthMatrixMetrics } from './types';

const SHIFT_CODE_RE =
  /^(U|K|N|F|S|ST|FT|MO|OP|OP-N|URLAUB|KRANK|KROAU|FEIERTAG|RU|FK\d?|B\d{1,2}|M\d|F\d|S\d|N\d)$/i;

function isPlausibleClock(hh: number, mm: number): boolean {
  return hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59;
}

/** Prefer a shift code; otherwise one compact time — never a mashed OCR blob. */
export function formatShiftCell(parts: string[]): string {
  if (!parts.length) return '';
  const codes = parts.filter((t) => SHIFT_CODE_RE.test(t));
  if (codes.length) {
    const c = codes[0].toUpperCase();
    if (/^URLAUB$/i.test(c)) return 'U';
    if (/^KRANK$/i.test(c)) return 'K';
    if (/^FEIERTAG$/i.test(c)) return 'FT';
    return c;
  }

  const cleaned = parts
    .map(cleanCell)
    .filter(Boolean)
    .filter((t) => !/^[#|\\/]+$/.test(t))
    .filter((t) => !/^\d{1,2}#$/.test(t))
    // Lone slash / off-day marker
    .map((t) => (t === '/' || t === '\\' ? '' : t))
    .filter(Boolean);
  if (!cleaned.length) return '';

  const joined = cleaned.join(' ').replace(/\s+/g, ' ').trim();
  const range = joined.match(/(\d{1,2})[:.]?(\d{2})\s*[-–]\s*(\d{1,2})[:.]?(\d{2})/);
  if (range) {
    const hh1 = Number(range[1]);
    const mm1 = Number(range[2]);
    const hh2 = Number(range[3]);
    const mm2 = Number(range[4]);
    if (isPlausibleClock(hh1, mm1) && isPlausibleClock(hh2, mm2)) {
      return `${range[1].padStart(2, '0')}:${range[2]}-${range[3].padStart(2, '0')}:${range[4]}`;
    }
  }
  const digits = joined.replace(/[^\d]/g, '');
  if (digits.length >= 8) {
    const hh1 = Number(digits.slice(0, 2));
    const mm1 = Number(digits.slice(2, 4));
    const hh2 = Number(digits.slice(4, 6));
    const mm2 = Number(digits.slice(6, 8));
    if (isPlausibleClock(hh1, mm1) && isPlausibleClock(hh2, mm2)) {
      return `${digits.slice(0, 2)}:${digits.slice(2, 4)}-${digits.slice(4, 6)}:${digits.slice(6, 8)}`;
    }
  }
  if (digits.length === 4) {
    const hh = Number(digits.slice(0, 2));
    const mm = Number(digits.slice(2));
    if (isPlausibleClock(hh, mm)) return `${digits.slice(0, 2)}:${digits.slice(2)}`;
  }
  const one = joined.match(/(\d{1,2})[:.](\d{2})/);
  if (one) {
    const hh = Number(one[1]);
    const mm = Number(one[2]);
    if (isPlausibleClock(hh, mm)) return `${one[1].padStart(2, '0')}:${one[2]}`;
  }
  if (/^[A-ZÄÖÜ]{1,3}\d{0,2}$/i.test(joined) && joined.length <= 5) {
    return joined.toUpperCase();
  }
  if (/^[A-ZÄÖÜ]{2,8}-[A-ZÄÖÜ0-9]{1,4}$/i.test(joined)) return joined.toUpperCase();
  if (/[\d]/.test(joined) && !/[A-Za-zÄÖÜäöüß]{2,}/.test(joined)) return '';
  return joined.slice(0, 12);
}

function pad(s: string, n: number): string {
  const t = s.slice(0, n);
  return t + ' '.repeat(Math.max(0, n - t.length));
}

export function nameKey(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9,]+/g, ' ')
    .trim();
}

/**
 * Format grid like the wall plan for visual comparison on a phone.
 * Wide months are split into week chunks (≤7 day columns) so columns stay aligned.
 */
export function formatMonthMatrixTable(
  grid: MonthMatrixGrid,
  opts?: { onlyName?: string | null; matchedName?: string | null; title?: string }
): string {
  if (!grid.rows.length || !grid.headers.length) return '';

  let rows = grid.rows;
  if (opts?.onlyName) {
    const key = opts.onlyName.toLowerCase();
    const hit = rows.filter(
      (r) =>
        r.name.toLowerCase() === key ||
        r.name.toLowerCase().includes(key) ||
        key.includes(r.name.toLowerCase())
    );
    if (hit.length) rows = hit;
  }

  const matchKey = opts?.matchedName ? nameKey(opts.matchedName) : '';
  const nameW = Math.min(
    20,
    Math.max(14, ...rows.map((r) => r.name.length + (matchKey ? 2 : 0)), 4)
  );
  const colW = 5;
  const weekSize = 7;

  const chunks: string[] = [
    opts?.title || 'Roster (month matrix)',
    `${rows.length} people · ${grid.headers.length} day columns`,
    matchKey ? `Your row marked with >` : '',
    '',
  ].filter((l, i, a) => l !== '' || (i > 0 && a[i - 1] !== ''));

  for (let start = 0; start < grid.headers.length; start += weekSize) {
    const end = Math.min(start + weekSize, grid.headers.length);
    const headers = grid.headers.slice(start, end);
    const head = pad('', nameW) + '│' + headers.map((h) => pad(h, colW)).join('│');
    const sep = '-'.repeat(nameW) + '+' + headers.map(() => '-'.repeat(colW)).join('+');
    const body = rows.map((r) => {
      const mark = matchKey && nameKey(r.name) === matchKey ? '> ' : matchKey ? '  ' : '';
      const label = mark + r.name;
      const cells = r.cells.slice(start, end);
      return pad(label, nameW) + '│' + cells.map((c) => pad(c || '·', colW)).join('│');
    });
    const weekLabel =
      headers.length > 1
        ? `── ${headers[0]} … ${headers[headers.length - 1]} ──`
        : `── ${headers[0]} ──`;
    chunks.push(weekLabel, head, sep, ...body, '');
  }

  return chunks.join('\n').trimEnd() + '\n';
}

/** Name candidates from matrix rows (for picker / auto-match). */
export function matrixRowsAsNameCandidates(
  grid: MonthMatrixGrid
): { id: string; label: string; yCenter: number; height: number }[] {
  const seen = new Set<string>();
  const out: { id: string; label: string; yCenter: number; height: number }[] = [];
  for (const r of grid.rows) {
    if (!isPlausiblePersonName(r.name)) continue;
    const id = nameKey(r.name);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, label: r.name, yCenter: r.yCenter, height: 16 });
  }
  return out;
}

/** One-shot quality metrics from a built grid (for status / dumps). */
export function computeMonthMatrixMetrics(grid: MonthMatrixGrid): MonthMatrixMetrics {
  const headerCount = grid.headers.length;
  const rowCount = grid.rows.length;
  const filled = grid.rows.reduce(
    (n, r) => n + r.cells.filter((c) => String(c || '').trim()).length,
    0
  );
  const capacity = Math.max(1, rowCount * headerCount);
  const days = new Set<number>();
  for (const h of grid.headers) {
    const m = String(h).match(/(\d{1,2})$/);
    if (m) {
      const d = Number(m[1]);
      if (d >= 1 && d <= 31) days.add(d);
    }
  }
  return {
    headerCount,
    rowCount,
    fillRatio: filled / capacity,
    dayCoverage: days.size,
  };
}
