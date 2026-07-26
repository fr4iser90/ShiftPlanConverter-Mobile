/**
 * Remember OCR misspellings → corrected name (Settings “Mein Name”).
 * Next scan: same OCR garbage maps back to your spelling automatically.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'ocr.nameAliases.v1';

export function normalizeAliasKey(s: string): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function loadOcrNameAliases(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function rememberOcrNameAlias(
  ocrLabel: string,
  correctedLabel: string
): Promise<void> {
  const from = normalizeAliasKey(ocrLabel);
  const to = String(correctedLabel || '').replace(/\s+/g, ' ').trim();
  if (!from || !to) return;
  if (from === normalizeAliasKey(to)) return;
  const map = await loadOcrNameAliases();
  map[from] = to;
  // Cap growth — keep newest keys by rewriting whole map size
  const entries = Object.entries(map);
  const trimmed =
    entries.length > 80 ? Object.fromEntries(entries.slice(entries.length - 80)) : map;
  await AsyncStorage.setItem(KEY, JSON.stringify(trimmed));
}

export async function clearOcrNameAliases(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
