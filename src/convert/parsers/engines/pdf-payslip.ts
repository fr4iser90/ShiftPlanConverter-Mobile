import type { PayslipDocument, PayslipLine } from '../../../payroll/types';
import { parseTarifFromPayslipHeader } from '../../../payroll/parseTarifHeader';

const MONTHS_DE: Record<string, number> = {
  januar: 1,
  februar: 2,
  märz: 3,
  maerz: 3,
  april: 4,
  mai: 5,
  juni: 6,
  juli: 7,
  august: 8,
  september: 9,
  oktober: 10,
  november: 11,
  dezember: 12,
};

function money(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Parse German amount like 2.420,30 or -216,08 */
export function parseDeAmount(raw: string): number | null {
  const s = String(raw || '')
    .trim()
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  if (!s || s === '–' || s === '-') return null;
  const n = Number(s);
  return Number.isFinite(n) ? money(n) : null;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function previousMonth(ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return ym;
  const d = new Date(Number(m[1]), Number(m[2]) - 2, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function parsePayMonth(text: string): string | null {
  const m = /Abrechnungsmonat\s+([A-Za-zÄÖÜäöüß]+)\s+(\d{4})/i.exec(text);
  if (!m) return null;
  const key = m[1].toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  const mon =
    MONTHS_DE[m[1].toLowerCase()] ||
    MONTHS_DE[key] ||
    MONTHS_DE[key.replace('a', 'ae').replace('o', 'oe').replace('u', 'ue')];
  // März → marz after NFD; map manually
  const fixed =
    mon ||
    ({ jan: 1, feb: 2, mar: 3, apr: 4, mai: 5, jun: 6, jul: 7, aug: 8, sep: 9, okt: 10, nov: 11, dez: 12 } as Record<
      string,
      number
    >)[key.slice(0, 3)];
  const year = Number(m[2]);
  if (!fixed || !year) return null;
  return `${year}-${pad2(fixed)}`;
}

const MONEY_RE = /-?\d{1,3}(?:\.\d{3})*,\d{2}/g;

/**
 * Parse LOGA3 / St. Elisabeth Verdienstabrechnung text (from PDF extract).
 */
export function parsePayslipText(
  text: string,
  opts: { workplaceId?: string; source?: PayslipDocument['source'] } = {}
): PayslipDocument {
  const payMonth = parsePayMonth(text);
  if (!payMonth) {
    throw new Error('Verdienstnachweis: Abrechnungsmonat nicht gefunden');
  }

  const lines: PayslipLine[] = [];
  const seen = new Set<string>();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = /^([0-9A-Z]{2,3})\s+(?:\((?:JLL)\)\s+)?(.+)$/.exec(line);
    if (!m) continue;
    const la = m[1];
    let rest = m[2].trim();
    if (la === 'LA') continue;

    let qty: number | null = null;
    let unit: string | null = null;
    let rate: number | null = null;

    const qtyM = /(\d+,\d{2})\s*(Std\.?|Tage)\b/i.exec(rest);
    if (qtyM) {
      qty = parseDeAmount(qtyM[1]);
      unit = /tage/i.test(qtyM[2]) ? 'Tage' : 'Std';
      // Drop qty+unit so remaining money tokens are rate / amount / annual
      rest = rest.replace(qtyM[0], ' ').replace(/\s+/g, ' ').trim();
    }

    const moneyTokens = [...rest.matchAll(MONEY_RE)].map((x) => x[0]);
    if (!moneyTokens.length) continue;

    let amount: number | null = null;
    if (qty != null && moneyTokens.length >= 2) {
      rate = parseDeAmount(moneyTokens[0]);
      amount = parseDeAmount(moneyTokens[1]);
    } else {
      amount = parseDeAmount(moneyTokens[0]);
    }
    if (amount == null) continue;

    if (seen.has(la)) continue;
    seen.add(la);

    const textPart = rest
      .replace(MONEY_RE, '')
      .replace(/\s+/g, ' ')
      .trim();

    lines.push({
      la,
      text: textPart || la,
      qty,
      unit,
      rate,
      amount,
    });
  }

  if (!lines.length) {
    throw new Error('Verdienstnachweis: keine Lohnarten-Zeilen gefunden');
  }

  const brg = lines.find((l) => l.la === 'BRG');
  const tarif = parseTarifFromPayslipHeader(text);

  return {
    payMonth,
    serviceMonth: previousMonth(payMonth),
    tarifLabel: tarif.tarifLabel,
    eg: tarif.eg,
    stage: tarif.stage,
    workHoursPerWeek: tarif.workHoursPerWeek,
    lines,
    gross: brg?.amount,
    workplaceId: opts.workplaceId,
    source: opts.source || 'pdf',
    importedAt: new Date().toISOString(),
  };
}

export function isLikelyPayslipText(text: string): boolean {
  return (
    /Verdienstabrechnung/i.test(text) &&
    /Abrechnungsmonat/i.test(text) &&
    /\b(LA|BRG)\b/.test(text)
  );
}
