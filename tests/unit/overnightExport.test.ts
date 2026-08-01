import { generateIcs } from '../../src/convert/ics';
import {
  calendarWipeRange,
  expandEntriesForExport,
  isOvernightEntry,
} from '../../src/convert/overnightExport';
import type { ShiftEntry } from '../../src/convert/types';
import { DEFAULT_EVENT_FORMAT } from '../../src/state/eventFormat';

const mo: ShiftEntry = {
  type: 'MO',
  date: '2026-07-15',
  start: '11:35',
  end: '07:35',
};

describe('overnightExport', () => {
  it('detects overnight by end < start', () => {
    expect(isOvernightEntry(mo)).toBe(true);
    expect(isOvernightEntry({ ...mo, end: '19:50' })).toBe(false);
  });

  it('span mode leaves entries unchanged', () => {
    expect(expandEntriesForExport([mo], 'span')).toEqual([mo]);
  });

  it('split mode yields two calendar pieces', () => {
    const parts = expandEntriesForExport([mo], 'split');
    expect(parts).toHaveLength(2);
    expect(parts[0]).toMatchObject({
      date: '2026-07-15',
      start: '11:35',
      end: '00:00',
      calendarPart: '1/2',
      overnightWindow: { start: '11:35', end: '07:35' },
    });
    expect(parts[1]).toMatchObject({
      date: '2026-07-16',
      start: '00:00',
      end: '07:35',
      calendarPart: '2/2',
    });
  });

  it('wipe range includes next day for overnight', () => {
    expect(calendarWipeRange([mo])).toEqual({
      startDate: '2026-07-15',
      endDate: '2026-07-16',
    });
  });

  it('ICS split emits two VEVENTs with part labels', () => {
    const ics = generateIcs([mo], {
      eventFormat: { ...DEFAULT_EVENT_FORMAT, overnightMode: 'split' },
    });
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain('MO 11:35–07:35 (1/2)');
    expect(ics).toContain('MO 11:35–07:35 (2/2)');
    expect(ics).toContain('DTSTART;TZID=Europe/Berlin:20260715T113500');
    expect(ics).toContain('DTEND;TZID=Europe/Berlin:20260716T000000');
    expect(ics).toContain('DTSTART;TZID=Europe/Berlin:20260716T000000');
    expect(ics).toContain('DTEND;TZID=Europe/Berlin:20260716T073500');
  });

  it('ICS span emits one overnight VEVENT', () => {
    const ics = generateIcs([mo], {
      eventFormat: { ...DEFAULT_EVENT_FORMAT, overnightMode: 'span' },
    });
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics).toContain('SUMMARY:MO 11:35–07:35');
    expect(ics).not.toContain('(1/2)');
    expect(ics).toContain('DTSTART;TZID=Europe/Berlin:20260715T113500');
    expect(ics).toContain('DTEND;TZID=Europe/Berlin:20260716T073500');
  });
});
