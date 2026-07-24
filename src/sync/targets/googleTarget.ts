import { resolveStoredEntries } from '../../convert/pipeline';
import { getMappingForScope } from '../../packs';
import { getGoogleCalendarId, getSnapshot } from '../../state/store';
import { loadQuickPrefs } from '../../state/quickPrefs';
import { ensureGoogleSession, syncEntriesToGoogle } from '../google';
import type { ExportTarget, ExportTargetResult, ExportTargetSyncOpts } from './types';

export const googleExportTarget: ExportTarget = {
  id: 'google',
  kind: 'oauth',
  labelKey: 'targetGoogle',

  async isConfigured() {
    return !!(await getGoogleCalendarId());
  },

  async isEnabledInQuickUpdate() {
    const prefs = await loadQuickPrefs();
    return prefs.syncGoogle;
  },

  async sync(entries, opts: ExportTargetSyncOpts = {}): Promise<ExportTargetResult> {
    const calId = await getGoogleCalendarId();
    if (!calId) {
      return { skipped: true, reason: 'kein Kalender gewählt (Setup/Export)' };
    }
    if (!entries.length) {
      return { skipped: true, reason: 'keine Schichten' };
    }
    try {
      await ensureGoogleSession();
      const snap = getSnapshot();
      const mapping =
        snap.hospitalId && snap.groupId && snap.areaId
          ? getMappingForScope(snap.hospitalId, snap.groupId, snap.areaId) || undefined
          : undefined;
      const resolved = resolveStoredEntries(entries, {
        preset: snap.preset || undefined,
        mapping,
        userMappings: snap.userMappings,
      });
      const { created, deleted } = await syncEntriesToGoogle(resolved, calId, {
        richDetails: opts.richDetails ?? snap.richDetails,
      });
      return { skipped: false, created, deleted };
    } catch (e) {
      return { skipped: true, reason: e instanceof Error ? e.message : String(e) };
    }
  },
};
