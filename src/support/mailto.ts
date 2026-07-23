import { Linking } from 'react-native';

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
    'Support-Anfrage aus LOGA3 Automation Mobile:',
    '',
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
