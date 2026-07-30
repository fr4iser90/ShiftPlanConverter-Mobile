/**
 * User-selected Fetch source (`source.activeId`).
 * Falls back to pack `preferredSourceId` when unset; clamps to pack-supported sources.
 *
 * Does NOT import the Source registry (avoids loading DocumentPicker/OCR/WebView on Setup).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getPreferredSourceId,
  isSourceSupportedByPack,
  type PackConfig,
} from '../packs';
import { canonicalizeSourceId, isKnownSourceId, isLocalImportSourceId } from '../sources/ids';

const KEY = 'source.activeId';

export async function loadActiveSourceId(fallback: string): Promise<string> {
  try {
    const raw = (await AsyncStorage.getItem(KEY))?.trim();
    if (raw && isKnownSourceId(raw)) return canonicalizeSourceId(raw);
  } catch {
    // ignore
  }
  return canonicalizeSourceId(fallback);
}

/** Active source for this pack: stored id if still allowed, else pack preferred (and persist). */
export async function resolveActiveSourceId(
  pack: PackConfig | null | undefined
): Promise<string> {
  const preferred = getPreferredSourceId(pack);
  const active = await loadActiveSourceId(preferred);
  const normalized = canonicalizeSourceId(active);
  if (
    isKnownSourceId(normalized) &&
    (isSourceSupportedByPack(pack, normalized) ||
      (isLocalImportSourceId(normalized) &&
        (isSourceSupportedByPack(pack, 'local-files') ||
          isSourceSupportedByPack(pack, 'camera-ocr'))))
  ) {
    if (normalized !== active) await saveActiveSourceId(normalized);
    return normalized;
  }
  if (isKnownSourceId(preferred)) {
    const next = canonicalizeSourceId(preferred);
    await saveActiveSourceId(next);
    return next;
  }
  return canonicalizeSourceId(preferred);
}

export async function saveActiveSourceId(id: string): Promise<string> {
  const next = canonicalizeSourceId(id);
  if (!isKnownSourceId(next) && !isKnownSourceId(id)) {
    throw new Error(`Unknown source: ${id}`);
  }
  const store = isKnownSourceId(next) ? next : id;
  await AsyncStorage.setItem(KEY, store);
  return store;
}

export async function clearActiveSourceId(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
