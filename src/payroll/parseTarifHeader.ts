/**
 * Extract EG / Stufe / Wochenstunden from Verdienstabrechnung header text.
 * Example: "Tarif AVR-C … Gruppe P8 Stufe 5 [22,00 Stunden je Woche]"
 * Ärzte: "Entgeltgruppe III Stufe 2" (if present).
 */
export function parseTarifFromPayslipHeader(text: string): {
  eg?: string;
  stage?: number;
  workHoursPerWeek?: number;
  tarifLabel?: string;
} {
  const tarifLabel = (() => {
    const m = /Tarif\s+([^\n]+)/i.exec(text);
    return m?.[1]?.replace(/\s+/g, ' ').trim();
  })();

  let eg: string | undefined;
  let stage: number | undefined;
  let workHoursPerWeek: number | undefined;

  const pflege = /Gruppe\s+(P?\d+)\s+Stufe\s+(\d+)/i.exec(text);
  if (pflege) {
    eg = pflege[1].toUpperCase().startsWith('P')
      ? pflege[1].toUpperCase()
      : `P${pflege[1]}`;
    stage = Number(pflege[2]);
  }

  const aerzte = /(?:Entgeltgruppe|EG)\s*([IVX]+|\d+)\s*(?:\/|,)?\s*Stufe\s*(\d+)/i.exec(text);
  if (!eg && aerzte) {
    eg = aerzte[1].toUpperCase();
    stage = Number(aerzte[2]);
  }

  const hours = /\[\s*(\d+[.,]\d+)\s*Stunden/i.exec(text) || /(\d+[.,]\d+)\s*Stunden\s*je\s*Woche/i.exec(text);
  if (hours) {
    const n = Number(hours[1].replace(',', '.'));
    if (Number.isFinite(n) && n > 0) workHoursPerWeek = n;
  }

  return { eg, stage, workHoursPerWeek, tarifLabel };
}
