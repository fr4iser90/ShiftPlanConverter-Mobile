/**
 * Classify imported document text as shift plan vs payslip vs unknown.
 * Pack/AG heuristics can refine this later; keep overrides in UI.
 */
import { isLikelyPayslipText } from '../convert/parsers/engines/pdf-payslip';

export type DocumentKind = 'shift' | 'payslip' | 'unknown';

/** Light Dienstplan / Zeitprotokoll signals (German portal + OCR dumps). */
export function isLikelyShiftPlanText(text: string): boolean {
  const t = text || '';
  if (isLikelyPayslipText(t)) return false;
  return (
    /Zeitprotokoll|Zeitdaten|Dienstplan|Schichtplan|Buchungen/i.test(t) ||
    (/Soll\/Ist|Anwesend|Schichtfrei/i.test(t) && /\b(MO|DI|MI|DO|FR|SA|SO)\b/.test(t)) ||
    (/Kalendarium|Monatsübersicht/i.test(t) && /\d{1,2}\.\d{1,2}\.\d{2,4}/.test(t))
  );
}

export function classifyKindFromText(text: string): DocumentKind {
  const payslip = isLikelyPayslipText(text);
  const shift = isLikelyShiftPlanText(text);
  if (payslip && !shift) return 'payslip';
  if (shift && !payslip) return 'shift';
  if (payslip && shift) return 'payslip'; // VN markers are stricter
  return 'unknown';
}
