import type { ShiftEntry } from './types';

function formatSignedHours(value: string): string {
  const s = String(value).trim();
  if (!s) return s;
  if (s.startsWith('+') || s.startsWith('-')) return s;
  return `+${s}`;
}

export function buildEventDescription(
  entry: ShiftEntry,
  { richDetails = false }: { richDetails?: boolean } = {}
): string {
  const lines = ['Automatisch importiert aus Dienstplan – keine Gewähr.'];

  if (entry.allDay) {
    lines.push(`Original: ${entry.type}`);
  } else {
    lines.push(`Original: ${entry.type}, ${entry.start}, ${entry.end}`);
  }

  if (richDetails) {
    if (entry.pause) lines.push(`Pause: ${entry.pause}`);
    if (entry.ist) lines.push(`Ist: ${entry.ist}`);
    if (entry.azkDaily != null && entry.azkDaily !== '') {
      lines.push(`AZK Tag: ${formatSignedHours(entry.azkDaily)}`);
    }
    if (entry.bereitPercent != null && entry.bewertet != null) {
      lines.push(`Bereitschaft: ${entry.bereitPercent} % · bewertet ${entry.bewertet}`);
    } else if (entry.bereitPercent != null) {
      lines.push(`Bereitschaft: ${entry.bereitPercent} %`);
    }
  }

  return lines.join('\n');
}
