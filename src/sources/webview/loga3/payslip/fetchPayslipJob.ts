import type { AutomationCommand, AutomationMessage } from '../shared/automation';
import { AutomationBridge } from '../../bridge';
import { extractTextFromPdfBuffer } from '@/src/convert/pdfText';
import { isLikelyPayslipText, parsePayslipText } from '@/src/convert/parsers/engines/pdf-payslip';
import type { PayslipDocument } from '@/src/payroll/types';
import { upsertPayslip } from '@/src/state/store';
import { base64ToArrayBuffer } from '../../pdfStore';
import { waitForCondition, WaitTimeoutError } from '../../wait';
import { pollAndroidDownloadsForPdf } from '../../androidDownloadPoll';
import { t } from '@/src/i18n';
import { appendDiag } from '@/src/support/diagLog';
import { MONTH_LABELS_DE } from '../shared/contentGate';
import { LoGa3Timeout as T } from '../shared/timeouts';

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

function run(ctx: Ctx, cmd: AutomationCommand, timeoutMs: number = T.run) {
  return ctx.bridge.run(ctx.inject, cmd, timeoutMs);
}

async function softProbe(
  ctx: Ctx,
  cmd: AutomationCommand,
  timeoutMs: number = T.probe
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
  const shellNow = await softProbe(ctx, { type: 'assertShellReady' }, T.softProbeQuick);
  if (shellNow.ok && !shellNow.stillLogin && !shellNow.splash) {
    status(ctx, t('fjAlreadyLoggedInShell'));
    return;
  }
  const pre = await softProbe(ctx, { type: 'assertLoggedIn' }, T.softProbe);
  if (pre.stillLogin || !pre.ok) {
    await waitForCondition(async () => {
      const st = await softProbe(ctx, { type: 'assertLoggedIn' }, T.softProbeShort);
      if (st.stillLogin) return true;
      return null;
    }, waitOpts(ctx, t('fjWaitLoginFormLabel'), T.waitLoginForm));
    await run(ctx, { type: 'fillLogin', username: ctx.username.trim(), password: ctx.password }, T.fillLogin);
    await run(ctx, { type: 'submitLogin' }, T.submitLogin);
  }
  await waitForCondition(async () => {
    const st = await softProbe(ctx, { type: 'assertShellReady' }, T.softProbeShort);
    if (st.code === 'BAD_CREDENTIALS') {
      throw Object.assign(new Error(t('fjBadCredentials')), { code: 'BAD_CREDENTIALS' });
    }
    if (st.code === 'PROBE_TIMEOUT' || st.stillLogin || st.splash) return null;
    if (st.ok) return true;
    return null;
  }, waitOpts(ctx, t('fjWaitShellLabel'), T.waitShell, 500));
  status(ctx, t('fjLoginOk'));
}

/** Dashboard → Private Cloud öffnen (einmal). */
async function ensureVerdienstOpen(ctx: Ctx): Promise<void> {
  status(ctx, t('payrollLoga3OpenVerdienst'));
  const already = await softProbe(ctx, { type: 'assertVerdienstContext' }, T.softProbeQuick);
  if (already.verdienstOpen) return;

  await waitForCondition(async () => {
    const sh = await softProbe(ctx, { type: 'assertShellReady' }, T.softProbeShort);
    if (sh.code === 'PROBE_TIMEOUT') return null;
    const v = await softProbe(ctx, { type: 'assertVerdienstContext' }, T.softProbeShort);
    if (v.verdienstOpen) return true;
    if (v.verdienstFound) return true;
    if (sh.ok) return true;
    return null;
  }, waitOpts(ctx, t('payrollLoga3WaitVerdienst'), T.waitShellOpen, 500));

  const ctx2 = await softProbe(ctx, { type: 'assertVerdienstContext' }, T.softProbeQuick);
  if (ctx2.verdienstOpen) return;

  await run(ctx, { type: 'clickVerdienstOeffnen' }, T.clickOeffnen);
  await waitForCondition(async () => {
    const v = await softProbe(ctx, { type: 'assertVerdienstContext' }, T.softProbeShort);
    if (v.code === 'PROBE_TIMEOUT') return null;
    if (v.verdienstOpen) return true;
    return null;
  }, waitOpts(ctx, t('payrollLoga3WaitVerdienstOpen'), T.waitPickerAfterOpen, 500));
}

/** Sidebar LMAGEDOK — Generierte Dokumente. */
async function ensureGenerierteDokumente(ctx: Ctx): Promise<void> {
  status(ctx, t('payrollLoga3Generierte'));
  const open = await softProbe(ctx, { type: 'assertGenerierteDokumente' }, T.softProbeQuick);
  if (open.generierteOpen) return;

  await run(ctx, { type: 'clickGenerierteDokumente' }, T.clickGenerierteDokumente);
  await waitForCondition(async () => {
    const st = await softProbe(ctx, { type: 'assertGenerierteDokumente' }, T.softProbeShort);
    if (st.code === 'PROBE_TIMEOUT') return null;
    if (st.generierteOpen) return true;
    return null;
  }, waitOpts(ctx, t('payrollLoga3WaitGenerierte'), T.waitGenerierteDokumente, 500));
}

/**
 * Navigate up with Zurück until docs root (no Zurück). Max depth 2 (month→year→root).
 * Waits between clicks for GWT; not a failed-action retry.
 */
async function ensureDocsRoot(ctx: Ctx): Promise<void> {
  for (let depth = 0; depth < 3; depth++) {
    const listing = await softProbe(
      ctx,
      { type: 'probeVerdienstListing', month: 1, year: ctx.year },
      T.softProbeShort
    );
    if (!listing.hasBack) return;
    status(ctx, t('payrollLoga3Back'));
    await run(ctx, { type: 'clickVerdienstBack' }, T.clickVerdienstBack);
    await ctx.sleep(700);
  }
  const still = await softProbe(
    ctx,
    { type: 'probeVerdienstListing', month: 1, year: ctx.year },
    T.softProbeShort
  );
  if (still.hasBack) {
    throw new Error(t('payrollLoga3NotAtRoot'));
  }
}

async function openMonthPath(ctx: Ctx, month: number, year: number): Promise<void> {
  const label = `${MONTH_LABELS_DE[month - 1] || month} ${year}`;
  status(ctx, t('payrollLoga3OpenDoc', { label, elapsed: ago(ctx.jobT0) }));

  const listing = await softProbe(
    ctx,
    { type: 'probeVerdienstListing', month, year },
    T.softProbe
  );

  if (listing.hasFile) {
    return;
  }

  if (listing.hasMonthFolder) {
    await run(ctx, { type: 'openVerdienstMonthFolder', month, year }, T.openVerdienstFolder);
  } else if (listing.hasYearFolder) {
    await run(ctx, { type: 'openVerdienstYearFolder', year }, T.openVerdienstFolder);
    await waitForCondition(async () => {
      const st = await softProbe(
        ctx,
        { type: 'probeVerdienstListing', month, year },
        T.softProbeShort
      );
      if (st.code === 'PROBE_TIMEOUT') return null;
      if (st.hasMonthFolder) return true;
      return null;
    }, waitOpts(ctx, t('payrollLoga3WaitMonthFolder', { label }), T.waitVerdienstFolder, 500));
    await run(ctx, { type: 'openVerdienstMonthFolder', month, year }, T.openVerdienstFolder);
  } else {
    const probe = await softProbe(
      ctx,
      { type: 'probeVerdienstListing', month, year },
      T.softProbe
    );
    const sample = probe.sample ? ` [${probe.sample}]` : '';
    throw new Error(t('payrollLoga3MonthMissing', { label }) + sample);
  }

  await waitForCondition(async () => {
    const st = await softProbe(ctx, { type: 'assertVerdienstFileReady' }, T.softProbeShort);
    if (st.code === 'PROBE_TIMEOUT') return null;
    if (st.hasFile || st.ok) return true;
    return null;
  }, waitOpts(ctx, t('payrollLoga3WaitFile', { label }), T.waitVerdienstFile, 500));
}

async function capturePdf(ctx: Ctx, label: string): Promise<{ base64: string; size?: number }> {
  const downloadSince = Date.now();
  try {
    await run(ctx, { type: 'armPdfCapture', ms: T.armPdfCaptureMs }, T.closePopups);
  } catch {
    // optional arm
  }
  await run(ctx, { type: 'clickVerdienstPdfDownload' }, T.clickVerdienstPdfDownload);

  const pdfPromise = ctx.bridge.waitForPdf(T.waitPdf);
  const pollPromise = (async () => {
    const polled = await pollAndroidDownloadsForPdf({
      sinceMs: downloadSince,
      timeoutMs: T.waitPdf,
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
 * One path: login → Private Cloud öffnen → Generierte Dokumente →
 * Monat(/Jahr)-Ordner → ic-download PDF.
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
    await ensureGenerierteDokumente(ctx);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    appendDiag(`payslipFetch login/open: ${msg}`);
    return { imported, errors: [msg] };
  }

  for (const month of opts.months) {
    const label = `${MONTH_LABELS_DE[month - 1] || month}/${opts.year}`;
    try {
      await ensureDocsRoot(ctx);
      await openMonthPath(ctx, month, opts.year);
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
        await run(ctx, { type: 'leavePdfViewer' }, T.leavePdfViewer);
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
      break;
    }
  }

  return { imported, errors };
}
