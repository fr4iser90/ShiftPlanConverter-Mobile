import { calendarInfo, saxonyHolidayMap } from '../../src/payroll/calendar';
import { deriveArztDienstId, hoursForEntry, sumHoursForEntries } from '../../src/payroll/resolveHours';
import { getPayrollProfileForScope } from '../../src/packs';
import type { ShiftEntry } from '../../src/convert/types';

describe('payroll calendar (SN)', () => {
  it('marks 2026-05-01 as holiday', () => {
    const map = saxonyHolidayMap(2026);
    expect(map['2026-05-01']).toBe('Tag der Arbeit');
    const ci = calendarInfo('2026-05-01');
    expect(ci?.isHoliday).toBe(true);
    expect(ci?.nextIsSaturday).toBe(true); // 2 May 2026 is Saturday
  });
});

describe('Ärzte derive + overrides', () => {
  const profile = getPayrollProfileForScope('st-elisabeth-leipzig', 'arzt', 'op')!;

  it('derives ITS Mo–Do and applies base hours', () => {
    expect(deriveArztDienstId('2026-03-19', 'ITS')).toBe('ITS_MO_DO');
    const entry: ShiftEntry = { type: 'ITS', date: '2026-03-19' };
    const r = hoursForEntry(profile, entry);
    expect(r.matched).toBe(true);
    expect(r.hours.paidBd).toBe(4.5);
    expect(r.hours.bdNight).toBe(6);
    expect(r.hours.bdNight004).toBe(4);
  });

  it('strips 00–04 on month-crossing night', () => {
    // 2026-04-30 is Thursday; next day May — if FR_VF style night...
    // Use ITS night on last day of month: 2026-03-31 is Tuesday → ITS_MO_DO crosses to April
    const entry: ShiftEntry = { type: 'ITS', date: '2026-03-31' };
    const r = hoursForEntry(profile, entry);
    expect(r.dienstartId).toBe('ITS_MO_DO');
    expect(r.hours.bdNight004).toBe(0);
    expect(r.hours.bdNight).toBe(4);
  });
});

describe('Pflege B39 calibration (früher oft als B38)', () => {
  const profile = getPayrollProfileForScope('st-elisabeth-leipzig', 'pflege', 'op-bereich')!;

  it('sums one B39 like Mai 2026 gold (19:50–07:35)', () => {
    const entries: ShiftEntry[] = [{ type: 'B39', date: '2026-04-15', start: '19:50', end: '07:35' }];
    const { hours, matched } = sumHoursForEntries(profile, entries);
    expect(matched).toBe(1);
    expect(hours.paidBd).toBe(6.03);
    expect(hours.bdNight).toBe(5);
    expect(hours.bdNight004).toBe(4);
  });
});
