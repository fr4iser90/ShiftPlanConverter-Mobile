import { Linking } from 'react-native';
import Constants from 'expo-constants';

import { t } from '../i18n';
import { getSnapshot } from '../state/store';
import { appendDiag, formatDiagLog } from './diagLog';
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
  pack?: string;
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
    t('mailEmployer', { value: opts.pack || '—' }),
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

/** Error report: message + pack meta + recent status log — never credentials, never raw PDF. */
export function buildErrorReportMailBody(opts: {
  error: string;
  pack?: string;
  group?: string;
  area?: string;
  context?: string;
  diagLog?: string;
}): string {
  const parts = [
    t('mailHello'),
    '',
    t('mailErrorIntro'),
    '',
    t('mailAppVersion', { version: appVersionLabel() }),
    t('mailEmployer', { value: opts.pack || '—' }),
    t('mailGroup', { value: opts.group || '—' }),
    t('mailArea', { value: opts.area || '—' }),
  ];
  if (opts.context?.trim()) parts.push(t('mailContext', { value: opts.context.trim() }));
  parts.push('', t('mailErrorHeader'), '---', trimForMailto(opts.error, 500), '---');
  const diag = (opts.diagLog ?? formatDiagLog(650)).trim();
  if (diag) {
    parts.push('', t('mailDiagHeader'), '---', trimForMailto(diag, 650), '---');
  }
  parts.push('', t('mailNoSecrets'), '', t('mailThanks'));
  return trimForMailto(parts.join('\n'), MAILTO_SAFE_CHARS);
}

export async function openErrorReportMail(opts: {
  error: string;
  context?: string;
}): Promise<void> {
  appendDiag(`ERROR${opts.context ? ` [${opts.context}]` : ''}: ${opts.error}`);
  const snap = getSnapshot();
  await openSupportMail({
    subject: t('mailErrorSubject'),
    body: buildErrorReportMailBody({
      error: opts.error,
      context: opts.context,
      pack: snap.packId || undefined,
      group: snap.groupId || undefined,
      area: snap.areaId || undefined,
      diagLog: formatDiagLog(650),
    }),
  });
}

/** Pack-shaped fragment from local userMappings (ready to paste into preset JSON). */
export function buildPackPresetFragmentFromUserMappings(
  userMappings: Record<string, string>,
  presetName = 'Standard'
): {
  presets: Record<string, Record<string, { code: string; type: string; isValidated: boolean }>>;
} {
  const preset: Record<string, { code: string; type: string; isValidated: boolean }> = {};
  for (const key of Object.keys(userMappings || {}).sort()) {
    const code = String(userMappings[key] || '').trim();
    if (!code) continue;
    preset[key] = { code, type: 'work', isValidated: false };
  }
  return { presets: { [presetName]: preset } };
}

export function buildMappingContributionMailBody(opts: {
  pack?: string;
  group?: string;
  area?: string;
  preset?: string;
  userMappings: Record<string, string>;
}): string {
  const preset = opts.preset?.trim() || 'Standard';
  const fragment = buildPackPresetFragmentFromUserMappings(opts.userMappings, preset);
  const json = JSON.stringify(fragment, null, 2);
  const parts = [
    t('mailHello'),
    '',
    t('mailMappingIntro'),
    '',
    t('mailAppVersion', { version: appVersionLabel() }),
    t('mailEmployer', { value: opts.pack || '—' }),
    t('mailGroup', { value: opts.group || '—' }),
    t('mailArea', { value: opts.area || '—' }),
    t('mailPreset', { value: preset }),
    '',
    t('mailMappingHeader'),
    '---',
    trimForMailto(json),
    '---',
    '',
    t('mailNoSecrets'),
    '',
    t('mailThanks'),
  ];
  return parts.join('\n');
}

/** Full body text for clipboard when mailto URL would be too long. */
export function mappingContributionClipboardText(opts: {
  pack?: string;
  group?: string;
  area?: string;
  preset?: string;
  userMappings: Record<string, string>;
}): string {
  const preset = opts.preset?.trim() || 'Standard';
  const fragment = buildPackPresetFragmentFromUserMappings(opts.userMappings, preset);
  return [
    t('mailMappingIntro'),
    '',
    t('mailAppVersion', { version: appVersionLabel() }),
    t('mailEmployer', { value: opts.pack || '—' }),
    t('mailGroup', { value: opts.group || '—' }),
    t('mailArea', { value: opts.area || '—' }),
    t('mailPreset', { value: preset }),
    '',
    JSON.stringify(fragment, null, 2),
  ].join('\n');
}

export async function openMappingContributionMail(opts: {
  pack?: string;
  group?: string;
  area?: string;
  preset?: string;
  userMappings: Record<string, string>;
}): Promise<{ opened: boolean; body: string; clipboardFallback: boolean }> {
  const preset = opts.preset?.trim() || 'Standard';
  const fragment = buildPackPresetFragmentFromUserMappings(opts.userMappings, preset);
  const json = JSON.stringify(fragment, null, 2);
  const clipboardFallback = json.length > MAILTO_SAFE_CHARS;
  const body = buildMappingContributionMailBody(opts);
  await openSupportMail({
    subject: t('mailMappingSubject'),
    body,
  });
  return { opened: true, body, clipboardFallback };
}
