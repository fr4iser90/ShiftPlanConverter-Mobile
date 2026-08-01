/**
 * Pack PDF declaration (`parsers/pdf.json`).
 * Engines live in convert/; packs only supply engine id + match params.
 */
export type PdfEngineId =
  | 'pdf-auto'
  | 'pdf-list'
  | 'pdf-timesheet'
  | 'pdf-payroll'
  | 'pdf-code-grid';

export type PackPdfMonthHeader = {
  pattern: string;
  flags?: string;
  monthGroup?: number;
  yearGroup?: number;
  /**
   * When the month group is a name (Januar/September/…), map lowercased
   * name → `01`…`12`. Pack-specific locale.
   */
  monthNameMap?: Record<string, string>;
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

/**
 * Pack-owned detection / headers for the generic person×day code-grid engine.
 * No employer strings in convert/ — only here.
 */
export type PackPdfCodeGrid = {
  /** All must match (e.g. Mandant header). */
  requirePatterns?: string[];
  requireFlags?: string;
  /** If any match → not a code-grid (e.g. Zeitprotokoll). */
  rejectPatterns?: string[];
  rejectFlags?: string;
  /** Month/year line for this export format. */
  monthHeader?: PackPdfMonthHeader;
  /** Day-number header row, e.g. `1 2 3 4 …`. */
  dayHeaderPattern?: string;
  dayHeaderFlags?: string;
  /** Lines to ignore while scanning person rows. */
  skipLinePatterns?: string[];
  skipLineFlags?: string;
  /** Min pack-code token hits to accept the document. Default 10. */
  minCodeHits?: number;
};

/** Optional AG markers for Dienstplan vs Verdienstnachweis (beyond generic heuristics). */
export type PackPdfClassify = {
  shiftPatterns?: string[];
  shiftFlags?: string;
  payslipPatterns?: string[];
  payslipFlags?: string;
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
  /** Optional person×day code-grid profile (pack-specific markers). */
  codeGrid?: PackPdfCodeGrid;
  /** Optional classify heuristics (AG); codeGrid already implies shift. */
  classify?: PackPdfClassify;
};
