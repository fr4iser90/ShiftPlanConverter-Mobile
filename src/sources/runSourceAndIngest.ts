import { ingestArtifacts } from '../ingest/ingestArtifacts';
import type { AutomationCommand } from './webview/loga3/automation';
import type { AutomationBridge } from './webview/bridge';
import { getPackById } from '../packs';
import { resolveActiveSourceId } from '../state/activeSource';
import { getSnapshot } from '../state/store';
import { requireSource } from './index';
import type { SourceArtifact, SourceCredentials, SourcePeriod } from './types';
import type { IngestResult } from '../ingest/ingestArtifacts';

export type RunSourceIngestOpts = {
  sourceId?: string;
  period?: SourcePeriod;
  credentials?: SourceCredentials;
  host?: {
    inject: (cmd: AutomationCommand) => void;
    bridge: AutomationBridge;
  };
  onStatus?: (line: string) => void;
  replaceEntries?: boolean;
  preserveOutsideMonths?: boolean;
  gateTrace?: boolean;
  delay?: (ms: number) => Promise<void>;
};

export type RunSourceIngestResult = IngestResult & {
  artifacts: SourceArtifact[];
  errors: string[];
  sourceId: string;
};

/**
 * Preferred entry: Source.run → ingestArtifacts (store + widgets).
 */
export async function runSourceAndIngest(
  opts: RunSourceIngestOpts
): Promise<RunSourceIngestResult> {
  const snap = getSnapshot();
  const pack = snap.hospitalId ? getPackById(snap.hospitalId) : null;
  const sourceId = opts.sourceId || (await resolveActiveSourceId(pack));
  const source = requireSource(sourceId);

  if (source.needsCredentials && (!opts.credentials?.username || !opts.credentials?.password)) {
    throw new Error('Credentials required for this source');
  }
  if (source.needsWebView && !opts.host) {
    throw new Error('WebView host required for this source');
  }

  const run = await source.run({
    period: opts.period,
    credentials: opts.credentials,
    host: opts.host
      ? {
          inject: opts.host.inject as (cmd: unknown) => void,
          bridge: opts.host.bridge as never,
        }
      : undefined,
    onStatus: opts.onStatus ? (p) => opts.onStatus!(p.line) : undefined,
    delay: opts.delay,
    replaceEntries: opts.replaceEntries,
    preserveOutsideMonths: opts.preserveOutsideMonths,
    gateTrace: opts.gateTrace,
  });

  const errors = [...run.errors];

  if (!run.artifacts.length) {
    if (errors.length) throw new Error(errors.join(' · '));
    return {
      entries: [],
      summaries: [],
      texts: [],
      savedPdfs: [],
      skippedNoPlan: [],
      artifacts: [],
      errors,
      sourceId,
    };
  }

  const ingested = await ingestArtifacts(run.artifacts, {
    replaceEntries: opts.replaceEntries,
    preserveOutsideMonths: opts.preserveOutsideMonths,
    onStatus: opts.onStatus,
  });

  if (!ingested.entries.length && !ingested.skippedNoPlan.length && errors.length) {
    throw new Error(errors.join(' · '));
  }

  return {
    ...ingested,
    artifacts: run.artifacts,
    errors,
    sourceId,
  };
}

export async function resolveDefaultSourceId(): Promise<string> {
  const snap = getSnapshot();
  const pack = snap.hospitalId ? getPackById(snap.hospitalId) : null;
  return resolveActiveSourceId(pack);
}
