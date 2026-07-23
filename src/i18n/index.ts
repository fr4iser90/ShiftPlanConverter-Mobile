import { getSnapshot, subscribe, type AppLocale } from '../state/store';
import { de } from './de';
import { en } from './en';

export type Messages = Record<keyof typeof de, string>;

const catalogs: Record<AppLocale, Messages> = { de: { ...de }, en };

export function t(
  key: keyof typeof de,
  vars?: Record<string, string | number>
): string {
  const locale = getSnapshot().locale;
  let s = catalogs[locale][key] || catalogs.de[key] || String(key);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replaceAll(`{${k}}`, String(v));
    }
  }
  return s;
}

export function useT(): typeof t {
  return t;
}

export { subscribe as subscribeLocale };
