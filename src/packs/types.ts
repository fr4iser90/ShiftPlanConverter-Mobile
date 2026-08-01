import type { Messages } from '../i18n';
import type { PackArea, PackAreaEntry } from './expandAreas';

export type { PackArea, PackAreaEntry, PackAreaSeries } from './expandAreas';

/** Pack OCR declaration — JSON only (`parsers/ocr.json`). Engine code lives in convert/. */
export type PackOcrConfig = {
  engine: string;
  preferredLayout?: string;
  layouts?: string[];
  usePackMapping?: boolean;
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
