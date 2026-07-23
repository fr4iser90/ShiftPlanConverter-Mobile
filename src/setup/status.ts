import { loadCredentials } from '../loga3/credentials';
import { getLoga3BaseUrl, hydrateLoga3Env } from '../loga3/env';
import { getSnapshot, hydrateStore, isWorkplaceConfigured } from '../state/store';
import { getPackById } from '../packs';

export type SetupStatus = {
  urlOk: boolean;
  credentialsOk: boolean;
  workplaceOk: boolean;
  complete: boolean;
  /** Short label for Holen header when configured */
  summary: string;
};

export async function getSetupStatus(): Promise<SetupStatus> {
  await Promise.all([hydrateLoga3Env(), hydrateStore()]);
  const urlOk = !!getLoga3BaseUrl().trim();
  const creds = await loadCredentials();
  const credentialsOk = !!(creds?.username && creds?.password);
  const snap = getSnapshot();
  const workplaceOk = isWorkplaceConfigured(snap);
  const pack = snap.hospitalId ? getPackById(snap.hospitalId) : null;
  const parts = [
    pack?.name,
    snap.preset,
  ].filter(Boolean);
  return {
    urlOk,
    credentialsOk,
    workplaceOk,
    complete: urlOk && credentialsOk && workplaceOk,
    summary: parts.length ? parts.join(' · ') : '',
  };
}
