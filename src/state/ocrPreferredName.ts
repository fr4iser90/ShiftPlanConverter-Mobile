/**
 * Persist preferred roster name for OCR auto-match (`ocr.preferredRosterName`).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'ocr.preferredRosterName';

export async function loadOcrPreferredName(): Promise<string | null> {
  try {
    const raw = (await AsyncStorage.getItem(KEY))?.trim();
    return raw || null;
  } catch {
    return null;
  }
}

export async function saveOcrPreferredName(name: string): Promise<void> {
  const v = String(name || '').trim();
  if (!v) {
    await AsyncStorage.removeItem(KEY);
    return;
  }
  await AsyncStorage.setItem(KEY, v);
}

export async function clearOcrPreferredName(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
