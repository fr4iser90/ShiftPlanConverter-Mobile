/**
 * Shared WebView source primitives (site plugins import from here).
 * LOGA3-specific automation stays under `src/sources/loga3/`.
 */
export { AutomationBridge } from './bridge';
export { waitForCondition, WaitTimeoutError } from './wait';
export type { WaitForOptions } from './wait';
export { pollAndroidDownloadsForPdf } from './androidDownloadPoll';
export type { PolledPdf } from './androidDownloadPoll';
export {
  savePdfBytes,
  savePdfBase64,
  deletePdfFile,
  deleteAllPdfFiles,
  readPdfBase64,
  base64ToArrayBuffer,
  periodFilename,
} from './pdfStore';
