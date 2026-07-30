/**
 * Known Fetch source ids — no native module imports.
 * Use this from Setup / activeSource so opening Setup does not load DocumentPicker/OCR/WebView.
 *
 * UI: `local-files` is the merged “Datei & Foto” chip (PDF/CSV/ICS + OCR).
 * `camera-ocr` remains a valid id for tests / legacy storage; UI normalizes it to `local-files`.
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

/** File import and photo OCR share one Import chip. */
export function isLocalImportSourceId(id: string | null | undefined): boolean {
  return id === 'local-files' || id === 'camera-ocr';
}

/** Persist / show as local-files when either local path is selected. */
export function canonicalizeSourceId(id: string): string {
  return id === 'camera-ocr' ? 'local-files' : id;
}

/**
 * Chip order for Import: collapse local-files + camera-ocr to one id.
 * Keeps first occurrence position of the local-import group.
 */
export function collapseSourceIdsForChips(ids: readonly string[]): string[] {
  const out: string[] = [];
  let sawLocalImport = false;
  for (const id of ids) {
    if (isLocalImportSourceId(id)) {
      if (sawLocalImport) continue;
      sawLocalImport = true;
      out.push('local-files');
      continue;
    }
    out.push(id);
  }
  return out;
}
