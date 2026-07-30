/**
 * Config-driven payroll / Zeitprotokoll PDF engine.
 * Match targets come from pack `parsers/pdf.json` — not i18n.
 */
import type { MonthSummary, ParseResult, ShiftEntry } from '../../types';
import type { PackPdfConfig } from './types';
import { compilePattern, toIsoDate } from './shared';

export const PDF_PAYROLL_ENGINE_ID = 'pdf-payroll' as const;

function newSummary(): MonthSummary {
  return {
    month: null,
    year: null,
    carryOverPreviousMonth: null,
    carryOverNextMonth: null,
    periodPepTarget: null,
    periodContractTarget: null,
    periodActual: null,
    periodBalance: null,
    onCallPayout: null,
    onCallTimeAccount: null,
  };
}

function hasUsefulSummary(s: MonthSummary): boolean {
  return !!(
    s.carryOverPreviousMonth ||
    s.carryOverNextMonth ||
    s.periodActual ||
    s.periodBalance ||
    s.onCallPayout ||
    s.onCallTimeAccount
  );
}

export function parsePdfPayroll(text: string, config?: PackPdfConfig | null): ParseResult {
  if (!config?.monthHeader || !config.shift) {
    throw new Error('pdf-payroll requires monthHeader + shift in pack pdf.json');
  }

  const lines = text.normalize('NFC').split('\n');
  const mainEntries: ShiftEntry[] = [];
  const onCallEntries: ShiftEntry[] = [];
  let currentYear = '';
  let currentMonth = '';

  const monthYearRegex = compilePattern(config.monthHeader.pattern, config.monthHeader.flags);
  const monthG = config.monthHeader.monthGroup ?? 1;
  const yearG = config.monthHeader.yearGroup ?? 2;

  const shiftRule = config.shift;
  const shiftRegex = compilePattern(shiftRule.pattern, shiftRule.flags);
  const dayG = shiftRule.dayGroup ?? 1;
  const startG = shiftRule.startGroup ?? 2;
  const endG = shiftRule.endGroup ?? 3;

  const allDayRules = (config.allDay || []).map((r) => ({
    ...r,
    re: compilePattern(r.pattern, r.flags),
  }));

  const onCall = config.onCall
    ? {
        re: compilePattern(config.onCall.pattern, config.onCall.flags),
        fallback: config.onCall.fallbackPattern
          ? compilePattern(config.onCall.fallbackPattern, config.onCall.fallbackFlags)
          : null,
        type: config.onCall.type || 'BEREIT',
        dateG: config.onCall.dateGroup ?? 1,
        startG: config.onCall.startGroup ?? 2,
        endG: config.onCall.endGroup ?? 3,
        pctG: config.onCall.onCallPercentGroup,
        bewG: config.onCall.onCallRatedGroup,
      }
    : null;

  const onCallSectionRe = config.onCallSection
    ? compilePattern(config.onCallSection, config.onCallSectionFlags)
    : null;
  const mainRestart = config.mainSectionRestart
    ? compilePattern(config.mainSectionRestart, config.mainSectionRestartFlags)
    : null;

  const summaryRules = (config.summary || []).map((s) => ({
    ...s,
    re: compilePattern(s.pattern, s.flags),
  }));

  const summaries: MonthSummary[] = [];
  let summary = newSummary();
  let inOnCallSection = false;

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
      if (summary.month && summary.month !== monthYearMatch[monthG]) {
        flushSummary();
      }
      currentMonth = monthYearMatch[monthG];
      currentYear = monthYearMatch[yearG];
      summary.month = currentMonth;
      summary.year = currentYear;
      inOnCallSection = false;
    }

    if (mainRestart?.test(line)) {
      inOnCallSection = false;
    }

    for (const s of summaryRules) {
      const m = line.match(s.re);
      if (!m) continue;
      if (s.groups) {
        for (const [key, g] of Object.entries(s.groups)) {
          if (g != null) {
            (summary as unknown as Record<string, string | null>)[key] = m[g] ?? null;
          }
        }
      } else {
        const g = s.group ?? 1;
        (summary as unknown as Record<string, string | null>)[s.field] = m[g] ?? null;
      }
    }

    if (onCallSectionRe?.test(line)) {
      inOnCallSection = true;
      continue;
    }

    if (inOnCallSection && onCall) {
      const onCallMatch = line.match(onCall.re) || (onCall.fallback ? line.match(onCall.fallback) : null);
      if (onCallMatch) {
        const dateStr = onCallMatch[onCall.dateG];
        const startTime = onCallMatch[onCall.startG];
        const endTime = onCallMatch[onCall.endG];
        const [day, month, year] = dateStr.split('.');
        const fullDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        const entry: ShiftEntry = {
          type: onCall.type,
          date: fullDate,
          start: startTime,
          end: endTime,
        };
        if (onCall.pctG != null && onCallMatch[onCall.pctG] != null) {
          entry.onCallPercent = onCallMatch[onCall.pctG];
        }
        if (onCall.bewG != null && onCallMatch[onCall.bewG] != null) {
          entry.onCallRated = onCallMatch[onCall.bewG];
        }
        onCallEntries.push(entry);
      }
      continue;
    }

    if (!currentYear || !currentMonth) continue;

    const shiftMatch = line.match(shiftRegex);
    if (shiftMatch) {
      const day = shiftMatch[dayG];
      const date = toIsoDate(currentYear, currentMonth, day);
      const entry: ShiftEntry = {
        type: shiftRule.type || 'WORK',
        date,
        start: shiftMatch[startG],
        end: shiftMatch[endG],
        isWork: true,
      };
      if (shiftRule.extra) {
        for (const [key, g] of Object.entries(shiftRule.extra)) {
          if (g != null && shiftMatch[g] != null) {
            (entry as unknown as Record<string, string | undefined>)[key] = shiftMatch[g];
          }
        }
      }
      mainEntries.push(entry);
      continue;
    }

    for (const rule of allDayRules) {
      const m = line.match(rule.re);
      if (!m) continue;
      const day = m[rule.dayGroup ?? 1];
      const date = toIsoDate(currentYear, currentMonth, day);
      let type = rule.type || '';
      if (rule.typeFromGroup != null) {
        type = String(m[rule.typeFromGroup] || '').toUpperCase();
        if (rule.normalize?.[type]) type = rule.normalize[type];
      }
      mainEntries.push({ type, date, allDay: true, isSpecial: true });
      break;
    }
  }

  flushSummary();

  return {
    year: currentYear,
    month: currentMonth,
    mainEntries,
    onCallEntries,
    summary: summaries[summaries.length - 1] || null,
    summaries,
  };
}
