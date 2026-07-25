/**
 * QA / emulator smoke: apply setup via deep link (Unicode-safe).
 * shiftplan://smoke-setup?url=...&user=...&pass=...&hospital=...&group=...&area=...&preset=...
 *
 * Credential seeding is __DEV__-only — release/preview APKs ignore pass= deep links.
 */
import * as Linking from 'expo-linking';

import { saveCredentials } from '../sources/loga3/credentials';
import { isValidLoga3BaseUrl, setLoga3BaseUrl } from '../sources/loga3/env';
import { setWorkplace } from '../state/store';
import {
  BUILTIN_AREA_ID,
  BUILTIN_GROUP_ID,
  BUILTIN_HOSPITAL_ID,
  BUILTIN_PRESET,
} from '../packs';
import { setSmokeFetchIntent, clearMatrixStatus, setMatrixStatus } from './smokeFetchIntent';

/** Release builds never accept credential deep-links. */
export function isSmokeCredentialSeedAllowed(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__;
}

export function isSmokeSetupUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  if (/smoke-setup/i.test(url)) return true;
  try {
    const parsed = Linking.parse(url);
    const q = parsed.queryParams || {};
    const smoke = q.smoke;
    const flag = Array.isArray(smoke) ? smoke[0] : smoke;
    return flag === '1' || flag === 'true';
  } catch {
    return false;
  }
}

export async function applySmokeSetupFromUrl(url: string): Promise<boolean> {
  if (!isSmokeSetupUrl(url)) return false;
  const parsed = Linking.parse(url);
  const q = (parsed.queryParams || {}) as Record<string, string | string[] | undefined>;
  const one = (k: string) => {
    const v = q[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const baseUrl = String(one('url') || '').trim();
  const user = String(one('user') || '').trim();
  const pass = String(one('pass') || '');
  const monthsRaw = String(one('months') || '').trim();
  const yearRaw = String(one('year') || '').trim();
  const autofetch = /^(1|true)$/i.test(String(one('autofetch') || ''));
  const wantsCreds = !!(baseUrl || user || pass);

  // Intent-only: months/autofetch without overwriting credentials
  if (!wantsCreds && (monthsRaw || autofetch)) {
    const months = monthsRaw
      ? monthsRaw
          .split(/[,;\s]+/)
          .map((s) => parseInt(s, 10))
          .filter((n) => n >= 1 && n <= 12)
      : [new Date().getMonth() + 1];
    const year = yearRaw ? parseInt(yearRaw, 10) : new Date().getFullYear();
    await setSmokeFetchIntent({
      months: months.length ? months : [new Date().getMonth() + 1],
      year: Number.isFinite(year) ? year : new Date().getFullYear(),
      autofetch,
    });
    await clearMatrixStatus();
    const intentLine = `MATRIX_INTENT_SET months=${months.join(',')} year=${year} autofetch=${autofetch}`;
    // eslint-disable-next-line no-console
    console.warn(intentLine);
    await setMatrixStatus(intentLine);
    return true;
  }

  if (!isSmokeCredentialSeedAllowed()) {
    throw new Error('smoke-setup credentials disabled in release builds');
  }

  if (!baseUrl || !user || !pass) {
    throw new Error('smoke-setup: url, user, pass required');
  }
  if (!isValidLoga3BaseUrl(baseUrl)) {
    throw new Error('smoke-setup: url must be https://…');
  }
  await setLoga3BaseUrl(baseUrl);
  await saveCredentials({ username: user, password: pass });
  await setWorkplace({
    hospitalId: String(one('hospital') || BUILTIN_HOSPITAL_ID),
    groupId: String(one('group') || BUILTIN_GROUP_ID),
    areaId: String(one('area') || BUILTIN_AREA_ID),
    preset: String(one('preset') || BUILTIN_PRESET),
  });

  if (monthsRaw || autofetch) {
    const months = monthsRaw
      ? monthsRaw
          .split(/[,;\s]+/)
          .map((s) => parseInt(s, 10))
          .filter((n) => n >= 1 && n <= 12)
      : [new Date().getMonth() + 1];
    const year = yearRaw ? parseInt(yearRaw, 10) : new Date().getFullYear();
    await setSmokeFetchIntent({
      months: months.length ? months : [new Date().getMonth() + 1],
      year: Number.isFinite(year) ? year : new Date().getFullYear(),
      autofetch,
    });
    await clearMatrixStatus();
    const intentLine = `MATRIX_INTENT_SET months=${months.join(',')} year=${year} autofetch=${autofetch}`;
    // eslint-disable-next-line no-console
    console.warn(intentLine);
    await setMatrixStatus(intentLine);
  }

  return true;
}
