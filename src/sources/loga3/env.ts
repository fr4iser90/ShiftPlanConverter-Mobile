/**
 * LOGA3 tenant URL — per installation only (Settings / AsyncStorage).
 * Never from compiled app config. HTTPS only (no cleartext login).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const URL_KEY = 'loga3.baseUrl';

let urlOverride: string | null = null;
let hydrated = false;

/** Accept only https://… tenant URLs (reject http/cleartext). */
export function isValidLoga3BaseUrl(url: string): boolean {
  const next = String(url || '').trim();
  if (!/^https:\/\//i.test(next)) return false;
  try {
    const u = new URL(next);
    return u.protocol === 'https:' && !!u.hostname;
  } catch {
    return false;
  }
}

export async function hydrateLoga3Env(): Promise<void> {
  if (hydrated) return;
  try {
    const stored = await AsyncStorage.getItem(URL_KEY);
    const next = stored?.trim() || null;
    // Drop legacy http:// tenants so setup forces HTTPS.
    urlOverride = next && isValidLoga3BaseUrl(next) ? next : null;
    if (next && !urlOverride) await AsyncStorage.removeItem(URL_KEY);
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
  if (next && !isValidLoga3BaseUrl(next)) {
    throw new Error('LOGA3 URL must start with https://');
  }
  urlOverride = next || null;
  hydrated = true;
  if (next) await AsyncStorage.setItem(URL_KEY, next);
  else await AsyncStorage.removeItem(URL_KEY);
}
