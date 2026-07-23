import * as fs from 'fs';
import * as path from 'path';
import { parseStElisabeth } from '../src/convert/parser-st-elisabeth';
import { convertPdfText } from '../src/convert/pipeline';
import { resolveShiftMapping } from '../src/convert/shiftMapping';
import { getBuiltinMapping } from '../src/packs';
import { generateIcs } from '../src/convert/ics';
import { anonymizeDienstplanText, buildSupportParserSample } from '../src/convert/anonymize';

const fixturePath = path.join(__dirname, '..', 'fixtures', 'sample-zeitprotokoll-snippet.txt');
const fixture = fs.readFileSync(fixturePath, 'utf8');

describe('St. Elisabeth parser', () => {
  it('reads Abrechnungsmonat from fixture', () => {
    const parsed = parseStElisabeth(fixture);
    expect(parsed.year).toBe('2026');
    expect(parsed.month).toBe('09');
  });

  it('detects at least one KO*/GE* shift', () => {
    const parsed = parseStElisabeth(fixture);
    expect(parsed.mainEntries.length).toBeGreaterThanOrEqual(1);
    const first = parsed.mainEntries[0];
    expect(first.start).toMatch(/^\d{2}:\d{2}$/);
    expect(first.end).toMatch(/^\d{2}:\d{2}$/);
    expect(fixture).toMatch(/KO\*/);
    expect(fixture).toMatch(/GE\*/);
  });

  it('maps Anästhesie preset to validated codes', () => {
    const result = convertPdfText(fixture, { preset: 'Anästhesie' });
    expect(result.entries.length).toBeGreaterThanOrEqual(1);
    const m3 = result.entries.find((e) => e.start === '11:35' && e.end === '19:50');
    expect(m3?.type).toBe('M3');
    expect(m3?.isValidated).toBe(true);
    const f = result.entries.find((e) => e.start === '07:35' && e.end === '15:50');
    expect(f?.type).toBe('F');
  });

  it('infers F when leaving early with same start (not “missing mapping”)', () => {
    const mapping = getBuiltinMapping().presets!.Anästhesie;
    const early = resolveShiftMapping('07:35', '14:00', mapping);
    expect(early.code).toBe('F');
    expect(early.inferred).toBe(true);
    expect(early.isValidated).toBe(false);
    const exact = resolveShiftMapping('07:35', '15:50', mapping);
    expect(exact.code).toBe('F');
    expect(exact.inferred).toBe(false);
    expect(exact.isValidated).toBe(true);
  });
});

describe('ICS generator', () => {
  it('emits valid VCALENDAR/VEVENT', () => {
    const { entries } = convertPdfText(fixture);
    const ics = generateIcs(entries);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('END:VEVENT');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics).toMatch(/DTSTART/);
    expect(ics).toMatch(/SUMMARY:/);
  });
});

describe('anonymize', () => {
  it('redacts names but keeps shift times and KO*/GE*', () => {
    const withName = [
      'Name Max Mustermann',
      'Personalnummer 12345678',
      'Abrechnungsmonat 09/2026',
      '11 Mo KO* 11:35 GE* 19:50 0,30 7,45',
    ].join('\n');
    const anon = anonymizeDienstplanText(withName);
    expect(anon).not.toMatch(/Mustermann/);
    expect(anon).toMatch(/KO\*/);
    expect(anon).toMatch(/GE\*/);
    expect(anon).toMatch(/11:35/);
    expect(anon).toMatch(/19:50/);
    expect(anon).toMatch(/\[NAME\]|\[HEADER_REDACTED\]|\[PERSONAL_ID\]/);
  });

  it('builds support sample with KO*/GE*', () => {
    const sample = buildSupportParserSample(fixture);
    expect(sample).toMatch(/KO\*/);
    expect(sample).toMatch(/GE\*/);
  });
});
