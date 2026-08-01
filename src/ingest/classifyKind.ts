/**
 * Classify imported document text as shift plan vs payslip vs unknown.
 *
 * Generic heuristics first; pack `parsers/pdf.json` → `codeGrid` (and optional
 * `classify` patterns) refine AG-specific layouts. UI ask only on unknown.
 */
import { looksLikeCodeGrid } from '../convert/parsers/engines/pdf-code-grid';
import { isLikelyPayslipText } from '../convert/parsers/engines/pdf-payslip';
import type { PackMapping } from '../convert/types';
import type { PackPdfConfig } from '../convert/parsers/engines/types';

export type DocumentKind = 'shift' | 'payslip' | 'unknown';

export type ClassifyKindOpts = {
  pdfConfig?: PackPdfConfig | null;
  mapping?: PackMapping | null;
  preset?: string | null;
};

function anyPattern(text: string, patterns?: string[] | null, flags = 'i'): boolean {
  if (!patterns?.length) return false;
  for (const p of patterns) {
    try {
      if (new RegExp(p, flags).test(text)) return true;
    } catch {
      /* ignore bad pack pattern */
    }
  }
  return false;
}

/** Light Dienstplan / Zeitprotokoll signals (German portal + OCR dumps). */
export function isLikelyShiftPlanText(text: string): boolean {
  const t = text || '';
  if (isLikelyPayslipText(t)) return false;
  return (
    /Zeitprotokoll|Zeitdaten|Dienstplan|Schichtplan|Buchungen/i.test(t) ||
    (/Soll\/Ist|Anwesend|Schichtfrei/i.test(t) && /\b(MO|DI|MI|DO|FR|SA|SO)\b/.test(t)) ||
    (/Kalendarium|Monatsübersicht/i.test(t) && /\d{1,2}\.\d{1,2}\.\d{2,4}/.test(t)) ||
    // Single-person LOGA Zeitabrechnung (KO*/GE*) — not Verdienstabrechnung
    (/Zeitabrechnung/i.test(t) && /KO\s*\*/i.test(t) && /GE\s*\*/i.test(t))
  );
}

export function classifyKindFromText(
  text: string,
  opts: ClassifyKindOpts = {}
): DocumentKind {
  const t = text || '';
  const packClassify = opts.pdfConfig?.classify;

  // Pack overrides (AG markers) — explicit wins over generic.
  if (anyPattern(t, packClassify?.payslipPatterns, packClassify?.payslipFlags)) {
    return 'payslip';
  }
  if (anyPattern(t, packClassify?.shiftPatterns, packClassify?.shiftFlags)) {
    return 'shift';
  }

  // Pack person×day code grid (e.g. Mandant + codes) → Dienstplan.
  if (looksLikeCodeGrid(t, opts.pdfConfig, opts.mapping, opts.preset || undefined)) {
    return 'shift';
  }

  const payslip = isLikelyPayslipText(t);
  const shift = isLikelyShiftPlanText(t);
  if (payslip && !shift) return 'payslip';
  if (shift && !payslip) return 'shift';
  if (payslip && shift) return 'payslip'; // VN markers are stricter
  return 'unknown';
}
