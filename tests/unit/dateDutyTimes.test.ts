import {
  formatDateDutyCellTime,
  formatDateDutyTimeLabel,
  resolveDateDutyColumnTime,
} from '../../src/packs/dateDutyTimes';
import type { PackDateDutyConfig } from '../../src/packs/types';
import { getOcrConfigForScope, getPackById } from '../../src/packs';

const cfg: PackDateDutyConfig = {
  columns: [
    {
      id: 'hausdienst',
      short: 'HD',
      match: ['hausdienst'],
      times: [
        { when: 'weekday', start: '11:30', end: '08:30', endNextDay: true },
      ],
    },
    {
      id: 'praemedikation',
      short: 'PD',
      match: ['praemed'],
      times: [
        { when: 'weekday-mon-thu', start: '07:30', end: '16:00' },
        { when: 'friday', start: '09:00', end: '17:30' },
      ],
    },
    {
      id: 'langdienst',
      short: 'LD',
      match: ['langdienst'],
      times: [{ when: 'any', start: '11:30', end: '20:00' }],
    },
    {
      id: 'schmerz',
      short: 'SD',
      match: ['schmerz'],
      times: [
        { when: 'weekday', start: '07:30', end: '16:00' },
        { when: 'weekend-or-holiday', start: '07:30', end: '16:00' },
      ],
    },
  ],
};

describe('dateDuty times', () => {
  it('resolves Hausdienst weekday overnight and not on weekend', () => {
    const thu = new Date(2026, 8, 3); // Thu 3 Sep 2026
    const sat = new Date(2026, 8, 5);
    const hd = cfg.columns[0]!;
    expect(resolveDateDutyColumnTime(hd, thu)).toEqual({
      start: '11:30',
      end: '08:30',
      endNextDay: true,
    });
    expect(resolveDateDutyColumnTime(hd, sat)).toBeNull();
    expect(formatDateDutyTimeLabel(resolveDateDutyColumnTime(hd, thu)!)).toBe(
      '11:30-08:30+1'
    );
  });

  it('resolves Prämed Mo–Do vs Freitag', () => {
    const pd = cfg.columns[1]!;
    expect(resolveDateDutyColumnTime(pd, new Date(2026, 8, 3))?.start).toBe('07:30');
    expect(resolveDateDutyColumnTime(pd, new Date(2026, 8, 4))?.start).toBe('09:00');
    expect(resolveDateDutyColumnTime(pd, new Date(2026, 8, 5))).toBeNull();
  });

  it('formats cell times from shorts', () => {
    const thu = new Date(2026, 8, 3);
    expect(formatDateDutyCellTime('HD', cfg, thu)).toBe('11:30-08:30+1');
    expect(formatDateDutyCellTime('LD', cfg, thu)).toBe('11:30-20:00');
    expect(formatDateDutyCellTime('SD', cfg, new Date(2026, 8, 5))).toBe('07:30-16:00');
  });

  it('Anästhesie pack OCR columns include authored times', () => {
    const pack = getPackById('st-elisabeth-leipzig');
    const ocr = getOcrConfigForScope(pack, 'arzt', 'op-anaesthesie');
    const cols = ocr.dateDuty?.columns || [];
    const byShort = Object.fromEntries(
      cols.map((c) => [String(c.short || c.id).toUpperCase(), c])
    );
    expect(byShort.HD?.times?.[0]?.start).toBe('11:30');
    expect(byShort.HD?.times?.[0]?.endNextDay).toBe(true);
    expect(byShort.RD?.times?.[0]?.end).toBe('08:30');
    expect(byShort.PD?.times?.some((t) => t.when === 'friday' && t.start === '09:00')).toBe(
      true
    );
    expect(byShort.ZD1?.times?.[0]).toMatchObject({ start: '09:30', end: '18:00' });
    expect(byShort.LD?.times?.[0]).toMatchObject({ start: '11:30', end: '20:00' });
    expect(byShort.SD1?.times?.length).toBeGreaterThanOrEqual(1);
  });
});
