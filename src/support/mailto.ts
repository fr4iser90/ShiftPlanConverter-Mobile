import { Linking } from 'react-native';
import Constants from 'expo-constants';

import { getSnapshot } from '../state/store';
import { MAILTO_SAFE_CHARS, SUPPORT_EMAIL } from './legal';

export function trimForMailto(text: string, maxChars = MAILTO_SAFE_CHARS): string {
  const t = String(text || '').trim();
  if (t.length <= maxChars) return t;
  return `${t.slice(0, maxChars).trimEnd()}\n… [gekürzt für mailto]`;
}

export async function openSupportMail(opts: {
  subject: string;
  body: string;
  email?: string;
}): Promise<void> {
  const email = opts.email || SUPPORT_EMAIL;
  const href = `mailto:${email}?subject=${encodeURIComponent(opts.subject)}&body=${encodeURIComponent(
    opts.body
  )}`;
  const can = await Linking.canOpenURL(href);
  if (!can) {
    throw new Error(`Kein Mail-Client für ${email}`);
  }
  await Linking.openURL(href);
}

export function appVersionLabel(): string {
  const v =
    Constants.expoConfig?.version ||
    Constants.nativeAppVersion ||
    Constants.nativeBuildVersion ||
    '?';
  return String(v);
}

export function buildSupportMailBody(opts: {
  hospital?: string;
  group?: string;
  area?: string;
  note?: string;
  sample?: string;
}): string {
  const parts = [
    'Hallo,',
    '',
    'Support-Anfrage aus ShiftPlan Converter:',
    '',
    `App-Version: ${appVersionLabel()}`,
    `Arbeitgeber: ${opts.hospital || '—'}`,
    `Berufsgruppe: ${opts.group || '—'}`,
    `Bereich: ${opts.area || '—'}`,
  ];
  if (opts.note?.trim()) parts.push(`Hinweis: ${opts.note.trim()}`);
  parts.push('');
  if (opts.sample?.trim()) {
    parts.push('Anonymisierter Parser-Ausschnitt:', '---', trimForMailto(opts.sample), '---');
  } else {
    parts.push('(Kein Sample angehängt — nur Meta.)');
  }
  parts.push('', 'Danke!');
  return parts.join('\n');
}

/** Error report: message + pack meta only — never credentials, never raw PDF. */
export function buildErrorReportMailBody(opts: {
  error: string;
  hospital?: string;
  group?: string;
  area?: string;
  context?: string;
}): string {
  const parts = [
    'Hallo,',
    '',
    'Fehlerbericht aus ShiftPlan Converter:',
    '',
    `App-Version: ${appVersionLabel()}`,
    `Arbeitgeber: ${opts.hospital || '—'}`,
    `Berufsgruppe: ${opts.group || '—'}`,
    `Bereich: ${opts.area || '—'}`,
  ];
  if (opts.context?.trim()) parts.push(`Kontext: ${opts.context.trim()}`);
  parts.push('', 'Fehlermeldung:', '---', trimForMailto(opts.error, 900), '---');
  parts.push(
    '',
    'Hinweis: Keine Zugangsdaten / keine Roh-PDFs in dieser Mail.',
    '',
    'Danke!'
  );
  return parts.join('\n');
}

export async function openErrorReportMail(opts: {
  error: string;
  context?: string;
}): Promise<void> {
  const snap = getSnapshot();
  await openSupportMail({
    subject: 'ShiftPlan Converter — Fehlerbericht',
    body: buildErrorReportMailBody({
      error: opts.error,
      context: opts.context,
      hospital: snap.hospitalId || undefined,
      group: snap.groupId || undefined,
      area: snap.areaId || undefined,
    }),
  });
}
