import { loga3WebViewSource } from './loga3WebView';
import { localFilesSource } from './localFiles';
import { cameraOcrSource } from './cameraOcr';
import type { Source } from './types';
import {
  getSupportedSourceIds,
  type PackConfig,
} from '../packs';
import { canonicalizeSourceId, collapseSourceIdsForChips, isLocalImportSourceId } from './ids';

export type { Source, SourceArtifact, SourceRunOpts, SourceRunResult } from './types';

const REGISTRY: Record<string, Source> = {
  [loga3WebViewSource.id]: loga3WebViewSource,
  [localFilesSource.id]: localFilesSource,
  [cameraOcrSource.id]: cameraOcrSource,
};

export function listSources(): Source[] {
  return Object.values(REGISTRY);
}

/**
 * Import chips for the current employer pack.
 * `local-files` + `camera-ocr` collapse to one “Datei & Foto” chip.
 */
export function listSourcesForPack(pack: PackConfig | null | undefined): Source[] {
  return collapseSourceIdsForChips(getSupportedSourceIds(pack))
    .map((id) => REGISTRY[id])
    .filter((s): s is Source => !!s);
}

export function getSource(id: string | null | undefined): Source | null {
  if (!id) return null;
  return REGISTRY[id] || REGISTRY[canonicalizeSourceId(id)] || null;
}

export function requireSource(id: string): Source {
  const s = getSource(id);
  if (!s) throw new Error(`Unknown source: ${id}`);
  return s;
}

export { loga3WebViewSource, localFilesSource, cameraOcrSource };
