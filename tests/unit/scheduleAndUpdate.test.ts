import { compareVersions, parseVersionParts } from '@/src/update/versionCompare';
import {
  isSyncOverdue,
  nextReminderDate,
  normalizeSchedulePrefs,
} from '@/src/schedule/prefs';
import {
  listMappingShiftOptions,
  normalizeReminds,
  normalizeShiftAlarmPrefs,
  parseLooseTime,
  remindsForCode,
} from '@/src/schedule/shiftAlarmPrefs';
import {
  fireAtForRemindTime,
  isRemindBeforeShiftStart,
  planShiftAlarms,
} from '@/src/schedule/shiftAlarmPlan';
import type { ShiftEntry } from '@/src/convert/types';
import { getBuiltinMapping } from '@/src/packs';

describe('compareVersions', () => {
  it('orders semver-ish tags', () => {
    expect(compareVersions('0.1.3', '0.1.4')).toBe(-1);
    expect(compareVersions('v0.1.4', '0.1.4')).toBe(0);
    expect(compareVersions('0.2.0', '0.1.9')).toBe(1);
  });

  it('parses parts', () => {
    expect(parseVersionParts('v1.2.3-rc.1')).toEqual([1, 2, 3]);
  });
});

describe('schedule overdue', () => {
  it('defaults are opt-in (off)', () => {
    const prefs = normalizeSchedulePrefs({});
    expect(prefs.intervalDays).toBe(0);
    expect(prefs.promptOnOpen).toBe(false);
    expect(prefs.widgetBadge).toBe(false);
    expect(isSyncOverdue(prefs, null, new Date())).toBe(false);
  });

  it('marks overdue after interval', () => {
    const prefs = normalizeSchedulePrefs({ intervalDays: 3, widgetBadge: true });
    const last = new Date('2026-07-20T10:00:00');
    const now = new Date('2026-07-24T10:00:00');
    expect(isSyncOverdue(prefs, last, now)).toBe(true);
    expect(isSyncOverdue(prefs, last, new Date('2026-07-21T10:00:00'))).toBe(false);
  });

  it('interval 0 disables', () => {
    const prefs = normalizeSchedulePrefs({ intervalDays: 0 });
    expect(isSyncOverdue(prefs, null, new Date())).toBe(false);
  });

  it('next reminder respects preferred hour', () => {
    const prefs = normalizeSchedulePrefs({
      intervalDays: 3,
      preferredHour: 3,
      notifyEnabled: true,
    });
    const last = new Date('2026-07-20T10:00:00');
    const now = new Date('2026-07-24T01:00:00');
    const next = nextReminderDate(prefs, last, now)!;
    expect(next.getHours()).toBe(3);
    expect(next.getTime()).toBeGreaterThan(now.getTime());
  });
});

describe('shift alarm prefs', () => {
  it('normalizes clock times unique sorted max 7', () => {
    expect(normalizeReminds(['06:00', '05:30', '06:00', 'bad', '25:00', '12:15'])).toEqual([
      { time: '05:30', eve: false },
      { time: '06:00', eve: false },
      { time: '12:15', eve: false },
    ]);
  });

  it('parses loose clock input', () => {
    expect(parseLooseTime('630')).toBe('06:30');
    expect(parseLooseTime('6 30')).toBe('06:30');
    expect(parseLooseTime('6:30')).toBe('06:30');
    expect(parseLooseTime('6')).toBe('06:00');
    expect(parseLooseTime('1230')).toBe('12:30');
    expect(parseLooseTime('2560')).toBeNull();
  });

  it('lists mapping Dienste from preset', () => {
    const opts = listMappingShiftOptions(getBuiltinMapping(), 'Anästhesie');
    expect(opts.some((o) => o.code === 'F' && o.label.includes('Früh'))).toBe(true);
    expect(opts.some((o) => o.code === 'S')).toBe(true);
  });

  it('uses per-code clock times', () => {
    const prefs = normalizeShiftAlarmPrefs({
      enabled: true,
      times: ['06:00'],
      codeTimes: { S: ['10:00', '12:00'] },
    });
    expect(remindsForCode(prefs, 'S').map((r) => r.time)).toEqual(['10:00', '12:00']);
    expect(remindsForCode(prefs, 'F').map((r) => r.time)).toEqual(['06:00']);
  });

  it('same-day remind must be before shift start; eve fires previous day', () => {
    expect(fireAtForRemindTime('2026-07-25', '07:35', '22:00')).toBeNull();
    expect(fireAtForRemindTime('2026-07-25', '07:35', '07:35')).toBeNull();
    expect(isRemindBeforeShiftStart('06:00', '07:35')).toBe(true);
    expect(isRemindBeforeShiftStart('10:00', '07:35')).toBe(false);

    const eve = fireAtForRemindTime('2026-07-25', '07:35', { time: '22:00', eve: true })!;
    expect(eve.getDate()).toBe(24);
    expect(eve.getHours()).toBe(22);
  });

  it('plans same-day and eve reminds', () => {
    const prefs = normalizeShiftAlarmPrefs({
      enabled: true,
      codeTimes: { F: ['06:05', '22:00|eve'] },
      horizonDays: 7,
    });
    const entries: ShiftEntry[] = [
      { type: 'F', date: '2026-07-25', start: '07:35', end: '15:50' },
    ];
    const now = new Date('2026-07-23T12:00:00');
    const planned = planShiftAlarms(entries, prefs, now);
    expect(planned).toHaveLength(2);
    expect(planned[0].eve).toBe(true);
    expect(planned[0].remindAt).toBe('22:00');
    expect(planned[0].fireAt.getDate()).toBe(24);
    expect(planned[1].eve).toBe(false);
    expect(planned[1].remindAt).toBe('06:05');
  });
});
