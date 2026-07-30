/** Pack payroll profile + payslip documents (Abrechnungsprüfer). */

export type PayrollLineKind = 'gross' | 'zuschlag' | 'info' | 'deduction';

export type PayrollLohnart = {
  la: string;
  text: string;
  kind: PayrollLineKind;
  /** Include in Soll↔Ist compare (default true for gross/zuschlag). */
  compare?: boolean;
};

export type PayrollHourFields = {
  paidBd?: number;
  timeOff?: number;
  bd15?: number;
  bdSunHol25?: number;
  bdNight?: number;
  bdNight004?: number;
  activeNight?: number;
  sundayReg?: number;
  holidayReg?: number;
  saturdayReg?: number;
};

/** User-editable tarif prefs (persisted per workplace). */
export type PayrollTarifPrefs = {
  eg?: string;
  stage?: number;
  /** Beschäftigungsumfang % (Ärzte) or derived from weekly hours (Pflege). */
  workPct?: number;
  workHoursPerWeek?: number;
  /** Full-time weekly hours for Pflege workPct (default 38.5). */
  fullWeekHours?: number;
  shiftAllowance?: boolean;
  vlAg?: number;
  /** Pflege Zulagen override (€); null = use payslip / defaults. */
  zulage2Y1?: number;
  zulage2Z7?: number;
  /** BD hourly rate override (Pflege); null = from egRows / payslip. */
  bdRate?: number;
  ukDays?: number;
  ukRate?: number;
};

export type PayrollDienstart = {
  id: string;
  name: string;
  kat: string;
  zeit?: string;
  /**
   * Pflege: match mapping `type` (work|night|long|oncall). Codes live only in the pack mapping.
   * Ärzte: unused — calendar derive / explicit `codes` below.
   */
  matchType?: string;
  /**
   * Ärzte / legacy: explicit codes (ITS, OP, …). Prefer mapping `type` + `matchType` for Pflege.
   */
  codes?: string[];
  hours: PayrollHourFields;
};

export type PayrollTarifEgRow = {
  eg: string;
  label: string;
  salary: Array<number | null>;
  bd: Array<number | null>;
};

export type PayrollProfile = {
  id: string;
  label: string;
  /** Ärzte AVR vs Pflege AVR-C, etc. */
  tarifFamily: 'avr-aerzte' | 'avr-c-pflege' | string;
  holidayRegion?: string;
  hourDivisor?: number;
  /** Default full-time week hours (Pflege workPct). */
  fullWeekHours?: number;
  egRows?: PayrollTarifEgRow[];
  /** Fixed monthly lines (Grundgehalt, Zulagen) — rates filled from user tarif prefs / tables. */
  fixedLa?: string[];
  /** Default Zulagen / rates when not on payslip (Pflege). */
  defaults?: {
    zulage2Y1?: number;
    zulage2Z7?: number;
    bdRate?: number;
    shiftAllowanceFull?: number;
    vlAg?: number;
  };
  dienstarten: PayrollDienstart[];
  lohnarten: PayrollLohnart[];
  notes?: string[];
};

export type PayslipLine = {
  la: string;
  text: string;
  qty: number | null;
  unit: string | null;
  rate: number | null;
  amount: number;
};

export type PayslipDocument = {
  /** Abrechnungsmonat YYYY-MM */
  payMonth: string;
  /** Inferred or declared service month YYYY-MM (often payMonth − 1). */
  serviceMonth?: string;
  personName?: string;
  tarifLabel?: string;
  eg?: string;
  stage?: number;
  workHoursPerWeek?: number;
  lines: PayslipLine[];
  gross?: number;
  workplaceId?: string;
  source: 'pdf' | 'loga3' | 'manual';
  importedAt: string;
};

export type PayDiffRow = {
  la: string;
  text: string;
  expectedQty: number | null;
  expectedRate: number | null;
  expectedAmount: number;
  actualQty: number | null;
  actualRate: number | null;
  actualAmount: number | null;
  delta: number | null;
  ok: boolean | null;
};

export type PayrollCheckResult = {
  payMonth: string;
  serviceMonth: string;
  rows: PayDiffRow[];
  diagnostics: string[];
  expectedGross: number;
  actualGross: number | null;
};

export type PackAreaPayroll = {
  supported: boolean;
  profile: string;
};
