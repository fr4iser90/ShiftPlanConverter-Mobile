import { loadCredentials } from '../sources/loga3/credentials';
import { getLoga3BaseUrl, hydrateLoga3Env, isValidLoga3BaseUrl } from '../sources/loga3/env';
import { loadActiveSourceId } from '../state/activeSource';
import { getSnapshot, hydrateStore, isWorkplaceConfigured } from '../state/store';
import { getPackById, getPreferredSourceId } from '../packs';
import { getSource } from '../sources';

export type SetupStatus = {
  urlOk: boolean;
  credentialsOk: boolean;
  workplaceOk: boolean;
  /** True when workplace is set and the active source's requirements are met. */
  complete: boolean;
  /** Workplace ok — enough for local file import without LOGA3 login. */
  workplaceReady: boolean;
  /** User-selected or pack-default source id. */
  preferredSourceId: string;
  /** Short label for Fetch header when configured */
  summary: string;
};

export async function getSetupStatus(): Promise<SetupStatus> {
  await Promise.all([hydrateLoga3Env(), hydrateStore()]);
  const url = getLoga3BaseUrl().trim();
  const urlOk = isValidLoga3BaseUrl(url);
  const creds = await loadCredentials();
  const credentialsOk = !!(creds?.username && creds?.password);
  const snap = getSnapshot();
  const workplaceOk = isWorkplaceConfigured(snap);
  const pack = snap.hospitalId ? getPackById(snap.hospitalId) : null;
  const preferredSourceId = await loadActiveSourceId(getPreferredSourceId(pack));
  const source = getSource(preferredSourceId);
  const sourceReady = source
    ? (!source.needsCredentials || credentialsOk) &&
      (!source.needsWebView || urlOk)
    : urlOk && credentialsOk;
  const parts = [pack?.name, snap.preset].filter(Boolean);
  return {
    urlOk,
    credentialsOk,
    workplaceOk,
    workplaceReady: workplaceOk,
    preferredSourceId,
    complete: workplaceOk && sourceReady,
    summary: parts.length ? parts.join(' · ') : '',
  };
}
