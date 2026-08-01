import { t } from '../i18n';
import { loadCredentials } from '../sources/webview/loga3/shared/credentials';
import { getLoga3BaseUrl, hydrateLoga3Env, isValidLoga3BaseUrl } from '../sources/webview/loga3/shared/env';
import { resolveActiveSourceId } from '../state/activeSource';
import { getSnapshot, hydrateStore, isWorkplaceConfigured } from '../state/store';
import { defaultLabelForPack } from '../state/workplaces';
import { getPackById } from '../packs';
import { getSourceMeta } from '../sources/meta';

export type SetupStatus = {
  urlOk: boolean;
  credentialsOk: boolean;
  workplaceOk: boolean;
  /** Tenant URL + login present (LOGA3 portal ready). */
  loga3Ready: boolean;
  /** True when workplace is set and the active source's requirements are met. */
  complete: boolean;
  /** Workplace ok — enough for local file import / OCR without LOGA3 login. */
  workplaceReady: boolean;
  /** User-selected or pack-default source id (clamped to pack-supported). */
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
  const loga3Ready = urlOk && credentialsOk;
  const snap = getSnapshot();
  const workplaceOk = isWorkplaceConfigured(snap);
  const pack = snap.packId ? getPackById(snap.packId) : null;
  const preferredSourceId = await resolveActiveSourceId(pack);
  const source = getSourceMeta(preferredSourceId);
  const sourceReady = source
    ? (!source.needsCredentials || credentialsOk) &&
      (!source.needsWebView || urlOk)
    : false;
  const group = pack?.groups.find((g) => g.id === snap.groupId);
  const area = group?.areas.find((a) => a.id === snap.areaId);
  const summary = workplaceOk
    ? defaultLabelForPack(snap.packId, pack?.name, area?.label, snap.preset)
    : '';
  return {
    urlOk,
    credentialsOk,
    workplaceOk,
    loga3Ready,
    workplaceReady: workplaceOk,
    preferredSourceId,
    complete: workplaceOk && sourceReady,
    summary,
  };
}

/** Short status line for Settings hub / setup screen. */
export function formatSetupStatusMeta(st: SetupStatus): string {
  if (!st.workplaceReady) return t('setupIncompleteWorkplace');
  if (st.complete && st.loga3Ready) {
    return `${t('setupComplete')}: ${st.summary}`;
  }
  if (st.complete) {
    return `${t('setupComplete')}: ${st.summary}`;
  }
  // Pack set, but active source still needs LOGA3 (or incomplete portal).
  if (!st.loga3Ready) {
    return `${t('setupReadyImport')}${st.summary ? ` · ${st.summary}` : ''}`;
  }
  return `${t('setupComplete')}: ${st.summary}`;
}
