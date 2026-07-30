import type { AutomationCommand, AutomationMessage } from './automation';
import { AutomationBridge } from '../bridge';
import { extractTextFromPdfBuffer } from '../../../convert/pdfText';
import { isLikelyPayslipText, parsePayslipText } from '../../../convert/parsers/engines/pdf-payslip';
import type { PayslipDocument } from '../../../payroll/types';
import { upsertPayslip } from '../../../state/store';
import { base64ToArrayBuffer } from '../pdfStore';
import { waitForCondition, WaitTimeoutError } from '../wait';
import { pollAndroidDownloadsForPdf } from '../androidDownloadPoll';
import { t } from '../../../i18n';
import { appendDiag } from '../../../support/diagLog';
import { MONTH_LABELS_DE } from './contentGate';

export type PayslipFetchOptions = {
  username: string;
  password: string;
  months: number[];
  year: number;
  workplaceId?: string;
  inject: (cmd: AutomationCommand) => void;
  bridge: AutomationBridge;
  onStatus?: (line: string) => void;
  delay?: (ms: number) => Promise<void>;
};

export type PayslipFetchResult = {
  imported: PayslipDocument[];
  errors: string[];
};

type Ctx = PayslipFetchOptions & {
  sleep: (ms: number) => Promise<void>;
  jobT0: number;
};

function status(opts: PayslipFetchOptions, line: string) {
  opts.onStatus?.(line);
}

function ago(t0: number): string {
  return `${((Date.now() - t0) / 1000).toFixed(1)}s`;
}

function run(ctx: Ctx, cmd: AutomationCommand, timeoutMs = 25000) {
  return ctx.bridge.run(ctx.inject, cmd, timeoutMs);
}

async function softProbe(
  ctx: Ctx,
  cmd: AutomationCommand,
  timeoutMs = 20000
): Promise<AutomationMessage> {
  try {
    return await ctx.bridge.probe(ctx.inject, cmd, timeoutMs);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      type: cmd.type,
      error: 'probe_timeout',
      code: 'PROBE_TIMEOUT',
      note: msg.slice(0, 160),
    };
  }
}

function waitOpts(ctx: Ctx, label: string, timeoutMs: number, intervalMs = 600) {
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
          limit: String(Math.round(timeoutMs / 1000)),
        })
      ),
  };
}

async function ensureLoggedIn(ctx: Ctx): Promise<void> {
  status(ctx, t('fjLogin'));
  const shellNow = await softProbe(ctx, { type: 'assertShellReady' }, 5000);
  if (shellNow.ok && !shellNow.stillLogin && !shellNow.splash) {
    status(ctx, t('fjAlreadyLoggedInShell'));
    return;
  }
  const pre = await softProbe(ctx, { type: 'assertLoggedIn' }, 8000);
  if (pre.stillLogin || !pre.ok) {
    await waitForCondition(async () => {
      const st = await softProbe(ctx, { type: 'assertLoggedIn' }, 2500);
      if (st.stillLogin) return true;
      return null;
    }, waitOpts(ctx, t('fjWaitLoginFormLabel'), 45000));
    await run(ctx, { type: 'fillLogin', username: ctx.username.trim(), password: ctx.password }, 20000);
    await run(ctx, { type: 'submitLogin' }, 15000);
  }
  await waitForCondition(async () => {
    const st = await softProbe(ctx, { type: 'assertShellReady' }, 2500);
    if (st.code === 'BAD_CREDENTIALS') {
      throw Object.assign(new Error(t('fjBadCredentials')), { code: 'BAD_CREDENTIALS' });
    }
    if (st.code === 'PROBE_TIMEOUT' || st.stillLogin || st.splash) return null;
    if (st.ok) return true;
    return null;
  }, waitOpts(ctx, t('fjWaitShellLabel'), 75000, 500));
  status(ctx, t('fjLoginOk'));
}

async function ensureVerdienstOpen(ctx: Ctx): Promise<void> {
  status(ctx, t('payrollLoga3OpenVerdienst'));
  const already = await softProbe(ctx, { type: 'assertVerdienstContext' }, 5000);
  if (already.verdienstOpen) return;

  await waitForCondition(async () => {
    const sh = await softProbe(ctx, { type: 'assertShellReady' }, 2500);
    if (sh.code === 'PROBE_TIMEOUT') return null;
    const v = await softProbe(ctx, { type: 'assertVerdienstContext' }, 2500);
    if (v.verdienstOpen) return true;
    if (v.verdienstFound) return true;
    if (sh.ok) return true;
    return null;
  }, waitOpts(ctx, t('payrollLoga3WaitVerdienst'), 45000, 500));

  const ctx2 = await softProbe(ctx, { type: 'assertVerdienstContext' }, 5000);
  if (ctx2.verdienstOpen) return;

  await run(ctx, { type: 'clickVerdienstOeffnen' }, 12000);
  await waitForCondition(async () => {
    const v = await softProbe(ctx, { type: 'assertVerdienstContext' }, 2500);
    if (v.code === 'PROBE_TIMEOUT') return null;
    if (v.verdienstOpen) return true;
    return null;
  }, waitOpts(ctx, t('payrollLoga3WaitVerdienstOpen'), 60000, 500));
}

async function capturePdf(ctx: Ctx, label: string): Promise<{ base64: string; size?: number }> {
  const downloadSince = Date.now();
  try {
    await run(ctx, { type: 'armPdfCapture', ms: 45000 }, 5000);
  } catch {
    // optional
  }
  try {
    await run(ctx, { type: 'clickDownload' }, 15000);
  } catch {
    throw new Error(t('fjDownloadNotClickable'));
  }

  const pdfPromise = ctx.bridge.waitForPdf(90000);
  const pollPromise = (async () => {
    const polled = await pollAndroidDownloadsForPdf({
      sinceMs: downloadSince,
      timeoutMs: 90000,
      intervalMs: 500,
    });
    if (polled.kind === 'login_html') throw new Error(t('fjPdfLoginHtml'));
    if (polled.kind !== 'pdf') throw new Error(t('fjNoPdfInDownloads'));
    return {
      base64: polled.pdf.base64,
      size: polled.pdf.size,
    };
  })();

  const pdf = await Promise.any([pdfPromise, pollPromise]);
  if (!pdf.base64 || pdf.base64.length < 64 || !pdf.base64.startsWith('JVBERi')) {
    throw new Error(t('fjPdfEmpty'));
  }
  status(ctx, t('payrollLoga3PdfOk', { label, size: String(pdf.size || '?') }));
  return pdf;
}

/**
 * One path: login → Personal Cloud / Verdienstnachweis öffnen → document → PDF.
 * No retries. Fail loud if portal UI differs.
 */
export async function runPayslipFetchJob(
  opts: PayslipFetchOptions
): Promise<PayslipFetchResult> {
  const sleep = opts.delay || ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const ctx: Ctx = { ...opts, sleep, jobT0: Date.now() };
  const imported: PayslipDocument[] = [];
  const errors: string[] = [];

  try {
    await ensureLoggedIn(ctx);
    await ensureVerdienstOpen(ctx);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    appendDiag(`payslipFetch login/open: ${msg}`);
    return { imported, errors: [msg] };
  }

  for (const month of opts.months) {
    const label = `${MONTH_LABELS_DE[month - 1] || month}/${opts.year}`;
    try {
      status(ctx, t('payrollLoga3OpenDoc', { label, elapsed: ago(ctx.jobT0) }));
      await run(ctx, { type: 'openVerdienstDocument', month, year: opts.year }, 15000);

      // Dialog may already show Herunterladen; else wait briefly
      await sleep(800);
      const pdf = await capturePdf(ctx, label);
      const buf = base64ToArrayBuffer(pdf.base64);
      const text = await extractTextFromPdfBuffer(buf);
      if (!isLikelyPayslipText(text)) {
        throw new Error(t('payrollNotPayslipPdf', { name: label }));
      }
      const doc = parsePayslipText(text, {
        workplaceId: opts.workplaceId,
        source: 'loga3',
      });
      await upsertPayslip(doc);
      imported.push(doc);
      status(ctx, t('payrollLoga3Imported', { month: doc.payMonth }));

      try {
        await run(ctx, { type: 'leavePdfViewer' }, 3000);
      } catch {
        // ignore
      }
      try {
        await run(ctx, { type: 'closeDialog' }, 4000);
      } catch {
        // ignore
      }
      try {
        await run(ctx, { type: 'closePopups' }, 3000);
      } catch {
        // ignore
      }
    } catch (e) {
      const msg =
        e instanceof WaitTimeoutError
          ? e.message
          : e instanceof Error
            ? e.message
            : String(e);
      appendDiag(`payslipFetch ${label}: ${msg}`);
      errors.push(`${label}: ${msg}`);
      // One path — stop on first month failure (no retry loop)
      break;
    }
  }

  return { imported, errors };
}
