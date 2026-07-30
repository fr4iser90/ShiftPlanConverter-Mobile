import { parsePayslipText } from '../../src/convert/parsers/engines/pdf-payslip';
import { getPayrollProfileForScope, isPayrollSupportedForScope } from '../../src/packs';

describe('parsePayslipText', () => {
  it('parses Pflege Mai 2026 Verdienstabrechnung excerpt', () => {
    const text = `
Anästhesie
Abrechnungsmonat             Mai 2026
Tarif AVR-C RK Ost Pflege Krankenhä Gruppe P8 Stufe 5 [22,00 Stunden
je Woche]
Verdienstabrechnung
LA        Text
100       (JLL) Tarifliches Grundgehalt                                                        2.420,30          12.101,50
2Y1       (JLL) Zulage §12(4) Anlage 31                                                           81,04             402,99
2Z7       (JLL) Zulage §12(3) Anlage 31                                                           14,29              71,45
304       (JLL) Bereitschaftsdienst                                6,03 Std.     23,23           140,08             356,11
316       (JLL) Nachtzuschlag Bereitschaft                         5,00 Std.      3,48            17,40              69,60
317       (JLL) Nachtzuschlag Bereitschaft (00-04)                 4,00 Std.      3,48            13,92              55,68
362       (JLL) Samstagszuschlag                                   4,58 Std.      4,60            21,07              21,07
BRG       Gesamtbrutto                                                                         2.708,10          13.864,72
`;
    const doc = parsePayslipText(text);
    expect(doc.payMonth).toBe('2026-05');
    expect(doc.serviceMonth).toBe('2026-04');
    expect(doc.gross).toBe(2708.1);
    expect(doc.eg).toBe('P8');
    expect(doc.stage).toBe(5);
    expect(doc.workHoursPerWeek).toBe(22);
    const la304 = doc.lines.find((l) => l.la === '304');
    expect(la304?.qty).toBe(6.03);
    expect(la304?.rate).toBe(23.23);
    expect(la304?.amount).toBe(140.08);
  });
});

describe('payroll pack has no personal tarif defaults', () => {
  it('pflege profile omits personal salary/zulagen', () => {
    const p = getPayrollProfileForScope('st-elisabeth-leipzig', 'pflege', 'op-bereich');
    expect(p?.egRows?.length ?? 0).toBe(0);
    expect(p?.defaults?.zulage2Y1).toBeUndefined();
    expect(p?.defaults?.bdRate).toBeUndefined();
    expect(p?.fullWeekHours).toBe(38.5);
  });
});

describe('payroll pack gate', () => {
  it('enables Pflege OP and Ärzte OP', () => {
    expect(isPayrollSupportedForScope('st-elisabeth-leipzig', 'pflege', 'op-bereich')).toBe(
      true
    );
    expect(isPayrollSupportedForScope('st-elisabeth-leipzig', 'arzt', 'op')).toBe(true);
    expect(isPayrollSupportedForScope('default-generic', 'generic', 'import')).toBe(false);
    expect(getPayrollProfileForScope('st-elisabeth-leipzig', 'pflege', 'op-bereich')?.id).toBe(
      'st-elisabeth-pflege-op-anaesthesie'
    );
  });
});
