/**
 * One-shot intent for emulator matrix. Persisted so Metro reload / Holen mount
 * still sees autofetch after smoke deep-link.
 */
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type SmokeFetchIntent = {
  months: number[];
  year: number;
  autofetch: boolean;
};

const KEY = 'loga3.smokeFetchIntent.v1';
const STATUS_KEY = 'loga3.matrixStatus.v1';

let memory: SmokeFetchIntent | null = null;

export async function setSmokeFetchIntent(intent: SmokeFetchIntent | null): Promise<void> {
  memory = intent;
  if (!intent) {
    await AsyncStorage.removeItem(KEY);
    return;
  }
  await AsyncStorage.setItem(KEY, JSON.stringify(intent));
}

export async function peekSmokeFetchIntent(): Promise<SmokeFetchIntent | null> {
  if (memory) return memory;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    memory = JSON.parse(raw) as SmokeFetchIntent;
    return memory;
  } catch {
    return null;
  }
}

/** Consume intent (clears storage). */
export async function takeSmokeFetchIntent(): Promise<SmokeFetchIntent | null> {
  const v = await peekSmokeFetchIntent();
  memory = null;
  await AsyncStorage.removeItem(KEY);
  return v;
}

/** Durable status for matrix runner (survives logcat flakiness). */
export async function setMatrixStatus(line: string): Promise<void> {
  await AsyncStorage.setItem(STATUS_KEY, `${Date.now()}|${line}`);
  // eslint-disable-next-line no-console
  console.warn(line);
  try {
    const dirs = [FileSystem.cacheDirectory, FileSystem.documentDirectory].filter(Boolean) as string[];
    for (const dir of dirs) {
      try {
        await FileSystem.writeAsStringAsync(`${dir}matrix-status.txt`, line, {
          encoding: FileSystem.EncodingType.UTF8,
        });
      } catch {
        // try next
      }
    }
  } catch {
    // ignore — logcat / AsyncStorage still set
  }
}

export async function getMatrixStatus(): Promise<string | null> {
  return AsyncStorage.getItem(STATUS_KEY);
}

export async function clearMatrixStatus(): Promise<void> {
  await AsyncStorage.removeItem(STATUS_KEY);
}
