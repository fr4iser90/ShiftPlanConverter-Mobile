import { isPlausiblePersonName } from '../../names';
import { cleanCell } from './geometry';
import type { MonthMatrixGrid, MonthMatrixMetrics } from './types';

function isPlausibleClock(hh: number, mm: number): boolean {
  return hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59;
}

function looksLikeCodeToken(t: string): boolean {
  const raw = String(t || '').trim();
  const u = raw.toUpperCase().replace(/\s+/g, '');
  if (!u || u.length > 12) return false;
  if (/^(Mo|Di|Mi|Do|Fr|Sa|So)\d*$/i.test(u)) return false;
  if (/^[A-ZÄÖÜ][a-zäöüß]{2,}/.test(raw)) return false;
  if (/^[A-ZÄÖÜ]{1,3}\d{1,2}$/.test(u)) return true;
  if (/^[A-ZÄÖÜ]{1,2}$/.test(u)) return true;
  if (/^[A-ZÄÖÜ]{2,3}-[A-ZÄÖÜ0-9]{1,3}$/.test(u)) return true;
  if (/^[A-ZÄÖÜ]{2,8}$/.test(u) && raw === raw.toUpperCase()) return true;
  return false;
}

function isCalendarWeekCrumb(t: string): boolean {
  const s = String(t || '').trim();
  // "(KW 32)", "(Kw35)", split OCR "(KW" / "KW32)" / bare "KW".
  if (/^\(?\s*kw\b/i.test(s)) return true;
  if (/^kw\s*\d{0,2}\)?$/i.test(s)) return true;
  if (/^\(?\s*kw\s*\d{1,2}\s*\)?$/i.test(s)) return true;
  return false;
}

/** Prefer a code-shaped token; otherwise one compact time — never mashed OCR. */
export function formatShiftCell(parts: string[]): string {
  if (!parts.length) return '';

  // Split "F 07:35-15:50" / "M2 11:00-19:15" into code + rest.
  const expanded: string[] = [];
  for (const raw of parts) {
    const t = cleanCell(raw);
    if (!t) continue;
    // Calendar-week crumbs in body (Mo column under header) — drop.
    if (isCalendarWeekCrumb(t)) continue;
    const mixed = t.match(/^([A-Za-zÄÖÜäöüß]{1,3}\d{0,2})\s+(.+)$/);
    if (mixed && looksLikeCodeToken(mixed[1])) {
      expanded.push(mixed[1], mixed[2]);
      continue;
    }
    expanded.push(t);
  }
  if (!expanded.length) return '';

  const codes = expanded.filter((t) => looksLikeCodeToken(t));
  if (codes.length) {
    // Prefer shortest duty-like code (F, M2, FK9) over long all-caps noise.
    codes.sort((a, b) => a.length - b.length);
    return codes[0].toUpperCase().replace(/\s+/g, '');
  }

  const cleaned = expanded
    .map(cleanCell)
    .filter(Boolean)
    .filter((t) => !isCalendarWeekCrumb(t))
    .filter((t) => !/^[#|\\/]+$/.test(t))
    .filter((t) => !/^\d{1,2}#$/.test(t))
    // Lone slash / off-day marker
    .map((t) => (t === '/' || t === '\\' ? '' : t))
    .filter(Boolean);
  if (!cleaned.length) return '';

  const joined = cleaned.join(' ').replace(/\s+/g, ' ').trim();
  if (isCalendarWeekCrumb(joined)) return '';
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
