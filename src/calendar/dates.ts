/** Date helpers for in-app shift calendar (Mon-first weeks). */

export function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Monday=0
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - day);
  return x;
}

export function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function parseEntryDate(dateStr: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function formatDeDate(dateStr: string): string {
  const d = parseEntryDate(dateStr);
  if (!d) return dateStr;
  return d.toLocaleDateString('de-DE');
}

export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function highlightKind(
  dateStr: string,
  now = new Date()
): 'today' | 'week' | 'month' | null {
  const d = parseEntryDate(dateStr);
  if (!d) return null;
  const today = startOfLocalDay(now);
  if (d.getTime() === today.getTime()) return 'today';
  const sow = startOfWeek(now);
  const eow = addDays(sow, 6);
  eow.setHours(23, 59, 59, 999);
  if (d >= sow && d <= eow) return 'week';
  if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) return 'month';
  return null;
}

const WEEKDAY_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

export function weekdayShort(d: Date): string {
  return WEEKDAY_SHORT[(d.getDay() + 6) % 7]!;
}

export function monthTitle(d: Date, locale = 'de-DE'): string {
  return d.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
}

export function weekTitle(sow: Date, locale = 'de-DE'): string {
  const eow = addDays(sow, 6);
  const a = sow.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  const b = eow.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  return `${a} – ${b}`;
}
