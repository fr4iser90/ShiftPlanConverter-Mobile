import {
  buildClosedPayslipWindow,
  buildMonthWindow,
  groupMonthsByYear,
  ymKey,
} from '../../src/sync/monthWindow';

describe('monthWindow', () => {
  it('builds current + next 2 (default-style)', () => {
    const now = new Date(2026, 6, 15); // Jul 2026
    const w = buildMonthWindow(0, 2, now);
    expect(w.map((x) => ymKey(x.month, x.year))).toEqual([
      '2026-07',
      '2026-08',
      '2026-09',
    ]);
  });

  it('crosses year boundary', () => {
    const now = new Date(2026, 11, 1); // Dec
    const w = buildMonthWindow(1, 1, now);
    expect(w.map((x) => ymKey(x.month, x.year))).toEqual([
      '2026-11',
      '2026-12',
      '2027-01',
    ]);
    const groups = groupMonthsByYear(w);
    expect(groups).toEqual([
      { year: 2026, months: [11, 12] },
      { year: 2027, months: [1] },
    ]);
  });

  it('payslip window is last closed month(s) only', () => {
    const now = new Date(2026, 7, 2); // Aug 2026
    expect(buildClosedPayslipWindow(1, now).map((x) => ymKey(x.month, x.year))).toEqual([
      '2026-07',
    ]);
    expect(buildClosedPayslipWindow(2, now).map((x) => ymKey(x.month, x.year))).toEqual([
      '2026-06',
      '2026-07',
    ]);
  });

  it('payslip window crosses year in January', () => {
    const now = new Date(2026, 0, 10); // Jan 2026
    expect(buildClosedPayslipWindow(1, now).map((x) => ymKey(x.month, x.year))).toEqual([
      '2025-12',
    ]);
  });
});
