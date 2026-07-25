import type { ShiftEntry } from '../convert/types';

/** Unfold ICS lines (RFC 5545). */
function unfold(ics: string): string[] {
  const raw = ics.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const lines: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

function prop(line: string): { name: string; value: string } | null {
  const i = line.indexOf(':');
  if (i < 0) return null;
  const left = line.slice(0, i);
  const value = line.slice(i + 1);
  const name = left.split(';')[0].toUpperCase();
  return { name, value };
}

/** Parse DTSTART/DTEND like 20260715T073000 or 20260715. */
function parseIcsDate(v: string): { date: string; time?: string } {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?/.exec(v.trim());
  if (!m) return { date: '' };
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  if (m[4]) return { date, time: `${m[4]}:${m[5]}` };
  return { date };
}

/**
 * Minimal ICS → shifts (VEVENT only). SUMMARY → type; DTSTART/DTEND → times.
 */
export function parseIcsShifts(icsText: string): ShiftEntry[] {
  const lines = unfold(icsText);
  const entries: ShiftEntry[] = [];
  let inEvent = false;
  let summary = '';
  let dtStart = '';
  let dtEnd = '';

  const flush = () => {
    if (!dtStart) return;
    const s = parseIcsDate(dtStart);
    if (!s.date) return;
    const e = dtEnd ? parseIcsDate(dtEnd) : { date: s.date, time: undefined };
    const allDay = !s.time;
    entries.push({
      date: s.date,
      type: summary || 'SHIFT',
      start: allDay ? undefined : s.time,
      end: allDay ? undefined : e.time || s.time,
      allDay,
      isValidated: false,
    });
  };

  for (const line of lines) {
    const p = prop(line);
    if (!p) continue;
    if (p.name === 'BEGIN' && p.value.toUpperCase() === 'VEVENT') {
      inEvent = true;
      summary = '';
      dtStart = '';
      dtEnd = '';
      continue;
    }
    if (!inEvent) continue;
    if (p.name === 'END' && p.value.toUpperCase() === 'VEVENT') {
      flush();
      inEvent = false;
      continue;
    }
    if (p.name === 'SUMMARY') summary = p.value.replace(/\\,/g, ',').replace(/\\n/g, ' ');
    if (p.name === 'DTSTART') dtStart = p.value;
    if (p.name === 'DTEND') dtEnd = p.value;
  }
  return entries;
}
