import type { AutomationCommand } from './automation';
import { AutomationBridge } from './bridge';
import { convertPdfText } from '../convert/pipeline';
import { extractTextFromPdfBuffer } from '../convert/pdfText';
import type { ShiftEntry } from '../convert/types';
import { base64ToArrayBuffer, savePdfBase64 } from './pdfStore';
import { getSnapshot, setEntries } from '../state/store';
import { BUILTIN_PRESET } from '../packs';

export type FetchJobOptions = {
  username: string;
  password: string;
  months: number[];
  year: number;
  inject: (cmd: AutomationCommand) => void;
  bridge: AutomationBridge;
  onStatus?: (line: string) => void;
  /** Replace store entries (default) or merge with existing */
  replaceEntries?: boolean;
  /** Override sleeps (tests); default bridge.delay */
  delay?: (ms: number) => Promise<void>;
};

export type FetchJobResult = {
  entries: ShiftEntry[];
  texts: string[];
  savedPdfs: string[];
  skippedNoPlan: string[];
  errors: string[];
};

function status(opts: FetchJobOptions, line: string) {
  opts.onStatus?.(line);
}

async function runStep(
  opts: FetchJobOptions,
  cmd: AutomationCommand,
  timeoutMs = 45000
) {
  return opts.bridge.run(opts.inject, cmd, timeoutMs);
}

/**
 * Multi-month LOGA3 fetch — mirrors Desktop runDownloadPipeline loop.
 */
export async function runFetchJob(opts: FetchJobOptions): Promise<FetchJobResult> {
  const {
    username,
    password,
    months,
    year,
    bridge,
  } = opts;

  const sleep = opts.delay || ((ms: number) => bridge.delay(ms));

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
  };

  status(opts, 'Login…');
  await runStep(opts, { type: 'fillLogin', username: username.trim(), password });
  await sleep(400);
  await runStep(opts, { type: 'submitLogin' });
  await sleep(3500);

  // Best-effort: open mask if landing page shows "öffnen"
  try {
    status(opts, 'Öffnen…');
    await runStep(opts, { type: 'clickOeffnen' }, 8000);
    await sleep(2500);
  } catch {
    status(opts, 'Öffnen übersprungen (bereits in Maske?)');
  }

  try {
    await runStep(opts, { type: 'armCalendarReload' }, 8000);
    await sleep(1500);
  } catch {
    status(opts, 'Aktualisieren nicht gefunden — Monatswahl evtl. nur Header');
  }

  const sorted = [...months].sort((a, b) => a - b);

  for (const month of sorted) {
    const label = `${String(month).padStart(2, '0')}/${year}`;
    try {
      status(opts, `${label}: Monat wählen…`);
      const sel = await runStep(opts, { type: 'selectMonth', month, year }, 60000);
      if (!sel.selected && sel.ok === false) {
        throw new Error(sel.error || 'Monat nicht wählbar');
      }
      await sleep(2000);

      status(opts, `${label}: Plan prüfen…`);
      try {
        await runStep(opts, { type: 'assertHasPlan' }, 10000);
      } catch (e) {
        const err = e as Error & { code?: string };
        if (err.code === 'NO_PLAN' || /NO_PLAN/i.test(err.message)) {
          status(opts, `${label}: kein Plan (NO_PLAN) — übersprungen`);
          result.skippedNoPlan.push(label);
          continue;
        }
        throw e;
      }

      status(opts, `${label}: SmartEdin / Export…`);
      await runStep(opts, { type: 'clickSmartEdin' });
      await sleep(1500);
      try {
        await runStep(opts, { type: 'clickExport' }, 12000);
        await sleep(800);
      } catch {
        // SmartEdin panel may already show Zeitprotokoll
      }

      status(opts, `${label}: Zeitprotokoll…`);
      const pdfPromise = bridge.waitForPdf(120000);
      await runStep(opts, { type: 'openZeitprotokoll' });
      await sleep(2000);

      status(opts, `${label}: Download…`);
      await runStep(opts, { type: 'clickDownload' }, 60000);
      const pdf = await pdfPromise;
      if (!pdf.base64 || pdf.base64.length < 64) {
        throw new Error('PDF-Download leer oder Capture fehlgeschlagen');
      }

      const path = await savePdfBase64(pdf.base64, month, year);
      result.savedPdfs.push(path);
      status(opts, `${label}: PDF gespeichert (${pdf.size || '?'} B) — Parse…`);

      const buf = base64ToArrayBuffer(pdf.base64);
      const text = await extractTextFromPdfBuffer(buf);
      if (!text.trim()) {
        throw new Error('PDF-Text leer (pdf.js)');
      }
      result.texts.push(`### ${label}\n${text}`);

      const snap = getSnapshot();
      const converted = convertPdfText(text, {
        preset: snap.preset || BUILTIN_PRESET,
        userMappings: snap.userMappings,
      });
      result.entries.push(...converted.entries);
      status(opts, `${label}: ${converted.entries.length} Schichten`);

      try {
        await runStep(opts, { type: 'closeDialog' }, 8000);
      } catch {
        // ignore
      }
      await sleep(800);
    } catch (e) {
      const msg = `${label}: ${e instanceof Error ? e.message : String(e)}`;
      result.errors.push(msg);
      status(opts, `Fehler ${msg}`);
      try {
        await runStep(opts, { type: 'closeDialog' }, 5000);
      } catch {
        // ignore
      }
    }
  }

  result.entries.sort((a, b) => a.date.localeCompare(b.date) || (a.start || '').localeCompare(b.start || ''));

  if (result.entries.length) {
    const existing = opts.replaceEntries === false ? getSnapshot().entries : [];
    const merged = opts.replaceEntries === false
      ? [...existing, ...result.entries]
      : result.entries;
    // de-dupe by date+start+end+type
    const seen = new Set<string>();
    const unique = merged.filter((e) => {
      const k = `${e.date}|${e.start || ''}|${e.end || ''}|${e.type}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    await setEntries(unique, {
      rawText: result.texts.join('\n\n'),
      summary: null,
    });
  }

  if (!result.entries.length && result.errors.length) {
    throw new Error(result.errors.join(' · '));
  }
  if (!result.entries.length && result.skippedNoPlan.length && !result.errors.length) {
    throw new Error(`Keine Schichten — NO_PLAN für: ${result.skippedNoPlan.join(', ')}`);
  }

  return result;
}
