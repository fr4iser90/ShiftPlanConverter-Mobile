import AsyncStorage from '@react-native-async-storage/async-storage';

import type { PayrollTarifPrefs } from './types';

const KEY = 'loga3.payrollTarif';

function storageKey(workplaceId: string): string {
  return `${KEY}.${workplaceId || 'default'}`;
}

export async function loadTarifPrefs(workplaceId: string): Promise<PayrollTarifPrefs> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(workplaceId));
    if (!raw) return {};
    return JSON.parse(raw) as PayrollTarifPrefs;
  } catch {
    return {};
  }
}

export async function saveTarifPrefs(
  workplaceId: string,
  prefs: PayrollTarifPrefs
): Promise<void> {
  await AsyncStorage.setItem(storageKey(workplaceId), JSON.stringify(prefs));
}
