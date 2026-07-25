import { parseCsvShifts } from '../../src/ingest/parseCsv';
import { parseIcsShifts } from '../../src/ingest/parseIcs';
import { getParser, DEFAULT_PARSER_ID } from '../../src/convert/parsers';
import { getParserIdForPack, getPreferredSourceId, getBuiltinPackConfig } from '../../src/packs';

describe('parser registry', () => {
  it('resolves default St. Elisabeth parser', () => {
    expect(typeof getParser(DEFAULT_PARSER_ID)).toBe('function');
    expect(getParser(undefined)).toBe(getParser(DEFAULT_PARSER_ID));
  });

  it('pack config exposes parser + preferred source', () => {
    const pack = getBuiltinPackConfig();
    expect(getParserIdForPack(pack)).toBe('st-elisabeth-zeitprotokoll-pdf');
    expect(getPreferredSourceId(pack)).toBe('loga3-webview');
  });
});

describe('parseCsvShifts', () => {
  it('parses header + rows', () => {
    const csv = `date,start,end,type
2026-07-15,07:00,15:30,F
2026-07-16,,,U`;
    const entries = parseCsvShifts(csv);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ date: '2026-07-15', start: '07:00', end: '15:30', type: 'F' });
    expect(entries[1].allDay).toBe(true);
  });
});

describe('parseIcsShifts', () => {
  it('parses VEVENT', () => {
    const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
DTSTART:20260715T070000
DTEND:20260715T153000
SUMMARY:F
END:VEVENT
END:VCALENDAR`;
    const entries = parseIcsShifts(ics);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      date: '2026-07-15',
      start: '07:00',
      end: '15:30',
      type: 'F',
    });
  });
});
