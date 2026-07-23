export type YearMonth = { month: number; year: number };

/** Inclusive window: current month − prev … current month + next (crosses years). */
export function buildMonthWindow(
  prevMonths: number,
  nextMonths: number,
  now = new Date()
): YearMonth[] {
  const out: YearMonth[] = [];
  const start = new Date(now.getFullYear(), now.getMonth() - Math.max(0, prevMonths), 1);
  const count = Math.max(0, prevMonths) + 1 + Math.max(0, nextMonths);
  for (let i = 0; i < count; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    out.push({ month: d.getMonth() + 1, year: d.getFullYear() });
  }
  return out;
}

export function formatMonthWindow(items: YearMonth[]): string {
  return items.map((x) => `${String(x.month).padStart(2, '0')}/${x.year}`).join(', ');
}

/** Group months by year for runFetchJob (one year per call). */
export function groupMonthsByYear(items: YearMonth[]): { year: number; months: number[] }[] {
  const map = new Map<number, number[]>();
  for (const { month, year } of items) {
    const list = map.get(year) || [];
    if (!list.includes(month)) list.push(month);
    map.set(year, list);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, months]) => ({ year, months: months.sort((a, b) => a - b) }));
}

export function ymKey(month: number, year: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function entryInWindow(date: string, window: YearMonth[]): boolean {
  if (!date || date.length < 7) return false;
  const key = date.slice(0, 7);
  return window.some((w) => ymKey(w.month, w.year) === key);
}
