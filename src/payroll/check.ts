import type { ShiftEntry } from '../convert/types';
import type {
  PayDiffRow,
  PayrollCheckResult,
  PayrollProfile,
  PayrollTarifPrefs,
  PayslipDocument,
  PayslipLine,
} from './types';
import { sumHoursForEntries } from './resolveHours';

function money(n: number): number {
  return Math.round((n || 0) * 100) / 100;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function previousYm(ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return ym;
  const d = new Date(Number(m[1]), Number(m[2]) - 2, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

export function entriesInMonth(
  entries: ShiftEntry[],
  ym: string,
  workplaceId?: string
): ShiftEntry[] {
  return entries.filter((e) => {
    if (workplaceId && e.workplaceId && e.workplaceId !== workplaceId) return false;
    return String(e.date || '').startsWith(ym);
  });
}

function lohnartText(profile: PayrollProfile, la: string): string {
  return profile.lohnarten.find((l) => l.la === la)?.text || la;
}

function shouldCompare(profile: PayrollProfile, la: string): boolean {
  const def = profile.lohnarten.find((l) => l.la === la);
  if (!def) return true;
  if (def.compare === false) return false;
  return def.kind === 'gross' || def.kind === 'zuschlag';
}

function lineByLa(lines: PayslipLine[], la: string): PayslipLine | undefined {
  return lines.find((l) => l.la === la);
}

function resolveWorkPct(profile: PayrollProfile, tarif: PayrollTarifPrefs): number {
  if (tarif.workPct != null && tarif.workPct > 0) return tarif.workPct;
  const hours = tarif.workHoursPerWeek;
  const full = tarif.fullWeekHours || profile.fullWeekHours || 38.5;
  if (hours != null && hours > 0 && full > 0) {
    return money((hours / full) * 100);
  }
  return 100;
}

/**
 * Soll aus Diensten + Tarif vs. Ist aus Verdienstnachweis.
 */
export function runPayrollCheck(opts: {
  profile: PayrollProfile;
  payslip: PayslipDocument;
  entries: ShiftEntry[];
  workplaceId?: string;
  tarif?: PayrollTarifPrefs;
}): PayrollCheckResult {
  const { profile, payslip } = opts;
  const tarif = opts.tarif || {};
  const payMonth = payslip.payMonth;
  const serviceMonth = payslip.serviceMonth || previousYm(payMonth);
  const diagnostics: string[] = [];
  const monthEntries = entriesInMonth(opts.entries, serviceMonth, opts.workplaceId);

  if (!monthEntries.length) {
    diagnostics.push(
      `Keine importierten Dienste für Dienstmonat ${serviceMonth}. Bitte zuerst Zeitprotokoll im Import-Tab laden.`
    );
  }

  const { hours: hourSums, matched, unmatched, urlaubDays } = sumHoursForEntries(
    profile,
    monthEntries
  );

  if (monthEntries.length && unmatched) {
    diagnostics.push(
      `${unmatched} Schicht(en) ohne Abrechnungsregel (Codes noch nicht kalibriert).`
    );
  }
  if (matched) {
    diagnostics.push(`${matched} Schicht(en) über Dienstarten-Profile gematcht.`);
  }

  const expected = new Map<string, { qty: number | null; rate: number | null; amount: number }>();
  const workPct = resolveWorkPct(profile, tarif);
  const eg = tarif.eg || payslip.eg || profile.egRows?.[0]?.eg;
  const stage = tarif.stage || payslip.stage || 1;
  const egRow = profile.egRows?.find((r) => r.eg === eg);
  const stIdx = Math.max(0, stage - 1);
  const divisor = profile.hourDivisor || 173.92;

  if (profile.tarifFamily === 'avr-aerzte') {
    if (!egRow) {
      diagnostics.push('Ärzte: Entgeltgruppe/Stufe setzen, damit Soll berechnet wird.');
    } else {
      const fullBase = egRow.salary[stIdx] || 0;
      const bd = egRow.bd[stIdx] || 0;
      const base = money(fullBase * workPct / 100);
      const sbIdx = eg === 'IV' ? 1 : 2;
      const surchargeBase = egRow.salary[sbIdx] || fullBase;
      const baseHourly = surchargeBase / divisor;
      const rateBd = money(bd);
      const rateBd15 = money(bd * 0.15);
      const rateBd25 = money(bd * 0.25);
      const rateNightActive = money(baseHourly * 0.2);
      const rateSun = money(baseHourly * 0.25);
      const rateHol = money(baseHourly * 0.35);

      expected.set('100', { qty: null, rate: null, amount: base });
      const vl = tarif.vlAg ?? profile.defaults?.vlAg ?? 6.65;
      if (vl) expected.set('200', { qty: null, rate: null, amount: money(vl * workPct / 100) });
      if (tarif.shiftAllowance) {
        expected.set('245', {
          qty: null,
          rate: null,
          amount: money(315 * workPct / 100),
        });
      }
      if (hourSums.paidBd) {
        expected.set('304', {
          qty: money(hourSums.paidBd),
          rate: rateBd,
          amount: money(hourSums.paidBd * rateBd),
        });
      }
      if (hourSums.activeNight) {
        expected.set('314', {
          qty: money(hourSums.activeNight),
          rate: rateNightActive,
          amount: money(hourSums.activeNight * rateNightActive),
        });
      }
      if (hourSums.bdSunHol25) {
        expected.set('361', {
          qty: money(hourSums.bdSunHol25),
          rate: rateBd25,
          amount: money(hourSums.bdSunHol25 * rateBd25),
        });
      }
      if (hourSums.sundayReg) {
        expected.set('310', {
          qty: money(hourSums.sundayReg),
          rate: rateSun,
          amount: money(hourSums.sundayReg * rateSun),
        });
      }
      if (hourSums.holidayReg) {
        expected.set('31F', {
          qty: money(hourSums.holidayReg),
          rate: rateHol,
          amount: money(hourSums.holidayReg * rateHol),
        });
      }
      if (hourSums.bdNight) {
        expected.set('316', {
          qty: money(hourSums.bdNight),
          rate: rateBd15,
          amount: money(hourSums.bdNight * rateBd15),
        });
      }
      if (hourSums.bdNight004) {
        expected.set('317', {
          qty: money(hourSums.bdNight004),
          rate: rateBd15,
          amount: money(hourSums.bdNight004 * rateBd15),
        });
      }
      if (hourSums.bd15) {
        expected.set('345', {
          qty: money(hourSums.bd15),
          rate: rateBd15,
          amount: money(hourSums.bd15 * rateBd15),
        });
      }
      const ukDays = tarif.ukDays ?? 0;
      const ukRate = tarif.ukRate ?? 0;
      if (ukDays && ukRate) {
        expected.set('34U', {
          qty: money(ukDays),
          rate: money(ukRate),
          amount: money(ukDays * ukRate),
        });
      }
    }
  } else if (profile.tarifFamily === 'avr-c-pflege') {
    // Fixed / contract lines: Soll mirrors payslip (or explicit tarif overrides) — no personal pack amounts.
    const base =
      lineByLa(payslip.lines, '100')?.amount ??
      (egRow?.salary[stIdx] != null ? money((egRow.salary[stIdx] || 0) * workPct / 100) : 0);
    if (base) expected.set('100', { qty: null, rate: null, amount: money(base) });

    const z1 = tarif.zulage2Y1 ?? lineByLa(payslip.lines, '2Y1')?.amount ?? 0;
    const z7 = tarif.zulage2Z7 ?? lineByLa(payslip.lines, '2Z7')?.amount ?? 0;
    if (z1) expected.set('2Y1', { qty: null, rate: null, amount: money(z1) });
    if (z7) expected.set('2Z7', { qty: null, rate: null, amount: money(z7) });

    const shiftFull = profile.defaults?.shiftAllowanceFull ?? 315;
    if (tarif.shiftAllowance) {
      expected.set('245', {
        qty: null,
        rate: null,
        amount: money(shiftFull * workPct / 100),
      });
    } else if (lineByLa(payslip.lines, '245')) {
      // Ist has Schichtzulage but tarif toggle off — still show expected 0 only if user opted out
    }

    const bdRate =
      tarif.bdRate ??
      lineByLa(payslip.lines, '304')?.rate ??
      egRow?.bd[stIdx] ??
      0;
    const rateBd15 = money(bdRate * 0.15);
    const rateSat =
      lineByLa(payslip.lines, '362')?.rate ??
      lineByLa(payslip.lines, '314')?.rate ??
      0;

    if (hourSums.paidBd && bdRate) {
      expected.set('304', {
        qty: money(hourSums.paidBd),
        rate: money(bdRate),
        amount: money(hourSums.paidBd * bdRate),
      });
    }
    if (hourSums.bdNight && rateBd15) {
      expected.set('316', {
        qty: money(hourSums.bdNight),
        rate: rateBd15,
        amount: money(hourSums.bdNight * rateBd15),
      });
    }
    if (hourSums.bdNight004 && rateBd15) {
      expected.set('317', {
        qty: money(hourSums.bdNight004),
        rate: rateBd15,
        amount: money(hourSums.bdNight004 * rateBd15),
      });
    }
    if (hourSums.activeNight && rateSat) {
      expected.set('314', {
        qty: money(hourSums.activeNight),
        rate: rateSat,
        amount: money(hourSums.activeNight * rateSat),
      });
    }
    if (hourSums.saturdayReg && rateSat) {
      expected.set('362', {
        qty: money(hourSums.saturdayReg),
        rate: rateSat,
        amount: money(hourSums.saturdayReg * rateSat),
      });
    }

    const ukDays = tarif.ukDays ?? urlaubDays;
    const ukRate = tarif.ukRate ?? lineByLa(payslip.lines, '34U')?.rate ?? 0;
    if (ukDays && ukRate) {
      expected.set('34U', {
        qty: money(ukDays),
        rate: money(ukRate),
        amount: money(ukDays * ukRate),
      });
    } else if (urlaubDays && !ukRate) {
      diagnostics.push(
        `${urlaubDays} Urlaubstag(e) — U/K-Satz erscheint nach VN-Import oder Tarif-Editor.`
      );
    }
  }

  const las = new Set<string>();
  for (const l of payslip.lines) {
    if (shouldCompare(profile, l.la) || expected.has(l.la)) las.add(l.la);
  }
  for (const la of expected.keys()) las.add(la);
  const ordered = [
    ...profile.lohnarten.map((l) => l.la).filter((la) => las.has(la)),
    ...[...las].filter((la) => !profile.lohnarten.some((l) => l.la === la)),
  ];

  const rows: PayDiffRow[] = [];
  let expectedGross = 0;
  for (const la of ordered) {
    if (la === 'BRG' || la === 'GSN' || la === 'AZB' || la === 'SZF') continue;
    const exp = expected.get(la);
    const act = lineByLa(payslip.lines, la);
    const expectedAmount = exp?.amount ?? 0;
    const actualAmount = act?.amount ?? null;
    const ok =
      exp == null || actualAmount == null
        ? null
        : Math.abs(actualAmount - expectedAmount) < 0.02;
    if (exp) expectedGross += expectedAmount;
    rows.push({
      la,
      text: act?.text || lohnartText(profile, la),
      expectedQty: exp?.qty ?? null,
      expectedRate: exp?.rate ?? null,
      expectedAmount: exp ? expectedAmount : 0,
      actualQty: act?.qty ?? null,
      actualRate: act?.rate ?? null,
      actualAmount,
      delta: exp && actualAmount != null ? money(actualAmount - expectedAmount) : null,
      ok,
    });
  }

  return {
    payMonth,
    serviceMonth,
    rows,
    diagnostics,
    expectedGross: money(expectedGross),
    actualGross: payslip.gross ?? lineByLa(payslip.lines, 'BRG')?.amount ?? null,
  };
}
