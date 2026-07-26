/**
 * Lightweight source flags for Setup / status — no native plugin imports.
 */
import { isKnownSourceId, type KnownSourceId } from './ids';

export type SourceMeta = {
  needsCredentials: boolean;
  needsWebView: boolean;
};

const META: Record<KnownSourceId, SourceMeta> = {
  'loga3-webview': { needsCredentials: true, needsWebView: true },
  'local-files': { needsCredentials: false, needsWebView: false },
  'camera-ocr': { needsCredentials: false, needsWebView: false },
};

export function getSourceMeta(id: string | null | undefined): SourceMeta | null {
  if (!isKnownSourceId(id)) return null;
  return META[id];
}
