/**
 * Prüfung → Import: preselect Zeitprotokoll month(s), no autofetch.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ImportMonthIntent = {
  months: number[];
  year: number;
};

const KEY = 'loga3.importMonthIntent.v1';

let memory: ImportMonthIntent | null = null;

export async function setImportMonthIntent(intent: ImportMonthIntent | null): Promise<void> {
  memory = intent;
  if (!intent) {
    await AsyncStorage.removeItem(KEY);
    return;
  }
  await AsyncStorage.setItem(KEY, JSON.stringify(intent));
}

export async function peekImportMonthIntent(): Promise<ImportMonthIntent | null> {
  if (memory) return memory;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    memory = JSON.parse(raw) as ImportMonthIntent;
    return memory;
  } catch {
    return null;
  }
}

/** Consume intent (clears storage). */
export async function takeImportMonthIntent(): Promise<ImportMonthIntent | null> {
  const v = await peekImportMonthIntent();
  memory = null;
  await AsyncStorage.removeItem(KEY);
  return v;
}
