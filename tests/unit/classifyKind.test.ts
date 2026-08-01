import {
  classifyKindFromText,
  isLikelyShiftPlanText,
} from '../../src/ingest/classifyKind';
import { isLikelyPayslipText } from '../../src/convert/parsers/engines/pdf-payslip';
import { getMappingForScope, getPackById, getPdfConfigForPack } from '../../src/packs';

describe('classifyKindFromText', () => {
  const payslipSample = `
    Verdienstabrechnung
    Abrechnungsmonat März 2026
    LA 1000 BRG 2500,00
  `;

  const shiftSample = `
    Zeitprotokoll März 2026
    Buchungen
    MO DI MI DO FR
    Anwesend Schichtfrei
  `;

  /** Synthetic code-grid markers only — no workplace roster text. */
  const codeGridSample = `
    Mandant: DEMO
    September 2026
    1 2 3 4 5 6 7 8 9 10
    PersonA, Alpha FDI FDI FD IDT B19 U U FD FD FD
    PersonB, Beta FD FD FD - - U U FD FD FD
  `;

  const mapping = getMappingForScope('st-elisabeth-leipzig', 'arzt', 'op-anaesthesie');
  const pdfConfig = getPdfConfigForPack(getPackById('st-elisabeth-leipzig'));

  it('detects payslip (generic VN heuristics)', () => {
    expect(isLikelyPayslipText(payslipSample)).toBe(true);
    expect(classifyKindFromText(payslipSample, { pdfConfig, mapping })).toBe('payslip');
  });

  it('detects shift plan (generic)', () => {
    expect(isLikelyShiftPlanText(shiftSample)).toBe(true);
    expect(classifyKindFromText(shiftSample, { pdfConfig, mapping })).toBe('shift');
  });

  it('detects pack code-grid Dienstplan without ask dialog', () => {
    expect(
      classifyKindFromText(codeGridSample, {
        pdfConfig,
        mapping,
        preset: 'Anästhesie',
      })
    ).toBe('shift');
  });

  it('returns unknown for empty-ish text', () => {
    expect(classifyKindFromText('Hallo Welt ohne Marker')).toBe('unknown');
  });
});
