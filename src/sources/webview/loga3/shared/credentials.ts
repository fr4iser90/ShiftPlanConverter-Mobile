import * as SecureStore from 'expo-secure-store';

import { getSnapshot } from '@/src/state/store';

export type Loga3Credentials = {
  username: string;
  password: string;
};

function userKey(workplaceId: string) {
  return `loga3.cred.${workplaceId}.username`;
}
function passKey(workplaceId: string) {
  return `loga3.cred.${workplaceId}.password`;
}

function activeWorkplaceId(): string {
  return getSnapshot().activeWorkplaceId || '';
}

/**
 * LOGA3 login — only from Secure Store (saved in Setup).
 * Never from compiled app config / .env (that would leak into APKs).
 * Scoped per workplace profile.
 */
export async function loadCredentials(
  workplaceId?: string | null
): Promise<Loga3Credentials | null> {
  const id = workplaceId || activeWorkplaceId();
  if (!id) return null;
  try {
    const username = await SecureStore.getItemAsync(userKey(id));
    const password = await SecureStore.getItemAsync(passKey(id));
    if (username && password) return { username, password };
  } catch {
    // ignore
  }
  return null;
}

export async function saveCredentials(
  creds: Loga3Credentials,
  workplaceId?: string | null
): Promise<void> {
  const id = workplaceId || activeWorkplaceId();
  if (!id) {
    throw new Error('LOGA3 credentials need an active workplace profile');
  }
  await SecureStore.setItemAsync(userKey(id), creds.username);
  await SecureStore.setItemAsync(passKey(id), creds.password);
}

export async function clearCredentials(workplaceId?: string | null): Promise<void> {
  const id = workplaceId || activeWorkplaceId();
  if (!id) return;
  await SecureStore.deleteItemAsync(userKey(id));
  await SecureStore.deleteItemAsync(passKey(id));
}

export async function clearCredentialsForWorkplace(workplaceId: string): Promise<void> {
  await SecureStore.deleteItemAsync(userKey(workplaceId));
  await SecureStore.deleteItemAsync(passKey(workplaceId));
}

export async function clearAllCredentials(workplaceIds: string[]): Promise<void> {
  await Promise.all(workplaceIds.map((id) => clearCredentialsForWorkplace(id)));
}
