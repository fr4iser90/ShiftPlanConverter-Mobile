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
  for (const target of EXPORT_TARGETS) {
    if (target.kind !== 'oauth') continue;
    if (await target.isConfigured()) out.push(target);
  }
  return out;
}

/** True when one-tap will actually sync ≥1 connected oauth calendar (Google / Outlook / …). */
export async function anyOauthTargetWillQuickSync(): Promise<boolean> {
  for (const target of EXPORT_TARGETS) {
    if (target.kind !== 'oauth') continue;
    if (!(await target.isEnabledInQuickUpdate())) continue;
    if (!(await target.isConfigured())) continue;
    return true;
  }
  return false;
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
  for (const target of EXPORT_TARGETS) {
    if (target.kind !== 'oauth') continue;
    if (!(await target.isEnabledInQuickUpdate())) continue;
    // Pref on but no calendar → silent skip (don't pretend Sync ran / failed).
    if (!(await target.isConfigured())) continue;
    opts?.onStatus?.(`${target.id} sync…`);
    const r = await target.sync(entries, opts);
    results.push({ id: target.id, ...r });
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
