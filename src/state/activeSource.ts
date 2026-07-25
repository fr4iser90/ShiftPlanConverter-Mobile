/**
 * User-selected Fetch source (`source.activeId`).
 * Falls back to pack `preferredSourceId` when unset.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSource } from '../sources';

const KEY = 'source.activeId';

export async function loadActiveSourceId(fallback: string): Promise<string> {
  try {
    const raw = (await AsyncStorage.getItem(KEY))?.trim();
    if (raw && getSource(raw)) return raw;
  } catch {
    // ignore
  }
  return fallback;
}

export async function saveActiveSourceId(id: string): Promise<string> {
  if (!getSource(id)) throw new Error(`Unknown source: ${id}`);
  await AsyncStorage.setItem(KEY, id);
  return id;
}

export async function clearActiveSourceId(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
