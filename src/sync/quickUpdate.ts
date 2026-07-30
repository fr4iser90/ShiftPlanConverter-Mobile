import type { AutomationCommand } from '../sources/webview/loga3/automation';
import { AutomationBridge } from '../sources/webview/bridge';
import { resolveStoredEntries } from '../convert/pipeline';
import { getMappingForScope } from '../packs';
import { getSnapshot } from '../state/store';
import { loadQuickPrefs, type QuickUpdatePrefs } from '../state/quickPrefs';
import { runSourceAndIngest } from '../sources/runSourceAndIngest';
import {
  runEnabledOauthTargets,
  shouldOfferIcs,
  type TargetRunSummary,
} from './targets';
import {
  buildMonthWindow,
  formatMonthWindow,
  groupMonthsByYear,
  type YearMonth,
} from './monthWindow';
import { t } from '../i18n';
import type { ShiftEntry } from '../convert/types';

export type QuickUpdateFetchResult = {
  entries: ShiftEntry[];
  texts: string[];
  savedPdfs: string[];
  skippedNoPlan: string[];
  errors: string[];
  artifactsCount: number;
};

export type QuickUpdateResult = {
  window: YearMonth[];
  windowLabel: string;
  fetch: QuickUpdateFetchResult;
  targets: TargetRunSummary[];
  offerIcs: boolean;
};

/**
 * Fetch a month window (Settings default or explicit selection), then run enabled oauth targets.
 */
export async function runQuickUpdate(opts: {
  username: string;
  password: string;
  bridge: AutomationBridge;
  inject: (cmd: AutomationCommand) => void;
  onStatus?: (line: string) => void;
  prefs?: QuickUpdatePrefs;
  now?: Date;
  /** If set, fetch these months instead of the Settings window. */
  months?: YearMonth[];
  onCalendarMissing?: NonNullable<Parameters<typeof runEnabledOauthTargets>[1]>['onCalendarMissing'];
}): Promise<QuickUpdateResult> {
  const prefs = opts.prefs || (await loadQuickPrefs());
  const window =
    opts.months && opts.months.length
      ? opts.months
      : buildMonthWindow(prefs.prevMonths, prefs.nextMonths, opts.now);
  const windowLabel = formatMonthWindow(window);
  opts.onStatus?.(t('fjQuickWindow', { label: windowLabel }));

  const groups = groupMonthsByYear(window);
  const merged: QuickUpdateFetchResult = {
    entries: [],
    texts: [],
    savedPdfs: [],
    skippedNoPlan: [],
    errors: [],
    artifactsCount: 0,
  };

  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    opts.onStatus?.(
      t('fjQuickFetchYear', {
        months: g.months.map((m) => String(m).padStart(2, '0')).join(','),
        year: String(g.year),
      })
    );
    try {
      const part = await runSourceAndIngest({
        sourceId: 'loga3-webview',
        credentials: { username: opts.username, password: opts.password },
        period: { months: g.months, year: g.year },
        host: { bridge: opts.bridge, inject: opts.inject },
        onStatus: opts.onStatus,
        preserveOutsideMonths: true,
        replaceEntries: false,
      });
      merged.texts.push(...part.texts);
      merged.savedPdfs.push(...part.savedPdfs);
      merged.skippedNoPlan.push(...part.skippedNoPlan);
      merged.errors.push(...part.errors);
      merged.artifactsCount += part.artifacts.length;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      merged.errors.push(`${g.year}: ${msg}`);
      opts.onStatus?.(t('fjQuickYearError', { year: String(g.year), msg }));
    }
  }

  const snap = getSnapshot();
  merged.entries = snap.entries;

  const mapping =
    snap.packId && snap.groupId && snap.areaId
      ? getMappingForScope(snap.packId, snap.groupId, snap.areaId) || undefined
      : undefined;
  const entries = resolveStoredEntries(snap.entries, {
    preset: snap.preset || undefined,
    mapping,
    userMappings: snap.userMappings,
  });

  const targets = await runEnabledOauthTargets(entries, {
    eventFormat: snap.eventFormat,
    onStatus: opts.onStatus,
    onCalendarMissing: opts.onCalendarMissing,
  });

  const offerIcs = prefs.offerIcsAfterFetch && shouldOfferIcs(targets) && entries.length > 0;

  return { window, windowLabel, fetch: merged, targets, offerIcs };
}
