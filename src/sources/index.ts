import { loga3WebViewSource } from './loga3WebView';
import { localFilesSource } from './localFiles';
import type { Source } from './types';

export type { Source, SourceArtifact, SourceRunOpts, SourceRunResult } from './types';

const REGISTRY: Record<string, Source> = {
  [loga3WebViewSource.id]: loga3WebViewSource,
  [localFilesSource.id]: localFilesSource,
};

export function listSources(): Source[] {
  return Object.values(REGISTRY);
}

export function getSource(id: string | null | undefined): Source | null {
  if (!id) return null;
  return REGISTRY[id] || null;
}

export function requireSource(id: string): Source {
  const s = getSource(id);
  if (!s) throw new Error(`Unknown source: ${id}`);
  return s;
}

export { loga3WebViewSource, localFilesSource };
