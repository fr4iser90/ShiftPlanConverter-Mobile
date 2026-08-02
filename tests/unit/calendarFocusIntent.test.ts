import {
  calendarFocusFromEntries,
  calendarFocusFromYearMonth,
} from '../../src/setup/calendarFocusIntent';

describe('calendarFocusIntent', () => {
  it('picks earliest date when today not in set', () => {
    const focus = calendarFocusFromEntries([
      { type: 'HD', date: '2026-09-03', start: '11:30', end: '08:30' },
      { type: 'LD', date: '2026-09-10', start: '11:30', end: '20:00' },
    ]);
    expect(focus).toEqual({ year: 2026, month: 9, day: 3 });
  });

  it('builds from year/month', () => {
    expect(calendarFocusFromYearMonth(2026, 8)).toEqual({
      year: 2026,
      month: 8,
      day: 1,
    });
  });
});
