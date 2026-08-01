/**
 * Central LOGA3 WebView wait budgets (ms).
 * Waits = one deadline per step (not retries). Slow phones need headroom —
 * prefer raising these over adding second attempts.
 *
 * Used by: fetchJob, fetchPayslipJob, AutomationBridge defaults, androidDownloadPoll.
 */
export const LoGa3Timeout = {
  /** Bridge defaults when caller omits timeoutMs */
  bridgeWaitMessage: 30_000,
  bridgeCmd: 45_000,

  /** Explicit command budgets (fetch jobs usually pass these) */
  run: 25_000,
  probe: 20_000,
  softProbeShort: 2_500,
  softProbe: 8_000,
  softProbeQuick: 5_000,

  /** Login / shell */
  waitLoginForm: 45_000,
  fillLogin: 20_000,
  submitLogin: 15_000,
  waitShell: 90_000,
  waitShellOpen: 60_000,
  clickOeffnen: 12_000,

  /** Month picker / SmartEdin / export */
  waitPickerAfterOpen: 90_000,
  waitPicker: 60_000,
  clickSmartEdin: 15_000,
  waitSmartEdinExport: 40_000,
  clickExport: 15_000,
  waitZeitprotokollButton: 45_000,

  /**
   * After selectMonth: picker header MM/YYYY (not full day-grid).
   */
  waitPickerMonth: 30_000,
  selectMonth: 25_000,
  verifyCalendarAfter: 20_000,

  /**
   * After arm + month-arrows away/back: day-grid must match.
   */
  waitGridAktualisierung: 20_000,

  /** @deprecated use waitPickerMonth — kept so old call sites don't break mid-refactor */
  waitCalendarHeader: 120_000,

  /** Dialog / download / PDF */
  waitDialog: 60_000,
  clickDownload: 15_000,
  waitPdf: 120_000,
  armPdfCaptureMs: 60_000,
  openZeitprotokoll: 25_000,
  /** @deprecated fuzzy path removed — kept for any stray call sites */
  openVerdienstDocument: 15_000,
  clickGenerierteDokumente: 12_000,
  waitGenerierteDokumente: 45_000,
  openVerdienstFolder: 12_000,
  waitVerdienstFolder: 30_000,
  waitVerdienstFile: 30_000,
  clickVerdienstPdfDownload: 15_000,
  clickVerdienstBack: 8_000,

  /** Small UI clicks */
  closePopups: 5_000,
  clickBerechnen: 8_000,
  leavePdfViewer: 3_000,
  closeDialog: 5_000,
  assertHasPlan: 12_000,
  armCalendarReload: 8_000,
} as const;

export type LoGa3TimeoutKey = keyof typeof LoGa3Timeout;
