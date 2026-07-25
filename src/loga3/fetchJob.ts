import type { AutomationCommand, AutomationMessage } from './automation';
import { AutomationBridge } from './bridge';
import { anonymizeDienstplanText } from '../convert/anonymize';
import { convertPdfText } from '../convert/pipeline';
import { extractTextFromPdfBuffer } from '../convert/pdfText';
import type { MonthSummary, ShiftEntry } from '../convert/types';
import { MONTH_LABELS_DE, validatePdfPeriod } from './contentGate';
import { base64ToArrayBuffer, savePdfBytes } from './pdfStore';
import { getSnapshot, setEntries } from '../state/store';
import { markSuccessfulFetch } from '../schedule/prefs';
import { refreshHomeWidgets } from '../widget/refresh';
import { getMappingForScope } from '../packs';
import { waitForCondition, WaitTimeoutError } from './wait';
import { clearGateTraces, writeGateTrace } from './gateTrace';
import { t } from '../i18n';

export type FetchJobOptions = {
  username: string;
  password: string;
  months: number[];
  year: number;
  inject: (cmd: AutomationCommand) => void;
  bridge: AutomationBridge;
  onStatus?: (line: string) => void;
  /** true: wipe all stored entries; false: append/merge; default true */
  replaceEntries?: boolean;
  /**
   * Keep entries outside the fetched months/year; replace only that window.
   * Implies merge with existing store (ignores replaceEntries=true wipe-all).
   */
  preserveOutsideMonths?: boolean;
  delay?: (ms: number) => Promise<void>;
  /** Dump live selectors after each pipeline gate */
  gateTrace?: boolean;
};

export type FetchStepTiming = {
  step: string;
  ms: number;
  at: string;
};

export type FetchJobResult = {
  entries: ShiftEntry[];
  texts: string[];
  savedPdfs: string[];
  skippedNoPlan: string[];
  errors: string[];
  summaries: MonthSummary[];
  /** Gate dump file paths (when gateTrace) */
  gateTraces?: string[];
  /** Per-step wall times (action + waits) */
  timings?: FetchStepTiming[];
};

type Ctx = FetchJobOptions & {
  sleep: (ms: number) => Promise<void>;
  gateIndex: number;
  gatePaths: string[];
  timings: FetchStepTiming[];
  jobT0: number;
};

function status(opts: FetchJobOptions, line: string) {
  opts.onStatus?.(line);
}

/** Elapsed seconds since `t0` for status lines. */
function ago(t0: number): string {
  return `${((Date.now() - t0) / 1000).toFixed(1)}s`;
}

function run(ctx: Ctx, cmd: AutomationCommand, timeoutMs = 25000) {
  return ctx.bridge.run(ctx.inject, cmd, timeoutMs);
}

function probe(ctx: Ctx, cmd: AutomationCommand, timeoutMs = 20000) {
  return ctx.bridge.probe(ctx.inject, cmd, timeoutMs);
}

/**
 * Condition waits own the deadline. A single slow/missed WebView reply is NOT a job failure —
 * it is "not ready yet". Emulator is fast; phones on 5G often exceed one inject round-trip.
 */
async function softProbe(
  ctx: Ctx,
  cmd: AutomationCommand,
  timeoutMs = 20000,
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

/** Debug dumps only — never user-facing status (GATE spam felt like a hang). */
async function gate(ctx: Ctx, name: string): Promise<void> {
  if (!ctx.gateTrace) return;
  const msg = await softProbe(ctx, { type: 'dumpLiveSelectors' }, 8000, true);
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

function waitOpts(ctx: Ctx, label: string, timeoutMs: number, intervalMs = 600) {
  return {
    timeoutMs,
    intervalMs,
    label,
    delay: ctx.sleep,
    onWait: (elapsed: number) =>
      status(ctx, t('fjWaitTick', { label, seconds: Math.round(elapsed / 1000) })),
  };
}

/** One timed step: logs start → done with step ms + job total. */
async function timed<T>(ctx: Ctx, step: string, fn: () => Promise<T>): Promise<T> {
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

async function ensureLoggedIn(ctx: Ctx): Promise<void> {
  await timed(ctx, 'login', async () => {
    status(ctx, t('fjLogin'));
    const shellNow = await softProbe(ctx, { type: 'assertShellReady' }, 5000, true);
    if (shellNow.ok && !shellNow.stillLogin && !shellNow.splash) {
      status(ctx, shellNow.pickerFound ? t('fjAlreadyZeitdaten') : t('fjAlreadyLoggedInShell'));
      await gate(ctx, '01-shell-ready');
      return;
    }

    const pre = await softProbe(ctx, { type: 'assertLoggedIn' }, 8000, true);
    if (pre.ok && !pre.stillLogin) {
      status(ctx, t('fjAlreadyLoggedInWaitShell'));
    } else if (pre.stillLogin || !pre.ok) {
      status(ctx, t('fjWaitLoginForm'));
      // Wait for form (probe only) — fill/submit once each, never re-fill.
      await waitForCondition(async () => {
        const st = await softProbe(ctx, { type: 'assertLoggedIn' }, 2500, true);
        if (st.stillLogin) return true;
        return null;
      }, waitOpts(ctx, t('fjWaitLoginFormLabel'), 30000));
      status(ctx, t('fjStepAction', { step: 'fillLogin' }));
      await run(ctx, { type: 'fillLogin', username: ctx.username.trim(), password: ctx.password }, 20000);
      status(ctx, t('fjStepAction', { step: 'submitLogin' }));
      await run(ctx, { type: 'submitLogin' }, 15000);
      status(ctx, t('fjWaitShell'));
    }

    await waitForCondition(async () => {
      const st = await softProbe(ctx, { type: 'assertShellReady' }, 2500, true);
      if (st.code === 'BAD_CREDENTIALS' || /bad_credentials|Kennung\/Kennwort/i.test(st.error || '')) {
        throw Object.assign(new Error(t('fjBadCredentials')), { code: 'BAD_CREDENTIALS' });
      }
      if (st.code === 'PROBE_TIMEOUT') return null;
      if (st.stillLogin) return null;
      if (st.splash || st.code === 'SHELL_LOADING') return null;
      if (st.ok) return true;
      return null;
    }, waitOpts(ctx, t('fjWaitShellLabel'), 45000, 500));

    status(ctx, t('fjLoginOk'));
    await gate(ctx, '01-shell-ready');
  });
}

/**
 * Single path: shell → one Open click → wait picker. No second Open, no fallbacks.
 */
async function ensureZeitdatenPicker(ctx: Ctx): Promise<AutomationMessage> {
  return timed(ctx, 'open-zeitdaten', async () => {
    const existing = await softProbe(ctx, { type: 'getPickerState' }, 5000, true);
    if (existing.pickerFound) {
      status(ctx, t('fjPickerReady', { month: String(existing.month), year: String(existing.year) }));
      await gate(ctx, '02-picker-already');
      return existing;
    }

    status(ctx, t('fjWaitOpenButton'));
    await waitForCondition(async () => {
      const sh = await softProbe(ctx, { type: 'assertShellReady' }, 2500, true);
      if (sh.code === 'PROBE_TIMEOUT') return null;
      if (sh.pickerFound) return true;
      if (sh.ok && sh.oeffnenFound) return true;
      return null;
    }, waitOpts(ctx, t('fjWaitShellOpenLabel'), 30000, 500));

    await gate(ctx, '02-before-open');

    const ready = await softProbe(ctx, { type: 'getPickerState' }, 5000, true);
    if (ready.pickerFound) {
      status(ctx, t('fjPickerReady', { month: String(ready.month), year: String(ready.year) }));
      await gate(ctx, '02-picker-after-shell');
      return ready;
    }

    status(ctx, t('fjStepAction', { step: 'clickOpen' }));
    await run(ctx, { type: 'clickOeffnen' }, 12000);
    const picked = await waitForCondition(async () => {
      const ps = await softProbe(ctx, { type: 'getPickerState' }, 2500, true);
      return ps.pickerFound ? ps : null;
    }, waitOpts(ctx, t('fjWaitPickerAfterOpen'), 45000, 400));
    await gate(ctx, '03-after-open');
    return picked;
  });
}

/** Wait until Zeitdaten month picker is ready for PDF export. */
async function assertZeitdatenPickerReady(ctx: Ctx): Promise<void> {
  await timed(ctx, 'picker-ready', async () => {
    status(ctx, t('fjCheckPicker'));
    await waitForCondition(async () => {
      const st = await softProbe(ctx, { type: 'assertExportContext' }, 2500, true);
      if (st.code === 'PROBE_TIMEOUT') return null;
      if (st.code === 'WRONG_EXPORT') {
        await gate(ctx, '05-wrong-export');
        throw Object.assign(new Error(t('fjWrongExport')), { code: 'WRONG_EXPORT' });
      }
      if (st.pickerFound && st.ok) {
        status(ctx, st.maskFound ? t('fjPickerReadyMask') : t('fjPickerReadyPlain'));
        return true;
      }
      return null;
    }, waitOpts(ctx, t('fjWaitPickerLabel'), 25000, 400));
    await gate(ctx, '05-picker-ok');
  });
}

/** SmartEdin: one click, then wait for panel. */
async function ensureSmartEdinExportPanel(ctx: Ctx): Promise<void> {
  await timed(ctx, 'smartedin', async () => {
    status(ctx, t('fjSmartEdin'));
    const already = await softProbe(ctx, { type: 'assertExportContext' }, 5000, true);
    if (already.exportPanel) {
      await gate(ctx, '07-smartedin-export');
      return;
    }
    status(ctx, t('fjStepAction', { step: 'clickSmartEdin' }));
    await run(ctx, { type: 'clickSmartEdin' }, 15000);
    await waitForCondition(async () => {
      const st = await softProbe(ctx, { type: 'assertExportContext' }, 2500, true);
      if (st.code === 'PROBE_TIMEOUT') return null;
      if (st.exportPanel) return true;
      return null;
    }, waitOpts(ctx, t('fjWaitSmartEdinExport'), 25000, 500));
    await gate(ctx, '07-smartedin-export');
  });
}

/** Export menu: one click, then wait LAGSDZPG. */
async function ensureExportZeitprotokollButton(ctx: Ctx): Promise<void> {
  await timed(ctx, 'export-menu', async () => {
    status(ctx, t('fjExportMenu'));
    const already = await softProbe(ctx, { type: 'assertExportContext' }, 5000, true);
    if (already.lagsdzpg) {
      await gate(ctx, '08-lagsdzpg');
      return;
    }
    status(ctx, t('fjStepAction', { step: 'clickExport' }));
    await run(ctx, { type: 'clickExport' }, 15000);
    await waitForCondition(async () => {
      const st = await softProbe(ctx, { type: 'assertExportContext' }, 2500, true);
      if (st.code === 'PROBE_TIMEOUT') return null;
      if (st.lagsdzpg) return true;
      return null;
    }, waitOpts(ctx, t('fjWaitZeitprotokollButton'), 35000, 600));
    await gate(ctx, '08-lagsdzpg');
  });
}

/** Precondition: picker. Action: selectMonth once. Postcondition: header month/year. */
async function selectMonthVerified(ctx: Ctx, month: number, year: number): Promise<void> {
  const label = `${String(month).padStart(2, '0')}/${year}`;
  await timed(ctx, `select-month-${label}`, async () => {
    status(ctx, t('fjSelectMonth', { label }));
    status(ctx, t('fjStepAction', { step: `selectMonth ${label}` }));
    const sel = await run(ctx, { type: 'selectMonth', month, year }, 25000);
    if (!sel.ok && !sel.selected) {
      throw new Error(sel.error || t('fjSelectMonthFailed', { label }));
    }

    await waitForCondition(async () => {
      const v = await softProbe(ctx, { type: 'verifyCalendarMonth', month, year }, 2500, true);
      return v.ok ? v : null;
    }, waitOpts(ctx, t('fjWaitCalendarHeader', { label }), 20000, 400));

    try {
      await run(ctx, { type: 'closePopups' }, 5000);
    } catch {
      // ignore
    }
    await gate(ctx, `06-month-${label.replace('/', '-')}`);
  });
}

/**
 * Content check once. Optional Berechnen once. No grid-reload fallback.
 */
async function assertContentReady(ctx: Ctx, month: number, year: number): Promise<void> {
  const label = `${String(month).padStart(2, '0')}/${year}`;
  await timed(ctx, `content-${label}`, async () => {
    status(ctx, t('fjContentGate', { label }));
    const v1 = await softProbe(ctx, { type: 'verifyCalendarMonth', month, year }, 8000, true);
    if (!v1.ok) {
      throw new Error(t('fjContentGateFail', { label }));
    }
    try {
      status(ctx, t('fjStepAction', { step: 'clickBerechnen' }));
      await run(ctx, { type: 'clickBerechnen' }, 8000);
    } catch {
      // optional
    }
    const v2 = await softProbe(ctx, { type: 'verifyCalendarMonth', month, year }, 8000, true);
    if (!v2.ok) {
      throw new Error(t('fjContentGateFail', { label }));
    }
    status(ctx, t('fjContentGateOk', { label }));
  });
}

async function assertZeitprotokollDialog(
  ctx: Ctx,
  month: number,
  year: number
): Promise<void> {
  const mm = String(month).padStart(2, '0');
  const yearStr = String(year);
  const monthLabel = MONTH_LABELS_DE[month - 1];

  await timed(ctx, `dialog-${mm}-${year}`, async () => {
    await waitForCondition(async () => {
      const vis = await softProbe(ctx, { type: 'isZeitprotokollDialogVisible' }, 2500, true);
      if (vis.code === 'PROBE_TIMEOUT') return null;
      if (
        vis.code === 'WRONG_EXPORT' ||
        /WRONG_EXPORT|keine Abrechnung/i.test(vis.error || vis.sample || '')
      ) {
        throw Object.assign(new Error(t('fjWrongExportDialog')), { code: 'WRONG_EXPORT' });
      }
      if (!vis.dialogVisible) return null;

      const dlg = await softProbe(ctx, { type: 'getDialogAbrechnungsmonat' }, 2500, true);
      if (dlg.code === 'PROBE_TIMEOUT') return null;
      if (dlg.monthToken && dlg.dialogYear) {
        const token = String(dlg.monthToken);
        const parsedMm = /^\d+$/.test(token)
          ? String(Number(token)).padStart(2, '0')
          : String(
              MONTH_LABELS_DE.findIndex((l) => l.toLowerCase() === token.toLowerCase()) + 1
            ).padStart(2, '0');
        const matchLabel =
          token.toLowerCase() === String(monthLabel).toLowerCase() && dlg.dialogYear === yearStr;
        const matchNum = parsedMm === mm && dlg.dialogYear === yearStr;
        if (matchNum || matchLabel) {
          status(ctx, t('fjDialogPeriodOk', { token, year: String(dlg.dialogYear) }));
          return true;
        }
        return null;
      }
      status(ctx, t('fjDialogVisible'));
      return true;
    }, waitOpts(ctx, t('fjWaitDialog'), 30000, 400));
  });
}

function tick(step: string, t0: number) {
  // eslint-disable-next-line no-console
  console.warn(`TIMING ${step} +${Date.now() - t0}ms`);
}

async function capturePdf(
  ctx: Ctx,
  label: string
): Promise<{ base64: string; mime?: string; size?: number; filename?: string }> {
  return timed(ctx, `pdf-${label}`, async () => {
    const t0 = Date.now();
    status(ctx, t('fjDownload', { label, elapsed: ago(t0) }));
    const downloadSince = Date.now();

    status(ctx, t('fjStepAction', { step: 'clickDownload' }));
    try {
      await run(ctx, { type: 'clickDownload' }, 15000);
    } catch {
      throw new Error(t('fjDownloadNotClickable'));
    }
    status(ctx, t('fjDownloadClicked', { label, elapsed: ago(t0) }));

    status(ctx, t('fjWaitPdf', { label, elapsed: ago(t0) }));
    const { pollAndroidDownloadsForPdf } = await import('./androidDownloadPoll');

  let scrapeStop = false;
  const scrapeBg = (async () => {
    while (!scrapeStop) {
      try {
        // Inject-only — never bridge.run() in background (steals waiters from main path).
        ctx.inject({ type: 'scrapePdfViewer' });
      } catch {
        // ignore
      }
      if (scrapeStop) break;
      await ctx.sleep(800);
    }
  })();

  try {
    const pdfPromise = ctx.bridge.waitForPdf(90000).then((pdf) => {
      status(ctx, t('fjPdfWebView', { label, size: String(pdf.size || '?'), elapsed: ago(t0) }));
      return pdf;
    });
    const pollPromise = (async () => {
      const polled = await pollAndroidDownloadsForPdf({
        sinceMs: downloadSince,
        timeoutMs: 90000,
        intervalMs: 500,
      });
      if (!polled) throw new Error(t('fjNoPdfInDownloads'));
      status(ctx, t('fjPdfDownloads', { label, size: String(polled.size), elapsed: ago(t0) }));
      return {
        base64: polled.base64,
        mime: 'application/pdf' as const,
        size: polled.size,
        filename: polled.filename,
      };
    })();

    const pdf = await Promise.any([pdfPromise, pollPromise]);
    if (!pdf.base64 || pdf.base64.length < 64 || !pdf.base64.startsWith('JVBERi')) {
      throw new Error(t('fjPdfEmpty'));
    }
    status(ctx, t('fjPdfOk', { label, size: String(pdf.size || '?'), elapsed: ago(t0) }));
    return pdf;
  } finally {
    scrapeStop = true;
    try {
      await scrapeBg;
    } catch {
      // ignore
    }
  }
  });
}

/**
 * Multi-month LOGA3 fetch — precondition → one action → postcondition.
 */
export async function runFetchJob(opts: FetchJobOptions): Promise<FetchJobResult> {
  const { username, password, months, year, bridge } = opts;
  const sleep = opts.delay || ((ms: number) => bridge.delay(ms));
  const gatePaths: string[] = [];
  const timings: FetchStepTiming[] = [];
  const jobT0 = Date.now();
  const ctx: Ctx = {
    ...opts,
    gateTrace: opts.gateTrace === true,
    sleep,
    gateIndex: 0,
    gatePaths,
    timings,
    jobT0,
  };

  if (!username?.trim() || !password) {
    throw new Error(t('fjNoCredentials'));
  }
  if (!months.length) {
    throw new Error(t('fjNoMonths'));
  }

  const result: FetchJobResult = {
    entries: [],
    texts: [],
    savedPdfs: [],
    skippedNoPlan: [],
    errors: [],
    summaries: [],
    gateTraces: gatePaths,
    timings,
  };

  if (ctx.gateTrace) {
    await clearGateTraces();
    status(ctx, t('fjGateTraceOn'));
  }

  try {
    await ensureLoggedIn(ctx);
    await ensureZeitdatenPicker(ctx);
    await assertZeitdatenPickerReady(ctx);
  } catch (e) {
    await gate(ctx, '99-fail-early');
    throw e;
  }

  try {
    await run(ctx, { type: 'armCalendarReload' }, 8000);
  } catch {
    status(ctx, t('fjArmCalendarMissing'));
  }

  const sorted = [...months].sort((a, b) => a - b);
  status(ctx, t('fjFetchStart', { months: sorted.map((m) => String(m).padStart(2, '0')).join(','), year: String(year) }));

  for (const month of sorted) {
    const label = `${String(month).padStart(2, '0')}/${year}`;
    const monthT0 = Date.now();
    try {
      status(ctx, t('fjMonthStart', { label, elapsed: ago(jobT0) }));
      await selectMonthVerified(ctx, month, year);
      await assertContentReady(ctx, month, year);

      status(ctx, t('fjCheckPlan', { label, elapsed: ago(monthT0) }));
      try {
        await run(ctx, { type: 'assertHasPlan' }, 12000);
      } catch (e) {
        const err = e as Error & { code?: string };
        if (err.code === 'NO_PLAN' || /NO_PLAN/i.test(err.message)) {
          status(ctx, t('fjNoPlan', { label, elapsed: ago(monthT0) }));
          result.skippedNoPlan.push(label);
          await gate(ctx, `06b-no-plan-${label.replace('/', '-')}`);
          continue;
        }
        throw e;
      }
      await gate(ctx, `06b-has-plan-${label.replace('/', '-')}`);

      status(ctx, t('fjSmartEdinExport', { label, elapsed: ago(monthT0) }));
      try {
        await run(ctx, { type: 'closePopups' }, 5000);
      } catch {
        // ignore
      }
      try {
        await run(ctx, { type: 'clickBerechnen' }, 8000);
      } catch {
        // optional
      }

      await assertZeitdatenPickerReady(ctx);
      await ensureSmartEdinExportPanel(ctx);

      const after = await softProbe(ctx, { type: 'verifyCalendarMonth', month, year }, 20000);
      if (!after.ok) {
        throw new Error(
          after.code === 'PROBE_TIMEOUT'
            ? t('fjRefuseExportTimeout', { label })
            : t('fjRefuseExportInvalid', { label })
        );
      }

      await ensureExportZeitprotokollButton(ctx);

      status(ctx, t('fjZeitprotokoll', { label, elapsed: ago(monthT0) }));
      try {
        await run(ctx, { type: 'armPdfCapture', ms: 45000 }, 5000);
      } catch {
        // capture inject may be missing on cold frame
      }

      status(ctx, t('fjStepAction', { step: 'openZeitprotokoll' }));
      try {
        await run(ctx, { type: 'openZeitprotokoll' }, 20000);
      } catch {
        throw new Error(t('fjZpNotClickable'));
      }

      await assertZeitprotokollDialog(ctx, month, year);
      await gate(ctx, `09-dialog-${label.replace('/', '-')}`);

      const pdf = await capturePdf(ctx, label);
      // Stay on LOGA3 — do not linger in Chromium PDF viewer between months.
      status(ctx, t('fjStepAction', { step: 'leavePdfViewer/closeDialog' }));
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

      // Decode+parse in memory first — legacy base64 file writes burned 40–85s/month on phone.
      status(ctx, t('fjStepAction', { step: 'parsePdf' }));
      await ctx.sleep(16);
      const decodeT0 = Date.now();
      const buf = base64ToArrayBuffer(pdf.base64);
      tick(`base64decode ${label}`, decodeT0);
      const parseT0 = Date.now();
      const text = await extractTextFromPdfBuffer(buf);
      tick(`parsePdf ${label}`, parseT0);
      status(
        ctx,
        t('fjStepDone', { step: `parsePdf ${label}`, ms: Date.now() - parseT0, total: ago(ctx.jobT0) })
      );
      if (!text.trim()) {
        throw new Error(t('fjPdfTextEmpty'));
      }

      const periodCheck = validatePdfPeriod(text, month, year);
      if (!periodCheck.ok) {
        throw new Error(
          t('fjPdfPeriodMismatch', {
            found: periodCheck.found || '?',
            expected: periodCheck.expected,
          })
        );
      }
      status(ctx, t('fjPdfPeriodOk', { label, found: String(periodCheck.found), elapsed: ago(monthT0) }));

      status(ctx, t('fjStepAction', { step: 'savePdf' }));
      const saveT0 = Date.now();
      const path = await savePdfBytes(new Uint8Array(buf), month, year);
      tick(`savePdf ${label}`, saveT0);
      status(ctx, t('fjPdfSaved', { label, size: String(pdf.size || '?'), elapsed: ago(monthT0) }));

      result.savedPdfs.push(path);
      result.texts.push(`### ${label}\n${text}`);

      const snap = getSnapshot();
      if (!snap.preset || !snap.hospitalId || !snap.groupId || !snap.areaId) {
        throw new Error(t('fjWorkplaceMissing'));
      }
      const mapping = getMappingForScope(snap.hospitalId, snap.groupId, snap.areaId);
      if (!mapping) {
        throw new Error(t('fjMappingMissing', { scope: `${snap.hospitalId}/${snap.groupId}/${snap.areaId}` }));
      }
      const converted = convertPdfText(text, {
        preset: snap.preset,
        mapping,
        userMappings: snap.userMappings,
      });
      result.entries.push(...converted.entries);
      if (converted.summaries?.length) {
        result.summaries.push(...converted.summaries);
      } else if (converted.summary) {
        result.summaries.push(converted.summary);
      }
      status(
        ctx,
        t('fjShiftsDone', {
          label,
          count: converted.entries.length,
          elapsed: ago(monthT0),
          total: ago(jobT0),
        })
      );
    } catch (e) {
      const msg = `${label}: ${e instanceof Error ? e.message : String(e)}`;
      result.errors.push(msg);
      status(ctx, t('fjError', { msg, elapsed: ago(monthT0) }));
      await gate(ctx, `99-fail-${label.replace('/', '-')}`);
      try {
        await run(ctx, { type: 'closeDialog' }, 5000);
      } catch {
        // ignore
      }
    }
  }

  status(
    ctx,
    t('fjFetchDone', {
      pdfs: result.savedPdfs.length,
      shifts: result.entries.length,
      errors: result.errors.length,
      elapsed: ago(jobT0),
    })
  );
  if (timings.length) {
    const summary = timings.map((x) => `${x.step}=${(x.ms / 1000).toFixed(1)}s`).join(' · ');
    status(ctx, t('fjTimingSummary', { summary }));
  }

  result.entries.sort(
    (a, b) => a.date.localeCompare(b.date) || (a.start || '').localeCompare(b.start || '')
  );

  if (result.entries.length) {
    const pad = (m: number) => String(m).padStart(2, '0');
    const windowKeys = new Set(sorted.map((m) => `${year}-${pad(m)}`));
    let base: typeof result.entries = [];
    if (opts.preserveOutsideMonths) {
      base = getSnapshot().entries.filter((e) => !windowKeys.has(String(e.date || '').slice(0, 7)));
    } else if (opts.replaceEntries === false) {
      base = getSnapshot().entries;
    }
    const merged = [...base, ...result.entries];
    const seen = new Set<string>();
    const unique = merged.filter((e) => {
      const k = `${e.date}|${e.start || ''}|${e.end || ''}|${e.type}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const prevSummaries = opts.preserveOutsideMonths ? getSnapshot().summaries || [] : [];
    const summaries = opts.preserveOutsideMonths
      ? [
          ...prevSummaries.filter((s) => {
            const m = Number(s?.month);
            const y = Number(s?.year);
            if (!m || !y) return true;
            return !windowKeys.has(`${y}-${pad(m)}`);
          }),
          ...result.summaries,
        ]
      : result.summaries;
    await setEntries(unique, {
      rawText: anonymizeDienstplanText(result.texts.join('\n\n'), { maxChars: 80000 }),
      summaries,
      summary: summaries[summaries.length - 1] || null,
    });
    result.entries = unique;
    await markSuccessfulFetch();
    void refreshHomeWidgets(unique);
  }

  if (!result.entries.length && result.errors.length) {
    throw new Error(result.errors.join(' · '));
  }
  if (!result.entries.length && result.skippedNoPlan.length && !result.errors.length) {
    throw new Error(t('fjNoShiftsNoPlan', { months: result.skippedNoPlan.join(', ') }));
  }

  return result;
}
