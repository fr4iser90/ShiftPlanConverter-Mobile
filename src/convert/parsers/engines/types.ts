/**
 * Pack PDF declaration (`parsers/pdf.json`).
 * Engines live in convert/; packs only supply engine id + match params.
 */
export type PdfEngineId = 'pdf-auto' | 'pdf-list' | 'pdf-timesheet' | 'pdf-payroll';

export type PackPdfMonthHeader = {
  pattern: string;
  flags?: string;
  monthGroup?: number;
  yearGroup?: number;
};

export type PackPdfShiftRule = {
  pattern: string;
  flags?: string;
  type?: string;
  dayGroup?: number;
  startGroup?: number;
  endGroup?: number;
  /** Optional numeric columns after times (pause, pepTarget, …). */
  extra?: Partial<
    Record<'breakMinutes' | 'pepTarget' | 'contractTarget' | 'actual' | 'timeAccountDaily' | 'timeAccountCumulative', number>
  >;
};

export type PackPdfAllDayRule = {
  pattern: string;
  flags?: string;
  dayGroup?: number;
  /** Fixed type, or omit when typeFromGroup is set. */
  type?: string;
  typeFromGroup?: number;
  /** Map OCR/portal code → stored type (e.g. KR → KRANK). */
  normalize?: Record<string, string>;
};

export type PackPdfOnCallRule = {
  pattern: string;
  flags?: string;
  fallbackPattern?: string;
  fallbackFlags?: string;
  type?: string;
  /** Group with DD.MM.YYYY */
  dateGroup?: number;
  startGroup?: number;
  endGroup?: number;
  onCallPercentGroup?: number;
  onCallRatedGroup?: number;
};

export type PackPdfSummaryField = {
  /** MonthSummary key */
  field:
    | 'carryOverPreviousMonth'
    | 'carryOverNextMonth'
    | 'periodPepTarget'
    | 'periodContractTarget'
    | 'periodActual'
    | 'periodBalance'
    | 'onCallPayout'
    | 'onCallTimeAccount';
  pattern: string;
  flags?: string;
  group?: number;
  /** When set, fills multiple summary fields from one match (periode). */
  groups?: Partial<
    Record<
      'periodPepTarget' | 'periodContractTarget' | 'periodActual' | 'periodBalance',
      number
    >
  >;
};

export type PackPdfConfig = {
  engine: PdfEngineId;
  preferredLayout?: string;
  scoreHints?: string[];
  monthHeader?: PackPdfMonthHeader;
  /** Leave main/on-call when this matches (e.g. Zeitabrechnung). */
  mainSectionRestart?: string;
  mainSectionRestartFlags?: string;
  onCallSection?: string;
  onCallSectionFlags?: string;
  shift?: PackPdfShiftRule;
  allDay?: PackPdfAllDayRule[];
  onCall?: PackPdfOnCallRule;
  summary?: PackPdfSummaryField[];
};
