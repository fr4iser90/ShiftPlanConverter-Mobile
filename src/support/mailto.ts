import { Linking } from 'react-native';
import Constants from 'expo-constants';

import { t } from '../i18n';
import { getSnapshot } from '../state/store';
import { MAILTO_SAFE_CHARS, SUPPORT_EMAIL } from './legal';

export function trimForMailto(text: string, maxChars = MAILTO_SAFE_CHARS): string {
  const s = String(text || '').trim();
  if (s.length <= maxChars) return s;
  return `${s.slice(0, maxChars).trimEnd()}\n${t('mailTrimmed')}`;
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
    throw new Error(t('mailNoClient', { email }));
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
    t('mailHello'),
    '',
    t('mailSupportIntro'),
    '',
    t('mailAppVersion', { version: appVersionLabel() }),
    t('mailEmployer', { value: opts.hospital || '—' }),
    t('mailGroup', { value: opts.group || '—' }),
    t('mailArea', { value: opts.area || '—' }),
  ];
  if (opts.note?.trim()) parts.push(t('mailNote', { value: opts.note.trim() }));
  parts.push('');
  if (opts.sample?.trim()) {
    parts.push(t('mailSampleHeader'), '---', trimForMailto(opts.sample), '---');
  } else {
    parts.push(t('mailNoSample'));
  }
  parts.push('', t('mailThanks'));
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
    t('mailHello'),
    '',
    t('mailErrorIntro'),
    '',
    t('mailAppVersion', { version: appVersionLabel() }),
    t('mailEmployer', { value: opts.hospital || '—' }),
    t('mailGroup', { value: opts.group || '—' }),
    t('mailArea', { value: opts.area || '—' }),
  ];
  if (opts.context?.trim()) parts.push(t('mailContext', { value: opts.context.trim() }));
  parts.push('', t('mailErrorHeader'), '---', trimForMailto(opts.error, 900), '---');
  parts.push('', t('mailNoSecrets'), '', t('mailThanks'));
  return parts.join('\n');
}

export async function openErrorReportMail(opts: {
  error: string;
  context?: string;
}): Promise<void> {
  const snap = getSnapshot();
  await openSupportMail({
    subject: t('mailErrorSubject'),
    body: buildErrorReportMailBody({
      error: opts.error,
      context: opts.context,
      hospital: snap.hospitalId || undefined,
      group: snap.groupId || undefined,
      area: snap.areaId || undefined,
    }),
  });
}
