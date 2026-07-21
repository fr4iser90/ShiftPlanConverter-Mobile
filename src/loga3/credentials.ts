import * as SecureStore from 'expo-secure-store';

const USER_KEY = 'loga3.username';
const PASS_KEY = 'loga3.password';

export type Loga3Credentials = {
  username: string;
  password: string;
};

export async function loadCredentials(): Promise<Loga3Credentials | null> {
  try {
    const username = await SecureStore.getItemAsync(USER_KEY);
    const password = await SecureStore.getItemAsync(PASS_KEY);
    if (!username || !password) return null;
    return { username, password };
  } catch {
    return null;
  }
}

export async function saveCredentials(creds: Loga3Credentials): Promise<void> {
  await SecureStore.setItemAsync(USER_KEY, creds.username);
  await SecureStore.setItemAsync(PASS_KEY, creds.password);
}

export async function clearCredentials(): Promise<void> {
  await SecureStore.deleteItemAsync(USER_KEY);
  await SecureStore.deleteItemAsync(PASS_KEY);
}
