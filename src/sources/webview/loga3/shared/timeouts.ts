/**
 * Central LOGA3 WebView wait budgets (ms).
 * Waits = one deadline per step (not retries). Slow phones / work Wi‑Fi need headroom —
 * prefer raising these over adding second attempts.
 *
 * Used by: fetchJob, fetchPayslipJob, AutomationBridge defaults, androidDownloadPoll.
 *
 * Settings preset (`waitPatiencePrefs`) multiplies these baselines at runtime
 * (Normal ×1, Sehr langsam ×2). Call sites keep using `LoGa3Timeout.*`.
 */

/** Unscaled baselines — network-sensitive waits raised for typical work Wi‑Fi. */
export const LoGa3TimeoutBase = {
  /** Bridge defaults when caller omits timeoutMs */
  bridgeWaitMessage: 60_000,
  bridgeCmd: 90_000,

  /** Explicit command budgets (fetch jobs usually pass these) */
  run: 40_000,
  probe: 40_000,
  softProbeShort: 2_500,
  softProbe: 8_000,
  softProbeQuick: 5_000,

  /** Login / shell */
  waitLoginForm: 90_000,
  fillLogin: 20_000,
  submitLogin: 15_000,
  waitShell: 180_000,
  waitShellOpen: 120_000,
  clickOeffnen: 12_000,

  /** Month picker / SmartEdin / export */
  waitPickerAfterOpen: 180_000,
  waitPicker: 120_000,
  clickSmartEdin: 15_000,
  waitSmartEdinExport: 80_000,
  clickExport: 15_000,
  waitZeitprotokollButton: 90_000,

  /**
   * After selectMonth: picker header MM/YYYY (not full day-grid).
   */
  waitPickerMonth: 60_000,
  selectMonth: 25_000,
  verifyCalendarAfter: 20_000,

  /**
   * After arm + month-arrows away/back: day-grid must match.
   */
  waitGridAktualisierung: 40_000,

  /** @deprecated use waitPickerMonth — kept so old call sites don't break mid-refactor */
  waitCalendarHeader: 120_000,

  /** Dialog / download / PDF */
  waitDialog: 120_000,
  clickDownload: 15_000,
  waitPdf: 180_000,
  armPdfCaptureMs: 60_000,
  openZeitprotokoll: 25_000,
  /** @deprecated fuzzy path removed — kept for any stray call sites */
  openVerdienstDocument: 15_000,
  clickGenerierteDokumente: 12_000,
  waitGenerierteDokumente: 90_000,
  openVerdienstFolder: 12_000,
  waitVerdienstFolder: 60_000,
  waitVerdienstFile: 60_000,
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

export type LoGa3TimeoutKey = keyof typeof LoGa3TimeoutBase;

let waitScaleFactor = 1;

export function getLoGa3WaitScaleFactor(): number {
  return waitScaleFactor;
}

/** Applied by waitPatiencePrefs hydrate/save. Factor ≤0 falls back to 1. */
export function setLoGa3WaitScaleFactor(factor: number): void {
  waitScaleFactor =
    Number.isFinite(factor) && factor > 0 ? factor : 1;
}

export function scaleLoGa3TimeoutMs(baseMs: number): number {
  return Math.round(baseMs * waitScaleFactor);
}

/**
 * Scaled budgets — drop-in for former plain `LoGa3Timeout` const.
 * Reads current wait-scale factor on each access.
 */
export const LoGa3Timeout: { readonly [K in LoGa3TimeoutKey]: number } = new Proxy(
  LoGa3TimeoutBase as unknown as Record<LoGa3TimeoutKey, number>,
  {
    get(target, prop) {
      if (typeof prop !== 'string' || !(prop in LoGa3TimeoutBase)) {
        return undefined;
      }
      return scaleLoGa3TimeoutMs(target[prop as LoGa3TimeoutKey]);
    },
  }
) as { readonly [K in LoGa3TimeoutKey]: number };
