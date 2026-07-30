/**
 * LOGA3 tenant URL — per workplace profile (Settings / AsyncStorage).
 * Never from compiled app config. HTTPS only (no cleartext login).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { getSnapshot } from '../../../state/store';

function urlKey(workplaceId: string) {
  return `loga3.baseUrl.${workplaceId}`;
}

/** In-memory cache per workplace (active profile reads from here). */
const urlByWorkplace = new Map<string, string>();

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

function activeWorkplaceId(): string {
  return getSnapshot().activeWorkplaceId || '';
}

export async function hydrateLoga3Env(): Promise<void> {
  await hydrateLoga3EnvForActiveWorkplace();
}

/** Reload in-memory URL for the current active workplace profile. */
export async function hydrateLoga3EnvForActiveWorkplace(): Promise<void> {
  const id = activeWorkplaceId();
  if (!id) return;
  try {
    const scoped = await AsyncStorage.getItem(urlKey(id));
    const next = scoped?.trim() || '';
    if (next && isValidLoga3BaseUrl(next)) urlByWorkplace.set(id, next);
    else {
      urlByWorkplace.delete(id);
      if (next) await AsyncStorage.removeItem(urlKey(id));
    }
  } catch {
    urlByWorkplace.delete(id);
  }
}

/** Tenant URL for the active workplace (empty until configured). */
export function getLoga3BaseUrl(): string {
  const id = activeWorkplaceId();
  if (!id) return '';
  return urlByWorkplace.get(id)?.trim() || '';
}

export async function setLoga3BaseUrl(
  url: string,
  workplaceId?: string | null
): Promise<void> {
  const next = String(url || '').trim();
  if (next && !isValidLoga3BaseUrl(next)) {
    throw new Error('LOGA3 URL must start with https://');
  }
  const id = workplaceId || activeWorkplaceId();
  if (!id) {
    throw new Error('LOGA3 URL needs an active workplace profile');
  }
  if (next) {
    urlByWorkplace.set(id, next);
    await AsyncStorage.setItem(urlKey(id), next);
  } else {
    urlByWorkplace.delete(id);
    await AsyncStorage.removeItem(urlKey(id));
  }
}

export async function clearLoga3BaseUrlForWorkplace(workplaceId: string): Promise<void> {
  urlByWorkplace.delete(workplaceId);
  await AsyncStorage.removeItem(urlKey(workplaceId));
}

export async function clearAllLoga3BaseUrls(workplaceIds: string[]): Promise<void> {
  for (const id of workplaceIds) urlByWorkplace.delete(id);
  await Promise.all(workplaceIds.map((id) => AsyncStorage.removeItem(urlKey(id))));
}
