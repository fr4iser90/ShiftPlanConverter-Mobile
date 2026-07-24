import { googleExportTarget } from './googleTarget';
import { icsExportTarget } from './icsTarget';
import type { ExportTarget, ExportTargetResult } from './types';

export type { ExportTarget, ExportTargetKind, ExportTargetResult, ExportTargetSyncOpts } from './types';

/** Built-in targets — add Outlook/CalDAV later as new modules. */
export const EXPORT_TARGETS: ExportTarget[] = [googleExportTarget, icsExportTarget];

export function getExportTarget(id: string): ExportTarget | undefined {
  return EXPORT_TARGETS.find((t) => t.id === id);
}

export async function listConfiguredOauthTargets(): Promise<ExportTarget[]> {
  const out: ExportTarget[] = [];
  for (const t of EXPORT_TARGETS) {
    if (t.kind !== 'oauth') continue;
    if (await t.isConfigured()) out.push(t);
  }
  return out;
}

export type TargetRunSummary = ExportTargetResult & { id: string };

/**
 * Run oauth targets enabled for one-tap that are configured.
 * File targets are not auto-run (caller may offer ICS separately).
 */
export async function runEnabledOauthTargets(
  entries: Parameters<ExportTarget['sync']>[0],
  opts?: Parameters<ExportTarget['sync']>[1] & {
    onStatus?: (line: string) => void;
  }
): Promise<TargetRunSummary[]> {
  const results: TargetRunSummary[] = [];
  for (const t of EXPORT_TARGETS) {
    if (t.kind !== 'oauth') continue;
    if (!(await t.isEnabledInQuickUpdate())) {
      results.push({ id: t.id, skipped: true, reason: 'in Einstellungen aus' });
      continue;
    }
    if (!(await t.isConfigured())) {
      results.push({ id: t.id, skipped: true, reason: 'nicht konfiguriert' });
      continue;
    }
    opts?.onStatus?.(`${t.id} sync…`);
    const r = await t.sync(entries, opts);
    results.push({ id: t.id, ...r });
  }
  return results;
}

/** True when no oauth target actually synced — good moment to offer ICS share. */
export function shouldOfferIcs(results: TargetRunSummary[]): boolean {
  const oauth = results.filter((r) => {
    const t = getExportTarget(r.id);
    return t?.kind === 'oauth';
  });
  if (!oauth.length) return true;
  return !oauth.some((r) => !r.skipped);
}
