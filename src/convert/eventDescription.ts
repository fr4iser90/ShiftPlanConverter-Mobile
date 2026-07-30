import type { ShiftEntry } from './types';
import { t } from '../i18n';
import {
  DEFAULT_EVENT_FORMAT,
  type EventFormatPrefs,
} from '../state/eventFormat';

function formatSignedHours(value: string): string {
  const s = String(value).trim();
  if (!s) return s;
  if (s.startsWith('+') || s.startsWith('-')) return s;
  return `+${s}`;
}

/**
 * Calendar event title: shift code (Kürzel), optionally `GE* 06:30–15:06`.
 */
export function buildEventSummary(
  entry: ShiftEntry,
  format: EventFormatPrefs = DEFAULT_EVENT_FORMAT
): string {
  let summary = entry.type || '';
  if (format.titleTimes && !entry.allDay && entry.start && entry.end) {
    summary += ` ${entry.start}–${entry.end}`;
  }
  return summary;
}

/**
 * Calendar event body: disclaimer + original; optional Pause / Ist / AZK / standby
 * only when the field is present and the matching toggle is on.
 */
export function buildEventDescription(
  entry: ShiftEntry,
  format: EventFormatPrefs = DEFAULT_EVENT_FORMAT
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

  if (format.descPause && entry.breakMinutes) {
    lines.push(t('eventDescPause', { value: entry.breakMinutes }));
  }
  if (format.descIst && entry.actual) {
    lines.push(t('eventDescIst', { value: entry.actual }));
  }
  if (format.descAzk && entry.timeAccountDaily != null && entry.timeAccountDaily !== '') {
    lines.push(t('eventDescAzkDay', { value: formatSignedHours(entry.timeAccountDaily) }));
  }
  if (format.descStandby) {
    if (entry.onCallPercent != null && entry.onCallRated != null) {
      lines.push(
        t('eventDescStandbyRated', {
          pct: entry.onCallPercent,
          rated: entry.onCallRated,
        })
      );
    } else if (entry.onCallPercent != null) {
      lines.push(t('eventDescStandby', { pct: entry.onCallPercent }));
    }
  }

  return lines.join('\n');
}
