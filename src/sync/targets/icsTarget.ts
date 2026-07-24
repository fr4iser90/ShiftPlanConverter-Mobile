import { getSnapshot } from '../../state/store';
import { shareIcsFile } from '../shareIcs';
import type { ExportTarget, ExportTargetResult, ExportTargetSyncOpts } from './types';
import { t } from '../../i18n';

/** File-based target — always “configured”; sync opens the system share sheet. */
export const icsExportTarget: ExportTarget = {
  id: 'ics',
  kind: 'file',
  labelKey: 'targetIcs',

  async isConfigured() {
    return true;
  },

  async isEnabledInQuickUpdate() {
    return false; // never auto-run in one-tap; offered after fetch instead
  },

  async sync(entries, opts: ExportTargetSyncOpts = {}): Promise<ExportTargetResult> {
    if (!entries.length) {
      return { skipped: true, reason: t('fjSkipNoShifts') };
    }
    if (opts.interactive === false) {
      return { skipped: true, reason: t('fjSkipIcsManual') };
    }
    try {
      const snap = getSnapshot();
      await shareIcsFile(entries, { richDetails: opts.richDetails ?? snap.richDetails });
      return { skipped: false, created: entries.length };
    } catch (e) {
      return { skipped: true, reason: e instanceof Error ? e.message : String(e) };
    }
  },
};
