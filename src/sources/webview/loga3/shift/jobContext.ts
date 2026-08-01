/**
 * Shared fetch-job context + helpers (one place — steps import this, not each other).
 */
import type { AutomationCommand, AutomationMessage } from '../shared/automation';
import { AutomationBridge } from '../../bridge';
import { waitForCondition } from '../../wait';
import { writeGateTrace } from './gateTrace';
import { t } from '@/src/i18n';
import { LoGa3Timeout as T } from '../shared/timeouts';
import type { FetchJobOptions, FetchStepTiming } from './fetchJobTypes';

export type { FetchJobOptions, FetchStepTiming, FetchJobResult } from './fetchJobTypes';

export type Ctx = FetchJobOptions & {
  sleep: (ms: number) => Promise<void>;
  gateIndex: number;
  gatePaths: string[];
  timings: FetchStepTiming[];
  jobT0: number;
};

export function status(opts: FetchJobOptions, line: string) {
  opts.onStatus?.(line);
}

export function ago(t0: number): string {
  return `${((Date.now() - t0) / 1000).toFixed(1)}s`;
}

export function run(ctx: Ctx, cmd: AutomationCommand, timeoutMs: number = T.run) {
  return ctx.bridge.run(ctx.inject, cmd, timeoutMs);
}

export function probe(ctx: Ctx, cmd: AutomationCommand, timeoutMs: number = T.probe) {
  return ctx.bridge.probe(ctx.inject, cmd, timeoutMs);
}

export async function softProbe(
  ctx: Ctx,
  cmd: AutomationCommand,
  timeoutMs: number = T.probe,
  quiet = false
): Promise<AutomationMessage> {
  try {
    return await probe(ctx, cmd, timeoutMs);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!quiet) status(ctx, t('fjProbeNoReply', { cmd: cmd.type }));
    return {
      ok: false,
      type: cmd.type,
      error: 'probe_timeout',
      code: 'PROBE_TIMEOUT',
      note: msg.slice(0, 160),
    };
  }
}

export async function gate(ctx: Ctx, name: string): Promise<void> {
  if (!ctx.gateTrace) return;
  const msg = await softProbe(ctx, { type: 'dumpLiveSelectors' }, T.softProbe, true);
  const path = await writeGateTrace(ctx.gateIndex++, {
    gate: name,
    at: new Date().toISOString(),
    pickerFound: msg.pickerFound,
    maskFound: msg.maskFound,
    oeffnenFound: msg.oeffnenFound,
    note: msg.note,
    sample: msg.sample,
    code: msg.code,
    error: msg.error,
  });
  if (path) ctx.gatePaths.push(path);
}

export function waitOpts(ctx: Ctx, label: string, timeoutMs: number, intervalMs = 600) {
  const limitSec = Math.round(timeoutMs / 1000);
  return {
    timeoutMs,
    intervalMs,
    label,
    delay: ctx.sleep,
    onWait: (elapsed: number) =>
      status(
        ctx,
        t('fjWaitTick', {
          label,
          seconds: Math.round(elapsed / 1000),
          limit: String(limitSec),
        })
      ),
  };
}

export async function timed<T>(ctx: Ctx, step: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  status(ctx, t('fjStepStart', { step, total: ago(ctx.jobT0) }));
  try {
    const out = await fn();
    const ms = Date.now() - t0;
    ctx.timings.push({ step, ms, at: new Date().toISOString() });
    status(ctx, t('fjStepDone', { step, ms, total: ago(ctx.jobT0) }));
    return out;
  } catch (e) {
    const ms = Date.now() - t0;
    ctx.timings.push({ step: `${step}:FAIL`, ms, at: new Date().toISOString() });
    status(ctx, t('fjStepFail', { step, ms, total: ago(ctx.jobT0) }));
    throw e;
  }
}

export { waitForCondition, T };
export type { AutomationBridge };
