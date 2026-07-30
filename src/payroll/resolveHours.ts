import type { ShiftEntry } from '../convert/types';
import type { MappingValue } from '../convert/types';
import { mappingType, shiftTypeForCode } from '../convert/shiftMapping';
import type { PayrollDienstart, PayrollHourFields, PayrollProfile } from './types';
import {
  calendarInfo,
  durationHours,
  parseDeHours,
  sameYearMonth,
  type CalendarInfo,
} from './calendar';

function money(n: number): number {
  return Math.round((n || 0) * 100) / 100;
}

function emptyHours(): Required<PayrollHourFields> {
  return {
    paidBd: 0,
    timeOff: 0,
    bd15: 0,
    bdSunHol25: 0,
    bdNight: 0,
    bdNight004: 0,
    activeNight: 0,
    sundayReg: 0,
    holidayReg: 0,
    saturdayReg: 0,
  };
}

function addHours(
  a: Required<PayrollHourFields>,
  b: PayrollHourFields
): Required<PayrollHourFields> {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const key = k as keyof PayrollHourFields;
    out[key] = money((out[key] || 0) + (v || 0));
  }
  return out;
}

function isNightPattern(id: string): boolean {
  return id.includes('NACHT') || id.endsWith('MO_DO') || id.endsWith('FR_VF');
}

function isTagPattern(id: string): boolean {
  return id.includes('_TAG');
}

/**
 * Ärzte: pick dienstart id from date + OP/ITS (+ Tag/Nacht) like Thomas deriveDienstId.
 */
export function deriveArztDienstId(
  dateStr: string,
  choice: string,
  isTransfer = false
): string {
  const ci = calendarInfo(dateStr);
  const prefix = String(choice || 'OP').toUpperCase().startsWith('ITS') ? 'ITS' : 'OP';
  if (isTransfer || String(choice).includes('TRANSFER')) {
    return prefix === 'ITS' ? 'UEBERTRAG_ITS' : 'UEBERTRAG_OP';
  }
  if (!ci) return prefix === 'ITS' ? 'ITS_MO_DO' : 'OP_MO_DO';
  const nextFree = ci.nextIsHoliday || ci.nextIsSaturday || ci.nextIsSunday;
  const isTag = String(choice).includes('TAG');
  const isNight = String(choice).includes('NACHT') || (!isTag && (ci.isSaturday || ci.isSunday || ci.isHoliday));

  if (ci.isSaturday || ci.isSunday || ci.isHoliday) {
    if (isTag || String(choice).includes('TAG')) return `${prefix}_SA_SO_FT_TAG`;
    if (prefix === 'ITS') {
      if (ci.isSaturday) return 'ITS_SA_NACHT';
      if ((ci.isSunday || ci.isHoliday) && !nextFree) return 'ITS_SO_FT_NACHT_VWT';
      return 'ITS_FT_NACHT_VF';
    }
    return nextFree ? 'OP_SA_SO_FT_NACHT_VF' : 'OP_SO_FT_NACHT_VWT';
  }
  if (ci.isFriday || ci.nextIsHoliday) return `${prefix}_FR_VF`;
  return `${prefix}_MO_DO`;
}

function choiceFromEntryCode(code: string): string {
  const c = code.toUpperCase();
  if (c.startsWith('ITS') || c.includes('HAUS')) return 'ITS';
  if (c === 'OP' || c === 'RD' || c.startsWith('OP') || c.includes('RUF')) return 'OP';
  if (c.startsWith('BEREIT')) return 'ITS'; // default Hausdienst when only BEREIT*
  return c;
}

/** Thomas localHolidayBd25 — Feiertags-BD 25 % (LA 361). */
function localHolidayBd25(dienstId: string, dateStr: string): number | null {
  const ci = calendarInfo(dateStr);
  if (!ci) return null;
  const id = dienstId;
  const p = id.startsWith('ITS') ? 'ITS' : 'OP';
  if (p === 'ITS') {
    if (id === 'ITS_FR_VF' && ci.nextIsHoliday) return sameYearMonth(dateStr, ci.nextIso) ? 9 : 0;
    if (ci.isHoliday && id === 'ITS_SA_SO_FT_TAG') return 10.5;
    if (ci.isHoliday && (id === 'ITS_SO_FT_NACHT_VWT' || id === 'ITS_FT_NACHT_VF')) {
      return ci.nextIsHoliday ? 10.5 : 3.5;
    }
    if (id === 'ITS_SA_NACHT') return 0;
  }
  if (p === 'OP') {
    if (id === 'OP_FR_VF' && ci.nextIsHoliday) return sameYearMonth(dateStr, ci.nextIso) ? 8 : 0;
    if (ci.isHoliday && id === 'OP_SA_SO_FT_TAG') return 12;
    if (ci.isHoliday && (id === 'OP_SO_FT_NACHT_VWT' || id === 'OP_SA_SO_FT_NACHT_VF')) {
      return ci.nextIsHoliday ? 12 : 4;
    }
  }
  return null;
}

function currentMonthNightPartBeforeMidnight(id: string): number {
  if (id.startsWith('ITS_') && id.includes('NACHT')) return 3.5;
  return 4;
}

function applyArztCalendarOverrides(
  hours: Required<PayrollHourFields>,
  def: PayrollDienstart,
  dateStr: string,
  isTransfer: boolean
): Required<PayrollHourFields> {
  const ci = calendarInfo(dateStr);
  if (!ci) return hours;
  let h = { ...hours };

  if (isTransfer || def.kat === 'Übertrag') {
    h.bdSunHol25 = 0;
    h.bdNight = 2;
    h.bdNight004 = 4;
    h.activeNight = 0;
    h.sundayReg = 0;
    h.holidayReg = 0;
    h.paidBd = 0;
    h.bd15 = 0;
    const p = def.id === 'UEBERTRAG_ITS' ? 'ITS' : 'OP';
    if (ci.isHoliday) h.bdSunHol25 = p === 'ITS' ? 9 : 8;
    if (p === 'ITS' && ci.isSunday && !ci.isHoliday) h.sundayReg = 1;
    return h;
  }

  const crossesMonth =
    ci.nextIso && !sameYearMonth(dateStr, ci.nextIso) && isNightPattern(def.id);
  if (crossesMonth) {
    h.bdNight004 = 0;
    h.bdNight = currentMonthNightPartBeforeMidnight(def.id);
  }

  const bd25 = localHolidayBd25(def.id, dateStr);
  if (bd25 !== null) h.bdSunHol25 = bd25;

  if (def.kat === 'Hausdienst') {
    const reg = isTagPattern(def.id) ? 2 : isNightPattern(def.id) ? 1 : 0;
    h.sundayReg = 0;
    h.holidayReg = 0;
    if (ci.isHoliday) h.holidayReg = reg;
    else if (ci.isSunday) h.sundayReg = reg;
    else if (def.id === 'ITS_SA_NACHT' && ci.nextIsSunday) h.sundayReg = 1;
  }
  return h;
}

function findByCode(profile: PayrollProfile, code: string): PayrollDienstart | undefined {
  const c = code.toUpperCase();
  return profile.dienstarten.find((d) =>
    (d.codes || []).some((x) => x.toUpperCase() === c)
  );
}

function findById(profile: PayrollProfile, id: string): PayrollDienstart | undefined {
  return profile.dienstarten.find((d) => d.id === id);
}

function findByMatchType(
  profile: PayrollProfile,
  matchType: string
): PayrollDienstart | undefined {
  const t = matchType.trim().toLowerCase();
  return profile.dienstarten.find((d) => String(d.matchType || '').trim().toLowerCase() === t);
}

function resolvePflegeShiftType(
  entry: ShiftEntry,
  code: string,
  presetMapping?: Record<string, MappingValue> | null,
  codeAliases?: Record<string, string> | null
): string | null {
  if (presetMapping) {
    const byCode = shiftTypeForCode(code, presetMapping, codeAliases);
    if (byCode) return byCode;
    if (entry.start && entry.end) {
      const key = `${entry.start}-${entry.end}`;
      const t = mappingType(presetMapping[key]);
      if (t) return t;
    }
  }
  return null;
}

export type HoursForEntryOpts = {
  /** Pack preset (time→code). Required for Pflege matchType resolution. */
  presetMapping?: Record<string, MappingValue> | null;
  codeAliases?: Record<string, string> | null;
};

/**
 * Resolve hour contributions for one calendar entry.
 */
export function hoursForEntry(
  profile: PayrollProfile,
  entry: ShiftEntry,
  opts?: HoursForEntryOpts
): { hours: Required<PayrollHourFields>; matched: boolean; dienstartId?: string; note?: string } {
  const code = String(entry.type || '').trim().toUpperCase();
  if (!code) return { hours: emptyHours(), matched: false };

  // All-day leave: U/K counted separately by caller
  if (entry.allDay) {
    return { hours: emptyHours(), matched: true, note: 'allDay' };
  }

  if (profile.tarifFamily === 'avr-aerzte') {
    const choice = choiceFromEntryCode(code);
    const isTransfer = /UEBERTRAG|TRANSFER|ÜBERTRAG/i.test(code);
    // Prefer explicit code match; else derive from calendar + OP/ITS
    let def = findByCode(profile, code);
    let dienstId = def?.id;
    if (!def || /^(ITS|OP|RD)$/i.test(code) || code.startsWith('BEREIT')) {
      dienstId = deriveArztDienstId(entry.date, choice, isTransfer);
      def = findById(profile, dienstId);
    }
    if (!def) return { hours: emptyHours(), matched: false };
    let h = addHours(emptyHours(), def.hours);
    h = applyArztCalendarOverrides(h, def, entry.date, isTransfer || def.kat === 'Übertrag');
    return { hours: h, matched: true, dienstartId: def.id };
  }

  // Pflege: codes + types from pack mapping; payroll only has matchType → hours
  const shiftType = resolvePflegeShiftType(
    entry,
    code,
    opts?.presetMapping,
    opts?.codeAliases
  );
  const def =
    (shiftType ? findByMatchType(profile, shiftType) : undefined) ||
    // Legacy fallback if profile still lists codes
    findByCode(profile, code);
  if (!def) return { hours: emptyHours(), matched: false };

  let h = addHours(emptyHours(), def.hours);
  const ci = calendarInfo(entry.date);

  // Samstagszuschlag: work shifts on Saturday → duration (or Ist) hours
  if (ci?.isSaturday && def.kat === 'Arbeit') {
    const dur =
      parseDeHours(entry.actual) ||
      durationHours(entry.start, entry.end) ||
      0;
    if (dur > 0) h.saturdayReg = money(dur);
  }

  // Month-crossing night: strip 00–04 from current month (like Ärzte)
  const isNightRule =
    String(def.matchType || '').toLowerCase() === 'night' ||
    def.id === 'B38_NIGHT' ||
    def.id === 'B39_NIGHT' ||
    def.id === 'NIGHT';
  if (ci && isNightRule) {
    const crosses = ci.nextIso && !sameYearMonth(entry.date, ci.nextIso);
    if (crosses) {
      h.bdNight004 = 0;
      // Night before midnight ≈ 4h; gold used full-month nights otherwise.
      h.bdNight = Math.min(h.bdNight, 4);
    }
  }

  return {
    hours: h,
    matched: Object.keys(def.hours || {}).length > 0 || h.saturdayReg > 0,
    dienstartId: def.id,
  };
}

export function sumHoursForEntries(
  profile: PayrollProfile,
  entries: ShiftEntry[],
  opts?: HoursForEntryOpts
): {
  hours: Required<PayrollHourFields>;
  matched: number;
  unmatched: number;
  urlaubDays: number;
} {
  let hours = emptyHours();
  let matched = 0;
  let unmatched = 0;
  let urlaubDays = 0;

  for (const e of entries) {
    const code = String(e.type || '').trim().toUpperCase();
    if (e.allDay && /URLAUB|URLTV|U\b|KRANK|KROAU/.test(code)) {
      if (/URLAUB|URLTV|^U$/.test(code)) urlaubDays += 1;
      matched += 1;
      continue;
    }
    const r = hoursForEntry(profile, e, opts);
    if (!r.matched) {
      if (code) unmatched += 1;
      continue;
    }
    if (r.note === 'allDay') continue;
    matched += 1;
    hours = addHours(hours, r.hours);
  }

  return { hours, matched, unmatched, urlaubDays };
}

export type { CalendarInfo };
