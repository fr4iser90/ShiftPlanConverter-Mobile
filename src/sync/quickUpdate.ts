import type { AutomationCommand } from '../loga3/automation';
import { AutomationBridge } from '../loga3/bridge';
import { runFetchJob, type FetchJobResult } from '../loga3/fetchJob';
import { resolveStoredEntries } from '../convert/pipeline';
import { getMappingForScope } from '../packs';
import { getGoogleCalendarId, getSnapshot } from '../state/store';
import { loadQuickPrefs, type QuickUpdatePrefs } from '../state/quickPrefs';
import { ensureGoogleSession, syncEntriesToGoogle } from './google';
import {
  buildMonthWindow,
  formatMonthWindow,
  groupMonthsByYear,
  type YearMonth,
} from './monthWindow';

export type QuickUpdateResult = {
  window: YearMonth[];
  windowLabel: string;
  fetch: FetchJobResult;
  google: { skipped: boolean; reason?: string; created?: number; deleted?: number };
};

/**
 * One-tap: fetch configurable month window, optionally Google-sync.
 */
export async function runQuickUpdate(opts: {
  username: string;
  password: string;
  bridge: AutomationBridge;
  inject: (cmd: AutomationCommand) => void;
  onStatus?: (line: string) => void;
  prefs?: QuickUpdatePrefs;
  now?: Date;
}): Promise<QuickUpdateResult> {
  const prefs = opts.prefs || (await loadQuickPrefs());
  const window = buildMonthWindow(prefs.prevMonths, prefs.nextMonths, opts.now);
  const windowLabel = formatMonthWindow(window);
  opts.onStatus?.(`Fenster: ${windowLabel}`);

  const groups = groupMonthsByYear(window);
  const merged: FetchJobResult = {
    entries: [],
    texts: [],
    savedPdfs: [],
    skippedNoPlan: [],
    errors: [],
    summaries: [],
  };

  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    opts.onStatus?.(
      `Fetch ${g.months.map((m) => String(m).padStart(2, '0')).join(',')}/${g.year}…`
    );
    try {
      const part = await runFetchJob({
        username: opts.username,
        password: opts.password,
        months: g.months,
        year: g.year,
        bridge: opts.bridge,
        inject: opts.inject,
        onStatus: opts.onStatus,
        preserveOutsideMonths: true,
        replaceEntries: false,
      });
      merged.texts.push(...part.texts);
      merged.savedPdfs.push(...part.savedPdfs);
      merged.skippedNoPlan.push(...part.skippedNoPlan);
      merged.errors.push(...part.errors);
      merged.summaries.push(...part.summaries);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      merged.errors.push(`${g.year}: ${msg}`);
      opts.onStatus?.(`Jahr ${g.year}: ${msg}`);
    }
  }

  const snap = getSnapshot();
  merged.entries = snap.entries;

  const google: QuickUpdateResult['google'] = { skipped: true, reason: 'aus' };
  if (!prefs.syncGoogle) {
    google.reason = 'in Einstellungen aus';
  } else {
    const calId = await getGoogleCalendarId();
    if (!calId) {
      google.reason = 'kein Kalender gewählt (Setup/Export)';
    } else {
      try {
        opts.onStatus?.('Google verbinden…');
        await ensureGoogleSession();
        opts.onStatus?.('Google Calendar sync…');
        const mapping =
          snap.hospitalId && snap.groupId && snap.areaId
            ? getMappingForScope(snap.hospitalId, snap.groupId, snap.areaId) || undefined
            : undefined;
        const entries = resolveStoredEntries(snap.entries, {
          preset: snap.preset || undefined,
          mapping,
          userMappings: snap.userMappings,
        });
        const { created, deleted } = await syncEntriesToGoogle(entries, calId, {
          richDetails: snap.richDetails,
        });
        google.skipped = false;
        google.created = created;
        google.deleted = deleted;
        google.reason = undefined;
      } catch (e) {
        google.skipped = true;
        google.reason = e instanceof Error ? e.message : String(e);
      }
    }
  }

  return { window, windowLabel, fetch: merged, google };
}
