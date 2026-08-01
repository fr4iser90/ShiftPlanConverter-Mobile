import type { Messages } from '../i18n';
import type { PackArea, PackAreaEntry } from './expandAreas';

export type { PackArea, PackAreaEntry, PackAreaSeries } from './expandAreas';

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
