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
import { isKnownSourceId } from '../sources/ids';

const KEY = 'source.activeId';

export async function loadActiveSourceId(fallback: string): Promise<string> {
  try {
    const raw = (await AsyncStorage.getItem(KEY))?.trim();
    if (raw && isKnownSourceId(raw)) return raw;
  } catch {
    // ignore
  }
  return fallback;
}

/** Active source for this pack: stored id if still allowed, else pack preferred (and persist). */
export async function resolveActiveSourceId(
  pack: PackConfig | null | undefined
): Promise<string> {
  const preferred = getPreferredSourceId(pack);
  const active = await loadActiveSourceId(preferred);
  if (isKnownSourceId(active) && isSourceSupportedByPack(pack, active)) return active;
  if (isKnownSourceId(preferred)) {
    await saveActiveSourceId(preferred);
    return preferred;
  }
  return preferred;
}

export async function saveActiveSourceId(id: string): Promise<string> {
  if (!isKnownSourceId(id)) throw new Error(`Unknown source: ${id}`);
  await AsyncStorage.setItem(KEY, id);
  return id;
}

export async function clearActiveSourceId(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
