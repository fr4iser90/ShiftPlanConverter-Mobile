import { resolveStoredEntries } from '../../convert/pipeline';
import { getMappingForScope } from '../../packs';
import { getGoogleCalendarId, getSnapshot } from '../../state/store';
import { loadQuickPrefs } from '../../state/quickPrefs';
import { askRecreateGoogleCalendar } from '../askRecreateGoogleCalendar';
import { ensureGoogleSession, syncEntriesToGoogle } from '../google';
import type { ExportTarget, ExportTargetResult, ExportTargetSyncOpts } from './types';
import { t } from '../../i18n';

export const googleExportTarget: ExportTarget = {
  id: 'google',
  kind: 'oauth',
  labelKey: 'targetGoogle',

  async isConfigured() {
    return !!(await getGoogleCalendarId());
  },

  async isEnabledInQuickUpdate() {
    const prefs = await loadQuickPrefs();
    return prefs.syncCalendars;
  },

  async sync(entries, opts: ExportTargetSyncOpts = {}): Promise<ExportTargetResult> {
    const calId = await getGoogleCalendarId();
    if (!calId) {
      return { skipped: true, reason: t('fjSkipNoCalendar') };
    }
    if (!entries.length) {
      return { skipped: true, reason: t('fjSkipNoShifts') };
    }
    try {
      await ensureGoogleSession();
      const snap = getSnapshot();
      const mapping =
        snap.packId && snap.groupId && snap.areaId
          ? getMappingForScope(snap.packId, snap.groupId, snap.areaId) || undefined
          : undefined;
      const resolved = resolveStoredEntries(entries, {
        preset: snap.preset || undefined,
        mapping,
        userMappings: snap.userMappings,
      });
      const { created, deleted } = await syncEntriesToGoogle(resolved, calId, {
        eventFormat: opts.eventFormat ?? snap.eventFormat,
        onCalendarMissing: opts.onCalendarMissing ?? askRecreateGoogleCalendar,
        source: 'fetch',
        packColors: mapping?.colors || null,
      });
      return { skipped: false, created, deleted };
    } catch (e) {
      return {
        skipped: true,
        failed: true,
        reason: e instanceof Error ? e.message : String(e),
      };
    }
  },
};
