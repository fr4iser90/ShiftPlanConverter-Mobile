/**
 * LOGA3 tenant URL — per installation only (Settings / AsyncStorage).
 * Never from compiled app config.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const URL_KEY = 'loga3.baseUrl';

let urlOverride: string | null = null;
let hydrated = false;

export async function hydrateLoga3Env(): Promise<void> {
  if (hydrated) return;
  try {
    const stored = await AsyncStorage.getItem(URL_KEY);
    urlOverride = stored?.trim() || null;
  } catch {
    urlOverride = null;
  }
  hydrated = true;
}

/** Tenant URL from this device’s Settings (empty until configured). */
export function getLoga3BaseUrl(): string {
  return urlOverride?.trim() || '';
}

export async function setLoga3BaseUrl(url: string): Promise<void> {
  const next = String(url || '').trim();
  urlOverride = next || null;
  hydrated = true;
  if (next) await AsyncStorage.setItem(URL_KEY, next);
  else await AsyncStorage.removeItem(URL_KEY);
}
