import {
  expectedFirstWeekdayCode,
  expectedLastDayOfMonth,
  extractAbrechnungsmonatFromText,
  hasSchedulePlanFromSignature,
  validatePdfPeriod,
  verifyCalendarFromSignature,
  type ContentSignature,
} from '../src/loga3/contentGate';

const emptySig = (over: Partial<ContentSignature> = {}): ContentSignature => ({
  key: '',
  gridKey: '',
  bookingsLabel: null,
  firstWeekday: null,
  lastDay: null,
  dayCount: 0,
  schichtfrei: 0,
  ranges: [],
  geKo: [],
  sample: '',
  ...over,
});

describe('contentGate (Desktop parity)', () => {
  it('expectedFirstWeekdayCode for 07/2026 is MI', () => {
    // 2026-07-01 was Wednesday
    expect(expectedFirstWeekdayCode(7, 2026)).toBe('MI');
    expect(expectedLastDayOfMonth(7, 2026)).toBe('31');
    expect(expectedLastDayOfMonth(6, 2026)).toBe('30');
  });

  it('verifyCalendar rejects title-only / wrong day01', () => {
    const picker = { month: '07', year: '2026', found: true };
    const bad = verifyCalendarFromSignature(
      emptySig({ firstWeekday: 'MO', lastDay: '31', bookingsLabel: 'Juli 2026' }),
      picker,
      7,
      2026
    );
    expect(bad.ok).toBe(false);
    expect(bad.reason).toMatch(/day01/);

    const good = verifyCalendarFromSignature(
      emptySig({ firstWeekday: 'MI', lastDay: '31', ranges: ['07:00-15:00'] }),
      picker,
      7,
      2026
    );
    expect(good.ok).toBe(true);
  });

  it('hasSchedulePlanFromSignature matches Desktop (ranges/geKo/schichtfrei)', () => {
    expect(hasSchedulePlanFromSignature(emptySig())).toBe(false);
    expect(hasSchedulePlanFromSignature(emptySig({ ranges: ['08:00-16:00'] }))).toBe(true);
    expect(hasSchedulePlanFromSignature(emptySig({ geKo: ['07:35'] }))).toBe(true);
    expect(hasSchedulePlanFromSignature(emptySig({ schichtfrei: 2 }))).toBe(true);
  });

  it('validatePdfPeriod requires matching Abrechnungsmonat', () => {
    const text = 'Abrechnungsmonat 07/2026\nKO* 07:35 GE* 15:50';
    expect(validatePdfPeriod(text, 7, 2026).ok).toBe(true);
    expect(validatePdfPeriod(text, 6, 2026).ok).toBe(false);
    expect(extractAbrechnungsmonatFromText(text)).toBe('07/2026');
    expect(validatePdfPeriod('no period', 7, 2026).ok).toBe(false);
  });
});
