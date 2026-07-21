import { getSnapshot, subscribe, type AppLocale } from '../state/store';
import { de } from './de';
import { en } from './en';

export type Messages = Record<keyof typeof de, string>;

const catalogs: Record<AppLocale, Messages> = { de: { ...de }, en };

export function t(key: keyof typeof de): string {
  const locale = getSnapshot().locale;
  return catalogs[locale][key] || catalogs.de[key] || String(key);
}

export function useT(): (key: keyof typeof de) => string {
  return t;
}

export { subscribe as subscribeLocale };
