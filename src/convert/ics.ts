import { buildEventDescription } from './eventDescription';
import type { ShiftEntry } from './types';

function formatDateTime(date: string, time?: string): string {
  if (!time) return date.replace(/-/g, '') + 'T000000';
  return date.replace(/-/g, '') + 'T' + time.replace(':', '') + '00';
}

function escapeICalText(text: string): string {
  return (text || '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function nextDay(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

/**
 * Build a VCALENDAR string from shift entries (mobile-safe, no DOM).
 */
export function generateIcs(
  entries: ShiftEntry[],
  { richDetails = false }: { richDetails?: boolean } = {}
): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LOGA3-Automation-Mobile//DE',
    'CALSCALE:GREGORIAN',
  ];

  for (const entry of entries) {
    let endDate = entry.date;
    if (!entry.allDay && entry.start && entry.end && entry.end < entry.start) {
      endDate = nextDay(entry.date);
    }

    const start = entry.allDay
      ? formatDateTime(entry.date)
      : formatDateTime(entry.date, entry.start);
    const end = entry.allDay
      ? formatDateTime(entry.date)
      : formatDateTime(endDate, entry.end);

    const uid = [
      entry.date,
      entry.type,
      entry.start || '',
      entry.end || '',
      Math.random().toString(36).slice(2, 10),
    ]
      .join('-')
      .replace(/\s/g, '');

    const description = buildEventDescription(entry, { richDetails });

    lines.push('BEGIN:VEVENT');
    lines.push('UID:' + uid + '@loga3-mobile');
    lines.push('SUMMARY:' + escapeICalText(entry.type));
    lines.push('DESCRIPTION:' + escapeICalText(description));
    if (entry.allDay) {
      lines.push('DTSTART;VALUE=DATE:' + entry.date.replace(/-/g, ''));
      lines.push('DTEND;VALUE=DATE:' + entry.date.replace(/-/g, ''));
    } else {
      lines.push('DTSTART;TZID=Europe/Berlin:' + start);
      lines.push('DTEND;TZID=Europe/Berlin:' + end);
    }
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
