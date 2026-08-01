/**
 * Synthetic anonymized code-grid fixtures only — no workplace roster PDFs / real names.
 */
import { convertPdfText } from '../../src/convert/pipeline';
import { looksLikeCodeGrid } from '../../src/convert/parsers/engines/pdf-code-grid';
import { getMappingForScope, getPdfConfigForPack, getPackById } from '../../src/packs';

/** Person×day layout text (pdftotext -layout shape) — synthetic names only. */
function syntheticLayoutText(): string {
  // 30 day header + one person row + overflow attach (IDT/B19 → Hausdienst Tag, ID1/B5A → Hausdienst).
  const days = Array.from({ length: 30 }, (_, i) => String(i + 1)).join(' ');
  const main = [
    'FDI',
    'FDI',
    'FDI',
    'FDI',
    '-',
    'IDT', // day 6 — overflow B19 attaches
    '-',
    'FZA',
    'FDI',
    'FDI',
    'FDI',
    '-',
    '-',
    '-',
    'FDI',
    'FDI',
    'ID1', // day 17 — overflow B5A attaches
    '-',
    '-',
    '-',
    'U',
    'U',
    'U',
    'U',
    'U',
    'U',
    'U',
    'U',
    'U',
    'U',
  ].join(' ');
  return [
    'Mandant: DEMO',
    'September 2026',
    days,
    `PersonA, Alpha ${main}`,
    'B19 S16 B5A',
    'PersonB, Beta FDI FDI FDI - - FD FD - U U U - - - FD FD FD - - - U U U U U U U U U U',
  ].join('\n');
}

/** Flat Tj-style stream (app PDF extract) — synthetic names only. */
function syntheticFlatText(): string {
  return (
    'Mandant: DEMO September 2026 ' +
    Array.from({ length: 30 }, (_, i) => String(i + 1)).join(' ') +
    ' PersonA, Alpha FDI FDI FDI FDI - IDT - FZA FDI FDI FDI - - - FDI FDI ID1 - - - ' +
    'U U U U U U U U U U B19 S16 B5A ' +
    'PersonB, Beta FDI FDI FDI - - FD FD - U U U - - - FD FD FD - - - U U U U U U U U U U'
  );
}

describe('pdf-code-grid (pack-driven, no roster PII)', () => {
  const mapping = getMappingForScope('st-elisabeth-leipzig', 'arzt', 'op-anaesthesie');
  const pack = getPackById('st-elisabeth-leipzig');
  const pdfConfig = getPdfConfigForPack(pack);
  const layoutText = syntheticLayoutText();

  it('detects via pack codeGrid markers, not payroll', () => {
    expect(mapping).toBeTruthy();
    expect(pdfConfig?.codeGrid?.requirePatterns?.length).toBeGreaterThan(0);
    expect(looksLikeCodeGrid(layoutText, pdfConfig, mapping, 'Anästhesie')).toBe(true);
    expect(
      looksLikeCodeGrid(
        'Abrechnungsmonat 09/2026\n11 Mo KO* 07:35 GE* 15:50',
        pdfConfig,
        mapping,
        'Anästhesie'
      )
    ).toBe(false);
  });

  it('parses layout text with compose + FD times', () => {
    const { entries, year, month } = convertPdfText(layoutText, {
      preset: 'Anästhesie',
      mapping: mapping!,
      engineId: 'pdf-payroll',
      pdfConfig,
    });
    expect(year).toBe('2026');
    expect(month).toBe('09');
    expect(entries.length).toBeGreaterThan(10);
    const fd = entries.find((e) => e.type === 'FD' && e.start);
    expect(fd).toMatchObject({ start: '07:30', end: '16:00' });
  });

  it('personFilter + Hausdienst compose', () => {
    const { entries } = convertPdfText(layoutText, {
      preset: 'Anästhesie',
      mapping: mapping!,
      engineId: 'pdf-payroll',
      pdfConfig,
      personFilter: 'PersonA',
    });
    expect(entries.some((e) => e.date === '2026-09-06' && /Hausdienst Tag/i.test(e.type))).toBe(
      true
    );
    expect(entries.some((e) => e.date === '2026-09-17' && e.type === 'Hausdienst')).toBe(true);
  });

  it('parses mobile flat Tj extract (phone path)', () => {
    const flat = syntheticFlatText();
    expect(looksLikeCodeGrid(flat, pdfConfig, mapping, 'Anästhesie')).toBe(true);
    const { entries } = convertPdfText(flat, {
      preset: 'Anästhesie',
      mapping: mapping!,
      engineId: 'pdf-payroll',
      pdfConfig,
      personFilter: 'PersonA',
    });
    expect(entries.length).toBeGreaterThan(5);
    expect(entries.some((e) => e.type === 'FDI' || /Hausdienst/i.test(e.type))).toBe(true);
  });
});
