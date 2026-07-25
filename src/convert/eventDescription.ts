import type { ShiftEntry } from './types';
import { t } from '../i18n';

function formatSignedHours(value: string): string {
  const s = String(value).trim();
  if (!s) return s;
  if (s.startsWith('+') || s.startsWith('-')) return s;
  return `+${s}`;
}

/**
 * Calendar event title. With richDetails: include times like Desktop Google sync
 * (`GE* 06:30–15:06`).
 */
export function buildEventSummary(
  entry: ShiftEntry,
  { richDetails = false }: { richDetails?: boolean } = {}
): string {
  let summary = entry.type || '';
  if (richDetails && !entry.allDay && entry.start && entry.end) {
    summary += ` ${entry.start}–${entry.end}`;
  }
  return summary;
}

/**
 * Calendar event body. With richDetails: Pause / Ist / AZK / Bereitschaft (Desktop parity).
 */
export function buildEventDescription(
  entry: ShiftEntry,
  { richDetails = false }: { richDetails?: boolean } = {}
): string {
  const lines = [t('eventDescDisclaimer')];

  if (entry.allDay) {
    lines.push(t('eventDescOriginalAllDay', { type: entry.type }));
  } else {
    lines.push(
      t('eventDescOriginalTimed', {
        type: entry.type,
        start: entry.start || '',
        end: entry.end || '',
      })
    );
  }

  if (richDetails) {
    if (entry.pause) lines.push(t('eventDescPause', { value: entry.pause }));
    if (entry.ist) lines.push(t('eventDescIst', { value: entry.ist }));
    if (entry.azkDaily != null && entry.azkDaily !== '') {
      lines.push(t('eventDescAzkDay', { value: formatSignedHours(entry.azkDaily) }));
    }
    if (entry.bereitPercent != null && entry.bewertet != null) {
      lines.push(
        t('eventDescStandbyRated', {
          pct: entry.bereitPercent,
          rated: entry.bewertet,
        })
      );
    } else if (entry.bereitPercent != null) {
      lines.push(t('eventDescStandby', { pct: entry.bereitPercent }));
    }
  }

  return lines.join('\n');
}
