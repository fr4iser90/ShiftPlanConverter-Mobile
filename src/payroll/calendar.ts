/** Saxony holidays + weekday helpers (Thomas Abrechnungsprüfer port). */

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function parseDateLocal(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

export function sameYearMonth(a: string, b: string): boolean {
  return String(a || '').slice(0, 7) === String(b || '').slice(0, 7);
}

function easterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/** Statutory holidays for Sachsen (SN). */
export function saxonyHolidayMap(year: number): Record<string, string> {
  const map: Record<string, string> = {};
  const add = (date: string, name: string) => {
    map[date] = name;
  };
  const e = easterDate(year);
  add(`${year}-01-01`, 'Neujahr');
  add(isoDate(addDays(e, -2)), 'Karfreitag');
  add(isoDate(addDays(e, 1)), 'Ostermontag');
  add(`${year}-05-01`, 'Tag der Arbeit');
  add(isoDate(addDays(e, 39)), 'Christi Himmelfahrt');
  add(isoDate(addDays(e, 50)), 'Pfingstmontag');
  add(`${year}-10-03`, 'Tag der Deutschen Einheit');
  add(`${year}-10-31`, 'Reformationstag');
  for (let day = 16; day <= 22; day++) {
    const d = new Date(year, 10, day);
    if (d.getDay() === 3) {
      add(isoDate(d), 'Buß- und Bettag');
      break;
    }
  }
  add(`${year}-12-25`, '1. Weihnachtstag');
  add(`${year}-12-26`, '2. Weihnachtstag');
  return map;
}

export type CalendarInfo = {
  iso: string;
  weekday: number;
  weekdayName: string;
  isSaturday: boolean;
  isSunday: boolean;
  isFriday: boolean;
  isHoliday: boolean;
  holiday: string;
  nextIso: string;
  nextIsSunday: boolean;
  nextIsSaturday: boolean;
  nextIsHoliday: boolean;
  nextHoliday: string;
};

export function calendarInfo(
  dateStr: string,
  extraHolidays: Record<string, string> = {}
): CalendarInfo | null {
  const d = parseDateLocal(dateStr);
  if (!d) return null;
  const w = d.getDay();
  const names = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  const next = addDays(d, 1);
  const nextIso = isoDate(next);
  const holidays = { ...saxonyHolidayMap(d.getFullYear()), ...extraHolidays };
  const hn = holidays[dateStr] || '';
  const nextH = holidays[nextIso] || '';
  return {
    iso: dateStr,
    weekday: w,
    weekdayName: names[w],
    isSaturday: w === 6,
    isSunday: w === 0,
    isFriday: w === 5,
    isHoliday: !!hn,
    holiday: hn,
    nextIso,
    nextIsSunday: next.getDay() === 0,
    nextIsSaturday: next.getDay() === 6,
    nextIsHoliday: !!nextH,
    nextHoliday: nextH,
  };
}

export function parseDeHours(raw: string | undefined | null): number {
  if (raw == null || raw === '') return 0;
  const n = Number(String(raw).replace(',', '.').replace(/\s/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** Duration in decimal hours from HH:MM start/end (overnight OK). */
export function durationHours(start?: string, end?: string): number | null {
  const parse = (t: string) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  };
  if (!start || !end) return null;
  const a = parse(start);
  const b = parse(end);
  if (a == null || b == null) return null;
  let mins = b - a;
  if (mins <= 0) mins += 24 * 60;
  return Math.round((mins / 60) * 100) / 100;
}
