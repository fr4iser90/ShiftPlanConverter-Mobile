/**
 * Persist selected OCR layout (`ocr.activeLayoutId`).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_OCR_LAYOUT_ID,
  getOcrLayout,
  type OcrLayoutId,
} from '../sources/ocr/layouts';

const KEY = 'ocr.activeLayoutId';

export async function loadOcrLayoutId(
  fallback: OcrLayoutId = DEFAULT_OCR_LAYOUT_ID
): Promise<OcrLayoutId> {
  try {
    const raw = (await AsyncStorage.getItem(KEY))?.trim();
    if (raw && getOcrLayout(raw)) return raw as OcrLayoutId;
  } catch {
    // ignore
  }
  return fallback;
}

export async function saveOcrLayoutId(id: string): Promise<OcrLayoutId> {
  if (!getOcrLayout(id)) throw new Error(`Unknown OCR layout: ${id}`);
  await AsyncStorage.setItem(KEY, id);
  return id as OcrLayoutId;
}

export async function clearOcrLayoutId(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
