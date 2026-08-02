import type { Messages } from '../i18n';
import type { PackArea, PackAreaEntry } from './expandAreas';

export type { PackArea, PackAreaEntry, PackAreaSeries } from './expandAreas';

/** When a date×duty time slot applies (same vocabulary as composeRules where useful). */
export type PackDateDutyWhen =
  | 'any'
  | 'weekday'
  | 'weekday-mon-thu'
  | 'friday'
  | 'weekend-or-holiday';

/** One start/end window for a duty column (pack-authored, not OCR-guessed). */
export type PackDateDutyTimeSlot = {
  start: string;
  end: string;
  /** End clock is on the following calendar day (e.g. Hausdienst 11:30→08:30+1). */
  endNextDay?: boolean;
  when?: PackDateDutyWhen;
};

/** Pack column for OCR layout `date-duty` (employer duty headers). */
export type PackDateDutyColumn = {
  id: string;
  /** Short cell label in person×day projection */
  short?: string;
  label?: string;
  /**
   * Normalized substrings matched against header OCR.
   * Default: any match. Set `matchAll: true` for AND (e.g. hausdienst+nacht).
   */
  match: string[];
  matchAll?: boolean;
  /**
   * Wall-plan duty hours for display / later calendar.
   * First best-matching `when` wins for a given date.
   */
  times?: PackDateDutyTimeSlot[];
};

/** Pack config for date × duty-column boards (OCR). */
export type PackDateDutyConfig = {
  columns: PackDateDutyColumn[];
  /** Trailing role tokens stripped from person cells (pack-specific). */
  roleSuffixes?: string[];
  /** Optional regex/string markers that boost layout score. */
  boardMarkers?: string[];
};

/**
 * Per-group (or default) OCR options inside `parsers/ocr.json`.
 * Layout chips + dateDuty vocabulary are scoped here — not shared across Pflege/Arzt.
 */
export type PackOcrScopeConfig = {
  preferredLayout?: string;
  layouts?: string[];
  usePackMapping?: boolean;
  /** Column vocabulary for layout `date-duty` (employer / role specific). */
  dateDuty?: PackDateDutyConfig;
  /**
   * Soft score bumps for auto-detect (0..~0.15). Never hardcodes duty names —
   * only tilts close races (e.g. Anästhesie → date-duty).
   */
  layoutPriors?: Partial<Record<string, number>>;
  /**
   * When false (default if preferredLayout is auto): hide layout chips on Import.
   * Escape hatch: Settings → OCR, or uncertainty modal during auto.
   */
  showLayoutChips?: boolean;
};

/**
 * Pack OCR declaration — JSON only (`parsers/ocr.json`).
 * Flat fields = legacy / whole-pack. Prefer `default` + `byGroup` when roles differ.
 */
export type PackOcrConfig = PackOcrScopeConfig & {
  engine: string;
  /** Shared scope when group has no `byGroup` entry. */
  default?: PackOcrScopeConfig;
  /** Override by pack group id (`pflege`, `arzt`, …). */
  byGroup?: Record<string, PackOcrScopeConfig>;
};

export type PackGroup = {
  id: string;
  label: string;
  /** Concrete areas and/or `expand` series (expanded at load time). */
  areas: PackAreaEntry[];
};

/** Shape of pack `config.json` (id comes from folder name). */
export type PackConfigJson = {
  name: string;
  hint?: string;
  hintKey?: keyof Messages;
  groups: PackGroup[];
  preferredSourceId?: string;
  supportedSourceIds?: string[];
  /** Mark exactly one builtin pack as smoke / fixture default. */
  isSmokeDefault?: boolean;
  smokeWorkplace?: {
    groupId: string;
    areaId: string;
    preset: string;
  };
};

/** Runtime catalog entry — areas are always expanded. */
export type PackConfig = Omit<
  PackConfigJson,
  'isSmokeDefault' | 'smokeWorkplace' | 'groups'
> & {
  id: string;
  groups: Array<{ id: string; label: string; areas: PackArea[] }>;
  /** PDF engine + match params from pack `parsers/pdf.json` */
  pdf?: import('../convert/parsers/engines').PackPdfConfig;
  /** OCR engine + options from pack `parsers/ocr.json` */
  ocr?: PackOcrConfig;
};
