/**
 * St. Elisabeth Leipzig Zeitabrechnung parser (port from Desktop).
 */
import type { MonthSummary, ParseResult, ShiftEntry } from './types';

function newSummary(): MonthSummary {
  return {
    month: null,
    year: null,
    uebertragVormonat: null,
    uebertragFolgemonat: null,
    periodePepSoll: null,
    periodeVertrSoll: null,
    periodeIst: null,
    periodeSaldo: null,
    bereitschaftAuszahlung: null,
    bereitschaftAzk: null,
  };
}

function hasUsefulSummary(s: MonthSummary): boolean {
  return !!(
    s.uebertragVormonat ||
    s.uebertragFolgemonat ||
    s.periodeIst ||
    s.periodeSaldo ||
    s.bereitschaftAuszahlung ||
    s.bereitschaftAzk
  );
}

export function parseStElisabeth(text: string): ParseResult {
  const lines = text.normalize('NFC').split('\n');
  const mainEntries: ShiftEntry[] = [];
  const bereitschaftEntries: ShiftEntry[] = [];
  let currentYear = '';
  let currentMonth = '';

  const monthYearRegex = /Abrechnungsmonat\s+(\d{2})\/(\d{4})/i;
  const shiftRegex =
    /^\s*(\d{2})\s+\S+\s+KO\*\s+(\d{2}:\d{2})\s+GE\*\s+(\d{2}:\d{2})(?:\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([+-]?[\d,]+)\s+([\d,]+))?/;
  const vacationRegex = /^\s*(\d{2})\s+\S+\s+(URLTV|URLAUB)\b/i;
  const krankRegex = /^\s*(\d{2})\s+\S+\s+(KRANK|KR)\b/i;
  const holidayRegex = /^\s*(\d{2})\s+\S+\s+FEIER/i;
  const onCallBereitschaftRegex =
    /^\s*(\d{2}\.\d{2}\.\d{4})\s+.*?(\d{2}:\d{2})\s+(\d{2}:\d{2}).*?(\d+)\s+(\d+)\s+([\d,]+)\s*$/;
  const onCallBereitschaftFallback =
    /^\s*(\d{2}\.\d{2}\.\d{4})\s+.*?(\d{2}:\d{2})\s+(\d{2}:\d{2})/;
  const bereitSectioRegex = /Bereitschaftsdienste/i;
  const uebertragVonRegex = /(?:Ü|Ue|U)bertrag\s+aus\s+Vormonat\s+([+-]?[\d,]+)/i;
  const uebertragNachRegex = /(?:Ü|Ue|U)bertrag\s+in\s+Folgemonat\s+([+-]?[\d,]+)/i;
  const periodeRegex =
    /Periode\s*\([^)]+\)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([+-]?[\d,]+)/i;
  const auszahlungRegex = /Bereitschaft\s+zur\s+Auszahlung\s+([+-]?[\d,]+)/i;
  const bereitAzkRegex = /Bereitschaft\s+in\s+das\s+AZK\s+([+-]?[\d,]+)/i;

  const summaries: MonthSummary[] = [];
  let summary = newSummary();
  let inBereitschaftSection = false;

  function flushSummary() {
    if (hasUsefulSummary(summary)) {
      if (!summary.month && currentMonth) summary.month = currentMonth;
      if (!summary.year && currentYear) summary.year = currentYear;
      summaries.push(summary);
    }
    summary = newSummary();
  }

  for (const line of lines) {
    const monthYearMatch = line.match(monthYearRegex);
    if (monthYearMatch) {
      if (summary.month && summary.month !== monthYearMatch[1]) {
        flushSummary();
      }
      currentMonth = monthYearMatch[1];
      currentYear = monthYearMatch[2];
      summary.month = currentMonth;
      summary.year = currentYear;
      inBereitschaftSection = false;
    }

    if (/Zeitabrechnung/i.test(line)) {
      inBereitschaftSection = false;
    }

    const uebertragVon = line.match(uebertragVonRegex);
    if (uebertragVon) summary.uebertragVormonat = uebertragVon[1];

    const uebertragNach = line.match(uebertragNachRegex);
    if (uebertragNach) summary.uebertragFolgemonat = uebertragNach[1];

    const periode = line.match(periodeRegex);
    if (periode) {
      summary.periodePepSoll = periode[1];
      summary.periodeVertrSoll = periode[2];
      summary.periodeIst = periode[3];
      summary.periodeSaldo = periode[4];
    }

    const auszahlung = line.match(auszahlungRegex);
    if (auszahlung) summary.bereitschaftAuszahlung = auszahlung[1];

    const bereitAzk = line.match(bereitAzkRegex);
    if (bereitAzk) summary.bereitschaftAzk = bereitAzk[1];

    if (bereitSectioRegex.test(line)) {
      inBereitschaftSection = true;
      continue;
    }

    if (inBereitschaftSection) {
      const onCallMatch =
        line.match(onCallBereitschaftRegex) || line.match(onCallBereitschaftFallback);
      if (onCallMatch) {
        const dateStr = onCallMatch[1];
        const startTime = onCallMatch[2];
        const endTime = onCallMatch[3];
        const [day, month, year] = dateStr.split('.');
        const fullDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        const entry: ShiftEntry = { type: 'BEREIT', date: fullDate, start: startTime, end: endTime };
        if (onCallMatch.length >= 7) {
          entry.bereitPercent = onCallMatch[5];
          entry.bewertet = onCallMatch[6];
        }
        bereitschaftEntries.push(entry);
      }
      continue;
    }

    const shiftMatch = line.match(shiftRegex);
    const vacationMatch = line.match(vacationRegex);
    const krankMatch = line.match(krankRegex);
    const holidayMatch = line.match(holidayRegex);

    if (shiftMatch && currentYear && currentMonth) {
      const day = shiftMatch[1];
      const startTime = shiftMatch[2];
      const endTime = shiftMatch[3];
      const date = `${currentYear}-${currentMonth.padStart(2, '0')}-${day.padStart(2, '0')}`;
      const entry: ShiftEntry = {
        type: 'WORK',
        date,
        start: startTime,
        end: endTime,
        isWork: true,
      };
      if (shiftMatch[4] != null) {
        entry.pause = shiftMatch[4];
        entry.pepSoll = shiftMatch[5];
        entry.vertrSoll = shiftMatch[6];
        entry.ist = shiftMatch[7];
        entry.azkDaily = shiftMatch[8];
        entry.azkKum = shiftMatch[9];
      }
      mainEntries.push(entry);
    } else if (vacationMatch && currentYear && currentMonth) {
      const day = vacationMatch[1];
      const date = `${currentYear}-${currentMonth.padStart(2, '0')}-${day.padStart(2, '0')}`;
      mainEntries.push({ type: 'URLAUB', date, allDay: true, isSpecial: true });
    } else if (krankMatch && currentYear && currentMonth) {
      const day = krankMatch[1];
      const date = `${currentYear}-${currentMonth.padStart(2, '0')}-${day.padStart(2, '0')}`;
      mainEntries.push({ type: 'KRANK', date, allDay: true, isSpecial: true });
    } else if (holidayMatch && currentYear && currentMonth) {
      const day = holidayMatch[1];
      const date = `${currentYear}-${currentMonth.padStart(2, '0')}-${day.padStart(2, '0')}`;
      mainEntries.push({ type: 'FEIERTAG', date, allDay: true, isSpecial: true });
    }
  }

  flushSummary();

  return {
    year: currentYear,
    month: currentMonth,
    mainEntries,
    bereitschaftEntries,
    summary: summaries[summaries.length - 1] || null,
    summaries,
  };
}
