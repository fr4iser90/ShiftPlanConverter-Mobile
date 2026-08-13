/**
 * LOGA3 fetch wait patience — Settings → Import → LOGA3-Wartezeit.
 * Multiplies `LoGa3TimeoutBase` (Normal ×1, Sehr langsam ×2).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  setLoGa3WaitScaleFactor,
  type LoGa3TimeoutKey,
} from './timeouts';

const KEY = 'loga3.waitPatience';

export type LoGa3WaitPatience = 'normal' | 'verySlow';

export const LOGA3_WAIT_SCALE: Record<LoGa3WaitPatience, number> = {
  normal: 1,
  verySlow: 2,
};

export const DEFAULT_WAIT_PATIENCE: LoGa3WaitPatience = 'normal';

export function isLoGa3WaitPatience(v: unknown): v is LoGa3WaitPatience {
  return v === 'normal' || v === 'verySlow';
}

export function normalizeWaitPatience(
  raw: unknown
): LoGa3WaitPatience {
  return isLoGa3WaitPatience(raw) ? raw : DEFAULT_WAIT_PATIENCE;
}

function applyPatience(patience: LoGa3WaitPatience): void {
  setLoGa3WaitScaleFactor(LOGA3_WAIT_SCALE[patience]);
}

export async function hydrateLoGa3WaitPatience(): Promise<LoGa3WaitPatience> {
  const patience = await loadWaitPatience();
  applyPatience(patience);
  return patience;
}

export async function loadWaitPatience(): Promise<LoGa3WaitPatience> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return normalizeWaitPatience(raw);
  } catch {
    return DEFAULT_WAIT_PATIENCE;
  }
}

export async function saveWaitPatience(
  patience: LoGa3WaitPatience
): Promise<LoGa3WaitPatience> {
  const next = normalizeWaitPatience(patience);
  applyPatience(next);
  await AsyncStorage.setItem(KEY, next);
  return next;
}

export async function clearWaitPatience(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
  applyPatience(DEFAULT_WAIT_PATIENCE);
}

/** Test/helper: scaled ms for a named budget under a given patience. */
export function scaledBudgetMs(
  key: LoGa3TimeoutKey,
  patience: LoGa3WaitPatience,
  base: Record<LoGa3TimeoutKey, number>
): number {
  return Math.round(base[key] * LOGA3_WAIT_SCALE[patience]);
}
