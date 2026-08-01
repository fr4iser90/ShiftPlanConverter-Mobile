/**
 * LOGA3 WebView automation types + month labels.
 * German/LOGA3 labels in commands match the live portal — not app i18n.
 */

import { getLoga3BaseUrl } from './env';

/** @deprecated use getLoga3BaseUrl() — value changes after Settings hydrate */
export function getLoga3LoginUrl(): string {
  return getLoga3BaseUrl();
}

export function requireLoga3Url(): string {
  const url = getLoga3BaseUrl();
  if (!url) {
    throw new Error(
      'LOGA3 URL missing. Set it in Settings (per install) — not baked into the app build.'
    );
  }
  return url;
}

export const MONTH_LABELS = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
] as const;

export type CoreAutomationCommand =
  | { type: 'fillLogin'; username: string; password: string }
  | { type: 'submitLogin' }
  | { type: 'assertLoggedIn' }
  | { type: 'assertShellReady' }
  | { type: 'probeReady' }
  | { type: 'armPdfCapture'; ms?: number }
  | { type: 'probeDialog' }
  | { type: 'clickDownload' }
  | { type: 'scrapePdfViewer' }
  | { type: 'leavePdfViewer' }
  | { type: 'closeDialog' }
  | { type: 'closePopups' }
  | { type: 'stubStatus' };

export type ShiftAutomationCommand =
  | { type: 'getPickerState' }
  | { type: 'getContentSignature' }
  | { type: 'verifyCalendarMonth'; month: number; year: number }
  | { type: 'clickBerechnen' }
  | { type: 'getDialogAbrechnungsmonat' }
  | { type: 'isZeitprotokollDialogVisible' }
  | { type: 'clickOeffnen' }
  | { type: 'clickZeiten' }
  | { type: 'armCalendarReload' }
  | { type: 'selectMonth'; month: number; year: number }
  | { type: 'assertHasPlan' }
  | { type: 'clickSmartEdin' }
  | { type: 'clickExport' }
  | { type: 'openZeitprotokoll' }
  | { type: 'assertExportContext' }
  | { type: 'dumpLiveSelectors' };

export type PayslipAutomationCommand =
  | { type: 'clickVerdienstOeffnen' }
  | { type: 'assertVerdienstContext' }
  | { type: 'openVerdienstDocument'; month?: number; year?: number };

export type AutomationCommand =
  | CoreAutomationCommand
  | ShiftAutomationCommand
  | PayslipAutomationCommand;

export type AutomationMessage = {
  ok?: boolean;
  type?: string;
  error?: string;
  code?: string;
  href?: string;
  title?: string;
  hasZeitprotokoll?: boolean;
  sample?: string;
  note?: string;
  stillLogin?: boolean;
  /** LOGA3 boot splash / loading tiles still visible */
  splash?: boolean;
  zeitenFound?: boolean;
  /** Desktop entry: div.LG-Button[aria-label="öffnen"] */
  oeffnenFound?: boolean;
  pickerFound?: boolean;
  /** [data-uin="mask-LZWZEITD"] personal Zeitdaten mask */
  maskFound?: boolean;
  /** SmartThings Export menu item visible */
  exportPanel?: boolean;
  /** Zeitprotokoll generieren tile (LAGSDZPG) visible */
  lagsdzpg?: boolean;
  /** Personal Cloud / Verdienstnachweis öffnen visible or opened */
  verdienstFound?: boolean;
  verdienstOpen?: boolean;
  target?: string;
  month?: string | null;
  year?: string | null;
  label?: string | null;
  selected?: boolean;
  hasPlan?: boolean;
  base64?: string;
  mime?: string;
  size?: number;
  filename?: string;
  /** Content signature / gate */
  signature?: {
    key?: string;
    gridKey?: string;
    bookingsLabel?: string | null;
    firstWeekday?: string | null;
    lastDay?: string | null;
    dayCount?: number;
    schichtfrei?: number;
    ranges?: string[];
    geKo?: string[];
    sample?: string;
  };
  reason?: string;
  dialogVisible?: boolean;
  monthToken?: string | null;
  dialogYear?: string | null;
  dialogSource?: string;
};
