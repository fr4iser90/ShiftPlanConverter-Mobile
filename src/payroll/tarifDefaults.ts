import type { PayrollProfile, PayrollTarifPrefs, PayslipDocument } from './types';

/** Neutral UI defaults: Vollzeit, no personal EG/amounts. */
export function defaultTarifPrefs(profile: PayrollProfile | null): PayrollTarifPrefs {
  if (!profile) return {};
  const full = profile.fullWeekHours || 38.5;
  if (profile.tarifFamily === 'avr-c-pflege') {
    return {
      workHoursPerWeek: full,
      fullWeekHours: full,
      workPct: 100,
      shiftAllowance: false,
    };
  }
  if (profile.tarifFamily === 'avr-aerzte') {
    return {
      eg: profile.egRows?.[0]?.eg,
      stage: 1,
      workPct: 100,
      shiftAllowance: false,
      vlAg: 0,
    };
  }
  return { workPct: 100 };
}

/**
 * Prefs from an imported payslip (EG/Stufe/Stunden + Zulagen/BD from lines).
 * Does not invent missing fields.
 */
export function tarifPrefsFromPayslip(
  payslip: PayslipDocument,
  profile: PayrollProfile | null
): PayrollTarifPrefs {
  const full = profile?.fullWeekHours || 38.5;
  const out: PayrollTarifPrefs = {};
  if (payslip.eg) out.eg = payslip.eg;
  if (payslip.stage) out.stage = payslip.stage;
  if (payslip.workHoursPerWeek != null) {
    out.workHoursPerWeek = payslip.workHoursPerWeek;
    out.fullWeekHours = full;
    out.workPct = Math.round((payslip.workHoursPerWeek / full) * 10000) / 100;
  }
  const z1 = payslip.lines.find((l) => l.la === '2Y1');
  if (z1) out.zulage2Y1 = z1.amount;
  const z7 = payslip.lines.find((l) => l.la === '2Z7');
  if (z7) out.zulage2Z7 = z7.amount;
  const bd = payslip.lines.find((l) => l.la === '304' && l.rate != null);
  if (bd?.rate != null) out.bdRate = bd.rate;
  const shift = payslip.lines.find((l) => l.la === '245');
  if (shift && shift.amount > 0) out.shiftAllowance = true;
  const uk = payslip.lines.find((l) => l.la === '34U');
  if (uk?.rate != null) out.ukRate = uk.rate;
  if (uk?.qty != null) out.ukDays = uk.qty;
  return out;
}

/**
 * Merge: neutral defaults → saved prefs → payslip.
 * Payslip wins for fields it provides (EG/Stufe/Stunden/Zulagen/BD/U-K).
 */
export function mergeTarifPrefs(
  profile: PayrollProfile | null,
  saved: PayrollTarifPrefs,
  payslip?: PayslipDocument | null
): PayrollTarifPrefs {
  const base = defaultTarifPrefs(profile);
  const fromSlip = payslip ? tarifPrefsFromPayslip(payslip, profile) : {};
  return { ...base, ...saved, ...fromSlip };
}
