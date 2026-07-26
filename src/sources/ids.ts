/**
 * Known Fetch source ids — no native module imports.
 * Use this from Setup / activeSource so opening Setup does not load DocumentPicker/OCR/WebView.
 */
export const KNOWN_SOURCE_IDS = [
  'loga3-webview',
  'local-files',
  'camera-ocr',
] as const;

export type KnownSourceId = (typeof KNOWN_SOURCE_IDS)[number];

export function isKnownSourceId(id: string | null | undefined): id is KnownSourceId {
  return !!id && (KNOWN_SOURCE_IDS as readonly string[]).includes(id);
}
