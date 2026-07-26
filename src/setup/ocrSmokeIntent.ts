/**
 * Dev/e2e: run camera-OCR on a fixed image URI without the gallery picker.
 * shiftplan://ocr-smoke?uri=file:///…&layout=month-matrix
 *
 * Do not use /sdcard/Download — Android blocks it (EACCES). Prefer app-private
 * file:// under /data/user/0/com.fr4iser.shiftplan/…
 */
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type OcrSmokeIntent = {
  uri: string;
  layoutId: string;
};

const KEY = 'ocr.smokeIntent.v1';
/** Last initialURL we already consumed — stops Metro reload re-firing the same stuck intent. */
const LAST_INITIAL_KEY = 'ocr.smokeLastInitialUrl.v1';
let memory: OcrSmokeIntent | null = null;

export function isOcrSmokeUrl(url: string): boolean {
  return /ocr-smoke/i.test(String(url || ''));
}

/** Shared Download/ paths are not readable by the app on modern Android. */
export function isBlockedOcrSmokeUri(uri: string): boolean {
  const u = String(uri || '');
  return /\/sdcard\/Download\//i.test(u) || /\/storage\/emulated\/\d+\/Download\//i.test(u);
}

export async function setOcrSmokeIntent(intent: OcrSmokeIntent | null): Promise<void> {
  memory = intent;
  if (!intent) {
    await AsyncStorage.removeItem(KEY);
    return;
  }
  await AsyncStorage.setItem(KEY, JSON.stringify(intent));
}

export async function takeOcrSmokeIntent(): Promise<OcrSmokeIntent | null> {
  if (memory) {
    const v = memory;
    memory = null;
    await AsyncStorage.removeItem(KEY);
    return v;
  }
  try {
    const raw = await AsyncStorage.getItem(KEY);
    await AsyncStorage.removeItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as OcrSmokeIntent;
  } catch {
    return null;
  }
}

/** Non-destructive peek (for deciding whether to poll). */
export async function peekOcrSmokeIntent(): Promise<OcrSmokeIntent | null> {
  if (memory) return memory;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as OcrSmokeIntent;
  } catch {
    return null;
  }
}

export async function clearOcrSmokeState(): Promise<void> {
  memory = null;
  await AsyncStorage.multiRemove([KEY, LAST_INITIAL_KEY]);
}

/**
 * @param fromInitialURL — true for Linking.getInitialURL (dedupe stuck Android intents)
 */
export async function applyOcrSmokeFromUrl(
  url: string,
  opts?: { fromInitialURL?: boolean }
): Promise<void> {
  if (opts?.fromInitialURL) {
    const last = (await AsyncStorage.getItem(LAST_INITIAL_KEY)) || '';
    if (last && last === url) {
      // Same deep link as last time (common after Metro reload) — do not re-run OCR.
      return;
    }
  }

  const parsed = Linking.parse(url);
  const q = parsed.queryParams || {};
  const uriRaw = q.uri;
  const layoutRaw = q.layout;
  const uri = String(Array.isArray(uriRaw) ? uriRaw[0] : uriRaw || '').trim();
  const layoutId = String(Array.isArray(layoutRaw) ? layoutRaw[0] : layoutRaw || 'month-matrix').trim();
  if (!uri) throw new Error('ocr-smoke: uri required');

  if (isBlockedOcrSmokeUri(uri)) {
    // eslint-disable-next-line no-console
    console.warn(
      '[ocr-smoke] refusing /sdcard/Download path (EACCES). Use app-private files/ URI.'
    );
    await setOcrSmokeIntent(null);
    if (opts?.fromInitialURL) {
      await AsyncStorage.setItem(LAST_INITIAL_KEY, url);
    }
    return;
  }

  await setOcrSmokeIntent({ uri, layoutId: layoutId || 'month-matrix' });
  if (opts?.fromInitialURL) {
    await AsyncStorage.setItem(LAST_INITIAL_KEY, url);
  }
}
