import { compareVersions, parseVersionParts } from '@/src/update/versionCompare';
import {
  isSyncOverdue,
  nextReminderDate,
  normalizeSchedulePrefs,
} from '@/src/schedule/prefs';

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
