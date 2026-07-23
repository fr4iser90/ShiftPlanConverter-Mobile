/**
 * QA / emulator smoke: apply setup via deep link (Unicode-safe).
 * loga3mobile://smoke-setup?url=...&user=...&pass=...&hospital=...&group=...&area=...&preset=...
 */
import * as Linking from 'expo-linking';

import { saveCredentials } from '../loga3/credentials';
import { setLoga3BaseUrl } from '../loga3/env';
import { setWorkplace } from '../state/store';
import {
  BUILTIN_AREA_ID,
  BUILTIN_GROUP_ID,
  BUILTIN_HOSPITAL_ID,
  BUILTIN_PRESET,
} from '../packs';

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
  if (!baseUrl || !user || !pass) {
    throw new Error('smoke-setup: url, user, pass required');
  }
  await setLoga3BaseUrl(baseUrl);
  await saveCredentials({ username: user, password: pass });
  await setWorkplace({
    hospitalId: String(one('hospital') || BUILTIN_HOSPITAL_ID),
    groupId: String(one('group') || BUILTIN_GROUP_ID),
    areaId: String(one('area') || BUILTIN_AREA_ID),
    preset: String(one('preset') || BUILTIN_PRESET),
  });
  return true;
}
