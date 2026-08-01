import {
  classifyKindFromText,
  isLikelyShiftPlanText,
} from '../../src/ingest/classifyKind';
import { isLikelyPayslipText } from '../../src/convert/parsers/engines/pdf-payslip';

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

  it('detects payslip', () => {
    expect(isLikelyPayslipText(payslipSample)).toBe(true);
    expect(classifyKindFromText(payslipSample)).toBe('payslip');
  });

  it('detects shift plan', () => {
    expect(isLikelyShiftPlanText(shiftSample)).toBe(true);
    expect(classifyKindFromText(shiftSample)).toBe('shift');
  });

  it('returns unknown for empty-ish text', () => {
    expect(classifyKindFromText('Hallo Welt ohne Marker')).toBe('unknown');
  });
});
