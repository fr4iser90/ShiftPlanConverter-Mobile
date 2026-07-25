import type { ShiftEntry } from '../convert/types';

/**
 * Minimal CSV → shifts.
 * Header row required. Columns (case-insensitive): date, start, end, type
 * Optional: allDay (true/1/yes).
 * date = YYYY-MM-DD
 */
export function parseCsvShifts(csvText: string): ShiftEntry[] {
  const lines = csvText
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const split = (line: string) => {
    const out: string[] = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        q = !q;
        continue;
      }
      if (c === ',' && !q) {
        out.push(cur.trim());
        cur = '';
        continue;
      }
      cur += c;
    }
    out.push(cur.trim());
    return out;
  };

  const header = split(lines[0]).map((h) => h.toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const iDate = idx('date');
  const iStart = idx('start');
  const iEnd = idx('end');
  const iType = idx('type');
  const iAllDay = idx('allday');
  if (iDate < 0 || iType < 0) {
    throw new Error('CSV needs columns: date, type (optional: start, end, allDay)');
  }

  const entries: ShiftEntry[] = [];
  for (let r = 1; r < lines.length; r++) {
    const cols = split(lines[r]);
    const date = cols[iDate] || '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const allDay =
      iAllDay >= 0 && /^(1|true|yes|ja)$/i.test(cols[iAllDay] || '');
    const start = iStart >= 0 ? cols[iStart] || undefined : undefined;
    const end = iEnd >= 0 ? cols[iEnd] || undefined : undefined;
    const type = cols[iType] || 'SHIFT';
    entries.push({
      date,
      type,
      start: allDay ? undefined : start,
      end: allDay ? undefined : end,
      allDay: allDay || (!start && !end),
      isValidated: false,
    });
  }
  return entries;
}
