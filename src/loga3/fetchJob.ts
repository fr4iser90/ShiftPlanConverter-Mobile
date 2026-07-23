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
};

export type FetchJobResult = {
  entries: ShiftEntry[];
  texts: string[];
  savedPdfs: string[];
  skippedNoPlan: string[];
  errors: string[];
  summaries: MonthSummary[];
};

type Ctx = FetchJobOptions & {
  sleep: (ms: number) => Promise<void>;
};

function status(opts: FetchJobOptions, line: string) {
  opts.onStatus?.(line);
}

function run(ctx: Ctx, cmd: AutomationCommand, timeoutMs = 20000) {
  return ctx.bridge.run(ctx.inject, cmd, timeoutMs);
}

function probe(ctx: Ctx, cmd: AutomationCommand, timeoutMs = 12000) {
  return ctx.bridge.probe(ctx.inject, cmd, timeoutMs);
}

function waitOpts(ctx: Ctx, label: string, timeoutMs: number, intervalMs = 300) {
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
  const pre = await probe(ctx, { type: 'assertLoggedIn' }, 8000);
  if (pre.ok && !pre.stillLogin) {
    status(ctx, 'Bereits eingeloggt');
    return;
  }

  status(ctx, 'Warte auf Login-Formular…');
  await waitForCondition(async () => {
    try {
      await run(ctx, { type: 'fillLogin', username: ctx.username.trim(), password: ctx.password }, 8000);
      return true;
    } catch {
      return null;
    }
  }, waitOpts(ctx, 'Login-Formular', 25000));

  await run(ctx, { type: 'submitLogin' }, 10000);
  status(ctx, 'Warte auf LOGA3-Shell (nicht Splash)…');

  await waitForCondition(async () => {
    const st = await probe(ctx, { type: 'assertShellReady' }, 8000);
    if (st.code === 'BAD_CREDENTIALS' || /bad_credentials|Kennung\/Kennwort/i.test(st.error || '')) {
      throw Object.assign(new Error('Kennung/Kennwort falsch'), { code: 'BAD_CREDENTIALS' });
    }
    if (st.stillLogin) return null;
    if (st.splash || st.code === 'SHELL_LOADING') return null;
    if (st.ok) return true;
    return null;
  }, waitOpts(ctx, 'LOGA3-Shell bereit', 90000, 400));

  status(ctx, 'Login ok — Shell bereit');
}

/** Wait until Zeiten is clickable (or picker already there), then open Zeitdaten. */
async function ensureZeitdatenPicker(ctx: Ctx): Promise<AutomationMessage> {
  const existing = await probe(ctx, { type: 'getPickerState' }, 8000);
  if (existing.pickerFound) {
    status(ctx, `Picker bereit (${existing.month}/${existing.year})`);
    return existing;
  }

  status(ctx, 'Warte bis Zeiten verfügbar…');
  await waitForCondition(async () => {
    const sh = await probe(ctx, { type: 'assertShellReady' }, 8000);
    if (sh.pickerFound) return true;
    if (sh.ok && sh.zeitenFound) return true;
    return null;
  }, waitOpts(ctx, 'Zeiten-Menü / Shell', 90000, 400));

  const again = await probe(ctx, { type: 'getPickerState' }, 8000);
  if (again.pickerFound) {
    status(ctx, `Picker bereit (${again.month}/${again.year})`);
    return again;
  }

  status(ctx, 'Zeiten-Maske öffnen…');
  try {
    await run(ctx, { type: 'clickOeffnen' }, 8000);
  } catch {
    // optional
  }

  // Re-check shell after Öffnen (may re-show splash briefly)
  await waitForCondition(async () => {
    const sh = await probe(ctx, { type: 'assertShellReady' }, 8000);
    if (sh.splash) return null;
    if (sh.pickerFound || sh.zeitenFound || sh.ok) return true;
    return null;
  }, waitOpts(ctx, 'Shell nach Öffnen', 45000, 400));

  const openAndWait = async () => {
    await run(ctx, { type: 'clickZeiten' }, 12000);
    return waitForCondition(async () => {
      const ps = await probe(ctx, { type: 'getPickerState' }, 6000);
      return ps.pickerFound ? ps : null;
    }, waitOpts(ctx, 'ZeitdatenMonthPicker', 45000, 350));
  };

  try {
    return await openAndWait();
  } catch (e) {
    if (!(e instanceof WaitTimeoutError)) throw e;
    status(ctx, 'Picker fehlt — ein Recovery-Klick Zeiten…');
    await waitForCondition(async () => {
      const sh = await probe(ctx, { type: 'assertShellReady' }, 8000);
      return sh.splash ? null : true;
    }, waitOpts(ctx, 'Shell vor Recovery', 30000, 400));
    return openAndWait();
  }
}

/** Precondition: picker. Action: selectMonth once. Postcondition: header month/year. */
async function selectMonthVerified(ctx: Ctx, month: number, year: number): Promise<void> {
  const label = `${String(month).padStart(2, '0')}/${year}`;
  status(ctx, `${label}: Monat wählen…`);
  const sel = await run(ctx, { type: 'selectMonth', month, year }, 60000);
  if (!sel.ok && !sel.selected) {
    throw new Error(sel.error || `selectMonth failed for ${label}`);
  }

  await waitForCondition(async () => {
    const v = await probe(ctx, { type: 'verifyCalendarMonth', month, year }, 10000);
    return v.ok ? v : null;
  }, waitOpts(ctx, `Kalenderkopf ${label}`, 25000, 400));

  try {
    await run(ctx, { type: 'closePopups' }, 5000);
  } catch {
    // ignore
  }
}

/**
 * Content gate: verify once; optional Berechnen; if still bad → one grid reload + wait.
 * No 8× nudge spam.
 */
async function assertContentReady(ctx: Ctx, month: number, year: number): Promise<void> {
  const label = `${String(month).padStart(2, '0')}/${year}`;
  status(ctx, `${label}: Content-Gate…`);

  const tryVerify = async () => {
    const v = await probe(ctx, { type: 'verifyCalendarMonth', month, year }, 12000);
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
  await run(ctx, { type: 'selectMonth', month, year }, 60000);
  await waitForCondition(tryVerify, waitOpts(ctx, `Content-Gate ${label}`, 30000, 400));
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
    const vis = await probe(ctx, { type: 'isZeitprotokollDialogVisible' }, 8000);
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

    const dlg = await probe(ctx, { type: 'getDialogAbrechnungsmonat' }, 8000);
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
  }, waitOpts(ctx, 'Zeitprotokoll-Dialog', 45000, 500));
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
    25000
  );
  if (!clicked) throw new Error('Download-Button nicht klickbar');

  status(ctx, `${label}: warte PDF-Bytes…`);
  const { pollAndroidDownloadsForPdf } = await import('./androidDownloadPoll');

  let scrapeStop = false;
  const scrapeBg = (async () => {
    while (!scrapeStop) {
      try {
        await run(ctx, { type: 'scrapePdfViewer' }, 8000);
      } catch {
        // inject may miss while navigating into the viewer
      }
      if (scrapeStop) break;
      await ctx.sleep(1500);
    }
  })();

  try {
    const pdfPromise = ctx.bridge.waitForPdf(120000);
    const pollPromise = (async () => {
      const polled = await pollAndroidDownloadsForPdf({
        sinceMs: downloadSince,
        timeoutMs: 110000,
        intervalMs: 800,
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
  const ctx: Ctx = { ...opts, sleep };

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
  };

  await ensureLoggedIn(ctx);
  await ensureZeitdatenPicker(ctx);

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
          continue;
        }
        throw e;
      }

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

      const smartOk = await clickOnceOrWait(
        ctx,
        { type: 'clickSmartEdin' },
        'SmartEdin',
        15000
      );
      if (!smartOk) status(ctx, `${label}: SmartEdin optional übersprungen`);

      const after = await probe(ctx, { type: 'verifyCalendarMonth', month, year }, 12000);
      if (!after.ok) {
        throw new Error(`Refusing export after SmartEdin: content invalid for ${label}`);
      }

      const exportOk = await clickOnceOrWait(ctx, { type: 'clickExport' }, 'Export-Menü', 15000);
      if (!exportOk) status(ctx, `${label}: Export-Menü fehlt — Zeitprotokoll direkt`);

      status(ctx, `${label}: Zeitprotokoll…`);
      try {
        await run(ctx, { type: 'armPdfCapture', ms: 180000 }, 8000);
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

      const pdf = await capturePdf(ctx, label);
      const path = await savePdfBase64(pdf.base64, month, year);
      status(ctx, `${label}: PDF gespeichert (${pdf.size || '?'} B) — Validieren…`);

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
