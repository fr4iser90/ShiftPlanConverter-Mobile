export type ShiftEntry = {
  type: string;
  date: string;
  start?: string;
  end?: string;
  allDay?: boolean;
  isSpecial?: boolean;
  isWork?: boolean;
  isValidated?: boolean;
  breakMinutes?: string;
  pepTarget?: string;
  contractTarget?: string;
  actual?: string;
  timeAccountDaily?: string;
  timeAccountCumulative?: string;
  onCallPercent?: string;
  onCallRated?: string;
  /** Employer workplace profile that owns this shift (multi-AG). */
  workplaceId?: string;
};

export type MonthSummary = {
  month: string | null;
  year: string | null;
  carryOverPreviousMonth: string | null;
  carryOverNextMonth: string | null;
  periodPepTarget: string | null;
  periodContractTarget: string | null;
  periodActual: string | null;
  periodBalance: string | null;
  onCallPayout: string | null;
  onCallTimeAccount: string | null;
  /** Employer workplace profile that owns this summary (multi-AG). */
  workplaceId?: string;
};

export type ParseResult = {
  year: string;
  month: string;
  mainEntries: ShiftEntry[];
  onCallEntries: ShiftEntry[];
  summary: MonthSummary | null;
  summaries: MonthSummary[];
};

export type ConvertResult = {
  entries: ShiftEntry[];
  year: string | null;
  month: string | null;
  summary: MonthSummary | null;
  summaries: MonthSummary[];
};

export type MappingValue =
  | string
  | {
      code: string;
      /** Same timeslot, alternate printed codes (OCR/payroll); time→code stays `code`. */
      also?: string[];
      label?: string;
      /** Semantic class for payroll etc.: work | night | long | oncall */
      type?: string;
      isValidated?: boolean;
    };

/** Multi-code LOGA compose (e.g. Ärzte Anästhesie Hausdienst). Engine may apply later. */
export type PackComposeWhen =
  | 'any'
  | 'weekday'
  | 'weekday-mon-thu'
  | 'friday'
  | 'weekend-or-holiday'
  | 'next-day-weekend-or-holiday'
  | 'next-day-weekday';

export type PackComposeRule = {
  id: string;
  label: string;
  codes: string[];
  /** Codes on the following calendar day that complete the service */
  nextDayCodes?: string[];
  start: string;
  end: string;
  when?: PackComposeWhen;
  type?: string;
};

export type PackMapping = {
  /** Display / Google-export colors (hex). Not an OCR code source. */
  colors?: Record<string, string>;
  /** Alternate printed codes → canonical pack code (e.g. synonym labels). */
  codeAliases?: Record<string, string>;
  presets?: Record<string, Record<string, MappingValue>>;
  /**
   * Ordered rules: match code sets → one calendar event (consume parts).
   * Spec: pack mappings/arzt/LOGA-Dienstmapping.md — not all pipelines apply yet.
   */
  composeRules?: PackComposeRule[];
};
