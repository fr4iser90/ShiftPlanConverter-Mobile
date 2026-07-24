import type { AutomationCommand, AutomationMessage } from './automation';
import { AutomationBridge } from './bridge';
import { convertPdfText } from '../convert/pipeline';
import { extractTextFromPdfBuffer } from '../convert/pdfText';
import type { MonthSummary, ShiftEntry } from '../convert/types';
import { MONTH_LABELS_DE, validatePdfPeriod } from './contentGate';
import { base64ToArrayBuffer, deletePdfFile, savePdfBase64 } from './pdfStore';
import { getSnapshot, setEntries } from '../state/store';
import { getMappingForScope } from '../packs';
import { waitForCondition, WaitTimeoutError } from './wait';
import { clearGateTraces, writeGateTrace } from './gateTrace';

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

export type FetchJobResult = {
  entries: ShiftEntry[];
  texts: string[];
  savedPdfs: string[];
  skippedNoPlan: string[];
  errors: string[];
  summaries: MonthSummary[];
  /** Gate dump file paths (when gateTrace) */
  gateTraces?: string[];
};

type Ctx = FetchJobOptions & {
  sleep: (ms: number) => Promise<void>;
  gateIndex: number;
  gatePaths: string[];
};

function status(opts: FetchJobOptions, line: string) {
  opts.onStatus?.(line);
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
  timeoutMs = 20000
): Promise<AutomationMessage> {
  try {
    return await probe(ctx, cmd, timeoutMs);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    status(ctx, `${cmd.type}: keine Antwort — warte weiter…`);
    return {
      ok: false,
      type: cmd.type,
      error: 'probe_timeout',
      code: 'PROBE_TIMEOUT',
      note: msg.slice(0, 160),
    };
  }
}

/** After each postcondition: live selector dump + file (optional). */
async function gate(ctx: Ctx, name: string): Promise<void> {
  if (!ctx.gateTrace) return;
  status(ctx, `GATE ${name}…`);
  const msg = await softProbe(ctx, { type: 'dumpLiveSelectors' }, 25000);
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
  status(
    ctx,
    `GATE ${name}: picker=${!!msg.pickerFound} mask=${!!msg.maskFound} oeffnen=${!!msg.oeffnenFound}`
  );
}

function waitOpts(ctx: Ctx, label: string, timeoutMs: number, intervalMs = 600) {
  return {
    timeoutMs,
    intervalMs,
    label,
    delay: ctx.sleep,
    onWait: (elapsed: number) => status(ctx, `${label}… ${Math.round(elapsed / 1000)}s`),
  };
}

async function ensureLoggedIn(ctx: Ctx): Promise<void> {
  status(ctx, 'Login…');
  // Soft: cold WebView may miss the first reply — outer wait owns the deadline.
  const pre = await softProbe(ctx, { type: 'assertLoggedIn' }, 20000);
  if (pre.ok && !pre.stillLogin) {
    status(ctx, 'Bereits eingeloggt — warte auf Shell…');
  } else {
    status(ctx, 'Warte auf Login-Formular…');
    await waitForCondition(async () => {
      try {
        await run(ctx, { type: 'fillLogin', username: ctx.username.trim(), password: ctx.password }, 20000);
        return true;
      } catch {
        return null;
      }
    }, waitOpts(ctx, 'Login-Formular', 30000));

    await run(ctx, { type: 'submitLogin' }, 15000);
    status(ctx, 'Warte auf LOGA3-Shell (nicht Splash)…');
  }

  // Always wait for real shell chrome — "logged in" alone is not enough (GWT still booting).
  // Budget: fail fast — 3 Monate Gesamtziel ≤2min, Shell darf nicht 3min fressen.
  await waitForCondition(async () => {
    const st = await softProbe(ctx, { type: 'assertShellReady' }, 12000);
    if (st.code === 'BAD_CREDENTIALS' || /bad_credentials|Kennung\/Kennwort/i.test(st.error || '')) {
      throw Object.assign(new Error('Kennung/Kennwort falsch'), { code: 'BAD_CREDENTIALS' });
    }
    if (st.code === 'PROBE_TIMEOUT') return null;
    if (st.stillLogin) return null;
    if (st.splash || st.code === 'SHELL_LOADING') return null;
    if (st.ok) return true;
    return null;
  }, waitOpts(ctx, 'LOGA3-Shell bereit', 45000, 500));

  status(ctx, 'Login ok — Shell bereit');
  await gate(ctx, '01-shell-ready');
}

/**
 * Single path (Desktop LOGA3 in WebView): shell → click "öffnen" → #ZeitdatenMonthPicker.
 * No Zeiten fallback, no second öffnen recovery.
 */
async function ensureZeitdatenPicker(ctx: Ctx): Promise<AutomationMessage> {
  const existing = await softProbe(ctx, { type: 'getPickerState' }, 12000);
  if (existing.pickerFound) {
    status(ctx, `Picker bereit (${existing.month}/${existing.year})`);
    await gate(ctx, '02-picker-already');
    return existing;
  }

  status(ctx, 'Warte bis Öffnen-Button sichtbar…');
  await waitForCondition(async () => {
    const sh = await softProbe(ctx, { type: 'assertShellReady' }, 12000);
    if (sh.code === 'PROBE_TIMEOUT') return null;
    if (sh.pickerFound) return true;
    if (sh.ok && sh.oeffnenFound) return true;
    return null;
  }, waitOpts(ctx, 'Shell / Öffnen', 30000, 500));

  await gate(ctx, '02-before-oeffnen');

  const again = await softProbe(ctx, { type: 'getPickerState' }, 10000);
  if (again.pickerFound) {
    status(ctx, `Picker bereit (${again.month}/${again.year})`);
    await gate(ctx, '02-picker-after-shell');
    return again;
  }

  status(ctx, 'Öffnen klicken…');
  await run(ctx, { type: 'clickOeffnen' }, 12000);
  const picked = await waitForCondition(async () => {
    const ps = await softProbe(ctx, { type: 'getPickerState' }, 10000);
    return ps.pickerFound ? ps : null;
  }, waitOpts(ctx, 'ZeitdatenMonthPicker nach Öffnen', 25000, 400));
  await gate(ctx, '03-after-oeffnen');
  return picked;
}

/** Wait until Zeitdaten month picker is ready for PDF export. */
async function assertZeitdatenPickerReady(ctx: Ctx): Promise<void> {
  status(ctx, 'Zeitdaten-Picker prüfen…');
  await waitForCondition(async () => {
    const st = await softProbe(ctx, { type: 'assertExportContext' }, 20000);
    if (st.code === 'PROBE_TIMEOUT') return null;
    if (st.code === 'WRONG_EXPORT') {
      await gate(ctx, '05-wrong-export');
      throw Object.assign(
        new Error('LOGA3: Abrechnung/Export-Dialog statt Zeitprotokoll'),
        { code: 'WRONG_EXPORT' }
      );
    }
    if (st.pickerFound && st.ok) {
      status(ctx, 'Picker bereit' + (st.maskFound ? ' (+Maske)' : ''));
      return true;
    }
    return null;
  }, waitOpts(ctx, 'Zeitdaten-Picker', 25000, 400));
  await gate(ctx, '05-picker-ok');
}

/** SmartEdin required + wait Export panel (desktop waitForExportPanel). */
async function ensureSmartEdinExportPanel(ctx: Ctx): Promise<void> {
  status(ctx, 'SmartEdin…');
  await waitForCondition(async () => {
    try {
      const r = await run(ctx, { type: 'clickSmartEdin' }, 15000);
      if (r.exportPanel) return true;
    } catch {
      // retry
    }
    const st = await softProbe(ctx, { type: 'assertExportContext' }, 12000);
    if (st.code === 'PROBE_TIMEOUT') return null;
    if (st.exportPanel) return true;
    return null;
  }, waitOpts(ctx, 'SmartEdin / Export-Panel', 20000, 400));
  await gate(ctx, '07-smartedin-export');
}

/** Export menu required + wait LAGSDZPG (desktop waitForZeitprotokollButton). */
async function ensureExportZeitprotokollButton(ctx: Ctx): Promise<void> {
  status(ctx, 'Export-Menü…');
  await waitForCondition(async () => {
    try {
      const r = await run(ctx, { type: 'clickExport' }, 15000);
      if (r.lagsdzpg) return true;
    } catch {
      // retry
    }
    const st = await softProbe(ctx, { type: 'assertExportContext' }, 12000);
    if (st.code === 'PROBE_TIMEOUT') return null;
    if (st.lagsdzpg) return true;
    return null;
  }, waitOpts(ctx, 'Zeitprotokoll-Button (LAGSDZPG)', 20000, 400));
  await gate(ctx, '08-lagsdzpg');
}

/** Precondition: picker. Action: selectMonth once. Postcondition: header month/year. */
async function selectMonthVerified(ctx: Ctx, month: number, year: number): Promise<void> {
  const label = `${String(month).padStart(2, '0')}/${year}`;
  status(ctx, `${label}: Monat wählen…`);
  const sel = await run(ctx, { type: 'selectMonth', month, year }, 25000);
  if (!sel.ok && !sel.selected) {
    throw new Error(sel.error || `selectMonth failed for ${label}`);
  }

  await waitForCondition(async () => {
    const v = await softProbe(ctx, { type: 'verifyCalendarMonth', month, year }, 12000);
    return v.ok ? v : null;
  }, waitOpts(ctx, `Kalenderkopf ${label}`, 20000, 400));

  try {
    await run(ctx, { type: 'closePopups' }, 5000);
  } catch {
    // ignore
  }
  await gate(ctx, `06-month-${label.replace('/', '-')}`);
}

/**
 * Content gate: verify once; optional Berechnen; if still bad → one grid reload + wait.
 * No 8× nudge spam.
 */
async function assertContentReady(ctx: Ctx, month: number, year: number): Promise<void> {
  const label = `${String(month).padStart(2, '0')}/${year}`;
  status(ctx, `${label}: Content-Gate…`);

  const tryVerify = async () => {
    const v = await softProbe(ctx, { type: 'verifyCalendarMonth', month, year }, 20000);
    return v.ok ? v : null;
  };

  if (await tryVerify()) {
    try {
      await run(ctx, { type: 'clickBerechnen' }, 8000);
    } catch {
      // optional
    }
    if (await tryVerify()) {
      status(ctx, `${label}: Content-Gate ok`);
      return;
    }
  }

  status(ctx, `${label}: ein Grid-Reload…`);
  try {
    await run(ctx, { type: 'armCalendarReload' }, 8000);
  } catch {
    // ignore
  }
  await run(ctx, { type: 'selectMonth', month, year }, 20000);
  await waitForCondition(tryVerify, waitOpts(ctx, `Content-Gate ${label}`, 25000, 400));
  status(ctx, `${label}: Content-Gate ok`);
}

async function assertZeitprotokollDialog(
  ctx: Ctx,
  month: number,
  year: number
): Promise<void> {
  const mm = String(month).padStart(2, '0');
  const yearStr = String(year);
  const monthLabel = MONTH_LABELS_DE[month - 1];
  let recovered = false;

  await waitForCondition(async () => {
    const vis = await softProbe(ctx, { type: 'isZeitprotokollDialogVisible' }, 20000);
    if (vis.code === 'PROBE_TIMEOUT') return null;
    if (
      vis.code === 'WRONG_EXPORT' ||
      /WRONG_EXPORT|keine Abrechnung/i.test(vis.error || vis.sample || '')
    ) {
      throw Object.assign(
        new Error('LOGA3: Abrechnung statt Zeitprotokoll-Dialog'),
        { code: 'WRONG_EXPORT' }
      );
    }
    if (!vis.dialogVisible) {
      if (!recovered) {
        // single recovery: reopen export path once while waiting
        recovered = true;
        status(ctx, 'Dialog fehlt — Export/Zeitprotokoll einmal neu…');
        try {
          await run(ctx, { type: 'clickExport' }, 8000);
        } catch {
          // ignore
        }
        try {
          await run(ctx, { type: 'openZeitprotokoll' }, 20000);
        } catch {
          // ignore
        }
      }
      return null;
    }

    const dlg = await softProbe(ctx, { type: 'getDialogAbrechnungsmonat' }, 20000);
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
        status(ctx, `Dialog Abrechnungsmonat ok (${token}/${dlg.dialogYear})`);
        return true;
      }
      return null;
    }
    // Visible without label — content gate already passed
    status(ctx, 'Dialog sichtbar (ohne Abrechnungsmonat-Label)');
    return true;
  }, waitOpts(ctx, 'Zeitprotokoll-Dialog', 30000, 400));
}

async function clickOnceOrWait(
  ctx: Ctx,
  cmd: AutomationCommand,
  label: string,
  timeoutMs: number
): Promise<boolean> {
  try {
    await run(ctx, cmd, 10000);
    return true;
  } catch {
    try {
      await waitForCondition(async () => {
        try {
          await run(ctx, cmd, 8000);
          return true;
        } catch {
          return null;
        }
      }, waitOpts(ctx, label, timeoutMs, 400));
      return true;
    } catch {
      return false;
    }
  }
}

async function capturePdf(
  ctx: Ctx,
  label: string
): Promise<{ base64: string; mime?: string; size?: number; filename?: string }> {
  status(ctx, `${label}: Download…`);
  const downloadSince = Date.now();

  const clicked = await clickOnceOrWait(
    ctx,
    { type: 'clickDownload' },
    'Download-Button',
    12000
  );
  if (!clicked) throw new Error('Download-Button nicht klickbar');

  status(ctx, `${label}: warte PDF-Bytes…`);
  const { pollAndroidDownloadsForPdf } = await import('./androidDownloadPoll');

  let scrapeStop = false;
  const scrapeBg = (async () => {
    while (!scrapeStop) {
      try {
        await run(ctx, { type: 'scrapePdfViewer' }, 6000);
      } catch {
        // inject may miss while navigating into the viewer
      }
      if (scrapeStop) break;
      await ctx.sleep(800);
    }
  })();

  try {
    const pdfPromise = ctx.bridge.waitForPdf(35000);
    const pollPromise = (async () => {
      const polled = await pollAndroidDownloadsForPdf({
        sinceMs: downloadSince,
        timeoutMs: 30000,
        intervalMs: 500,
      });
      if (!polled) throw new Error('kein PDF im Download-Ordner');
      status(ctx, `${label}: PDF aus Download-Ordner (${polled.size} B)`);
      return {
        base64: polled.base64,
        mime: 'application/pdf' as const,
        size: polled.size,
        filename: polled.filename,
      };
    })();

    const pdf = await Promise.race([pdfPromise, pollPromise]);
    if (!pdf.base64 || pdf.base64.length < 64) {
      throw new Error('PDF-Download leer oder Capture fehlgeschlagen');
    }
    return pdf;
  } finally {
    scrapeStop = true;
    void scrapeBg;
  }
}

/**
 * Multi-month LOGA3 fetch — precondition → one action → postcondition.
 */
export async function runFetchJob(opts: FetchJobOptions): Promise<FetchJobResult> {
  const { username, password, months, year, bridge } = opts;
  const sleep = opts.delay || ((ms: number) => bridge.delay(ms));
  const gatePaths: string[] = [];
  const ctx: Ctx = {
    ...opts,
    gateTrace: opts.gateTrace === true,
    sleep,
    gateIndex: 0,
    gatePaths,
  };

  if (!username?.trim() || !password) {
    throw new Error('Keine Zugangsdaten — bitte Benutzername/Passwort speichern.');
  }
  if (!months.length) {
    throw new Error('Keine Monate ausgewählt.');
  }

  const result: FetchJobResult = {
    entries: [],
    texts: [],
    savedPdfs: [],
    skippedNoPlan: [],
    errors: [],
    summaries: [],
    gateTraces: gatePaths,
  };

  if (ctx.gateTrace) {
    await clearGateTraces();
    status(ctx, 'Gate-Trace an — Dumps nach jedem Step');
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
    status(ctx, 'Aktualisieren nicht gefunden (optional)');
  }

  const sorted = [...months].sort((a, b) => a - b);

  for (const month of sorted) {
    const label = `${String(month).padStart(2, '0')}/${year}`;
    try {
      await selectMonthVerified(ctx, month, year);
      await assertContentReady(ctx, month, year);

      status(ctx, `${label}: Plan prüfen…`);
      try {
        await run(ctx, { type: 'assertHasPlan' }, 12000);
      } catch (e) {
        const err = e as Error & { code?: string };
        if (err.code === 'NO_PLAN' || /NO_PLAN/i.test(err.message)) {
          status(ctx, `${label}: kein Plan (NO_PLAN) — übersprungen`);
          result.skippedNoPlan.push(label);
          await gate(ctx, `06b-no-plan-${label.replace('/', '-')}`);
          continue;
        }
        throw e;
      }
      await gate(ctx, `06b-has-plan-${label.replace('/', '-')}`);

      status(ctx, `${label}: SmartEdin / Export…`);
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
            ? `Refusing export after SmartEdin: no reply for ${label}`
            : `Refusing export after SmartEdin: content invalid for ${label}`
        );
      }

      await ensureExportZeitprotokollButton(ctx);

      status(ctx, `${label}: Zeitprotokoll…`);
      try {
        await run(ctx, { type: 'armPdfCapture', ms: 45000 }, 5000);
      } catch {
        // capture inject may be missing on cold frame
      }

      const zpOk = await clickOnceOrWait(
        ctx,
        { type: 'openZeitprotokoll' },
        'Zeitprotokoll generieren',
        20000
      );
      if (!zpOk) throw new Error('Zeitprotokoll generieren nicht klickbar');

      await assertZeitprotokollDialog(ctx, month, year);
      await gate(ctx, `09-dialog-${label.replace('/', '-')}`);

      const pdf = await capturePdf(ctx, label);
      const path = await savePdfBase64(pdf.base64, month, year);
      status(ctx, `${label}: PDF gespeichert (${pdf.size || '?'} B) — Validieren…`);
      await gate(ctx, `10-pdf-${label.replace('/', '-')}`);

      const buf = base64ToArrayBuffer(pdf.base64);
      const text = await extractTextFromPdfBuffer(buf);
      if (!text.trim()) {
        await deletePdfFile(path);
        throw new Error('PDF-Text leer — verworfen');
      }

      const periodCheck = validatePdfPeriod(text, month, year);
      if (!periodCheck.ok) {
        await deletePdfFile(path);
        throw new Error(
          `Post-download: Abrechnungsmonat ${periodCheck.found || '?'} != ${periodCheck.expected}`
        );
      }
      status(ctx, `${label}: PDF Abrechnungsmonat ok (${periodCheck.found})`);

      result.savedPdfs.push(path);
      result.texts.push(`### ${label}\n${text}`);

      const snap = getSnapshot();
      if (!snap.preset || !snap.hospitalId || !snap.groupId || !snap.areaId) {
        throw new Error('Arbeitgeber/Bereich/Preset nicht gewählt — Setup im Holen-Tab.');
      }
      const mapping = getMappingForScope(snap.hospitalId, snap.groupId, snap.areaId);
      if (!mapping) {
        throw new Error(`Kein Mapping für ${snap.hospitalId}/${snap.groupId}/${snap.areaId}`);
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
      status(ctx, `${label}: ${converted.entries.length} Schichten`);

      try {
        await run(ctx, { type: 'closeDialog' }, 8000);
      } catch {
        // ignore
      }
    } catch (e) {
      const msg = `${label}: ${e instanceof Error ? e.message : String(e)}`;
      result.errors.push(msg);
      status(ctx, `Fehler ${msg}`);
      await gate(ctx, `99-fail-${label.replace('/', '-')}`);
      try {
        await run(ctx, { type: 'closeDialog' }, 5000);
      } catch {
        // ignore
      }
    }
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
      rawText: result.texts.join('\n\n'),
      summaries,
      summary: summaries[summaries.length - 1] || null,
    });
    result.entries = unique;
  }

  if (!result.entries.length && result.errors.length) {
    throw new Error(result.errors.join(' · '));
  }
  if (!result.entries.length && result.skippedNoPlan.length && !result.errors.length) {
    throw new Error(`Keine Schichten — NO_PLAN für: ${result.skippedNoPlan.join(', ')}`);
  }

  return result;
}
