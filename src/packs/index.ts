import type { HospitalMapping } from '../convert/types';
import type { Messages } from '../i18n';
import { DEFAULT_PARSER_ID } from '../convert/parsers';
import type { PackPdfConfig } from '../convert/parsers/engines';
import { DEFAULT_OCR_ENGINE_ID } from '../convert/parsers/ocr';
import defaultGenericConfig from './builtin/default-generic/config.json';
import defaultGenericOcr from './builtin/default-generic/parsers/ocr.json';
import defaultGenericPdf from './builtin/default-generic/parsers/pdf.json';
import defaultGenericMapping from './builtin/default-generic/mappings/generic.json';
import hospitalConfig from './builtin/st-elisabeth-leipzig/config.json';
import hospitalOcr from './builtin/st-elisabeth-leipzig/parsers/ocr.json';
import hospitalPdf from './builtin/st-elisabeth-leipzig/parsers/pdf.json';
import opMapping from './builtin/st-elisabeth-leipzig/mappings/pflege/op.json';

export type PackArea = {
  id: string;
  label: string;
  mapping: string;
  supported: boolean;
  defaultPreset?: string;
};

export type PackGroup = {
  id: string;
  label: string;
  areas: PackArea[];
};

/** Pack OCR declaration — JSON only (`parsers/ocr.json`). Engine code lives in convert/. */
export type PackOcrConfig = {
  engine: string;
  preferredLayout?: string;
  layouts?: string[];
  usePackMapping?: boolean;
};

export type { PackPdfConfig };

export type PackConfig = {
  id: string;
  name: string;
  hint?: string;
  hintKey?: keyof Messages;
  groups: PackGroup[];
  /** @deprecated use `pdf.engine` from parsers/pdf.json */
  parserId?: string;
  /** PDF engine + match params from pack `parsers/pdf.json` */
  pdf?: PackPdfConfig;
  /** OCR engine + options from pack `parsers/ocr.json` */
  ocr?: PackOcrConfig;
  /** Default Fetch source */
  preferredSourceId?: string;
  supportedSourceIds?: string[];
};

export const DEFAULT_GENERIC_PACK_ID = 'default-generic';
export const DEFAULT_GENERIC_GROUP_ID = 'generic';
export const DEFAULT_GENERIC_AREA_ID = 'import';
export const DEFAULT_GENERIC_PRESET = 'Standard';

/** Catalog of employer packs shipped in the app (more will be added). */
const BUILTIN_PACKS: PackConfig[] = [
  {
    id: DEFAULT_GENERIC_PACK_ID,
    ...(defaultGenericConfig as Omit<PackConfig, 'id' | 'ocr' | 'pdf'>),
    ocr: defaultGenericOcr as PackOcrConfig,
    pdf: defaultGenericPdf as PackPdfConfig,
  },
  {
    id: 'st-elisabeth-leipzig',
    ...(hospitalConfig as Omit<PackConfig, 'id' | 'ocr' | 'pdf'>),
    ocr: hospitalOcr as PackOcrConfig,
    pdf: hospitalPdf as PackPdfConfig,
  },
];

const MAPPINGS: Record<string, HospitalMapping> = {
  [`${DEFAULT_GENERIC_PACK_ID}/${DEFAULT_GENERIC_GROUP_ID}/${DEFAULT_GENERIC_AREA_ID}`]:
    defaultGenericMapping as HospitalMapping,
  'st-elisabeth-leipzig/pflege/op-bereich': opMapping as HospitalMapping,
};

/** @deprecated use listBuiltinPacks — kept for older call sites / smoke seed */
export const BUILTIN_HOSPITAL_ID = 'st-elisabeth-leipzig';
export const BUILTIN_GROUP_ID = 'pflege';
export const BUILTIN_AREA_ID = 'op-bereich';
export const BUILTIN_PRESET = 'Anästhesie';

export function listBuiltinPacks(): PackConfig[] {
  return BUILTIN_PACKS;
}

export function getPackById(hospitalId: string): PackConfig | null {
  return BUILTIN_PACKS.find((p) => p.id === hospitalId) || null;
}

export function getBuiltinPackConfig(): PackConfig {
  return getPackById(BUILTIN_HOSPITAL_ID) || BUILTIN_PACKS[0];
}

export function getDefaultGenericPack(): PackConfig {
  return getPackById(DEFAULT_GENERIC_PACK_ID) || BUILTIN_PACKS[0];
}

export function getParserIdForPack(pack: PackConfig | null | undefined): string {
  return pack?.pdf?.engine?.trim() || pack?.parserId?.trim() || DEFAULT_PARSER_ID;
}

export function getPdfConfigForPack(pack: PackConfig | null | undefined): PackPdfConfig {
  if (pack?.pdf) return pack.pdf;
  return defaultGenericPdf as PackPdfConfig;
}

export function getOcrEngineIdForPack(pack: PackConfig | null | undefined): string {
  return pack?.ocr?.engine?.trim() || DEFAULT_OCR_ENGINE_ID;
}

/** @deprecated use getOcrEngineIdForPack */
export function getOcrParserIdForPack(pack: PackConfig | null | undefined): string {
  return getOcrEngineIdForPack(pack);
}

export function getOcrConfigForPack(pack: PackConfig | null | undefined): PackOcrConfig {
  return (
    pack?.ocr || {
      engine: DEFAULT_OCR_ENGINE_ID,
      preferredLayout: 'auto',
      usePackMapping: true,
    }
  );
}

/** Product-safe default when no pack / empty preferred. */
const FALLBACK_SOURCE_ID = 'local-files';

/**
 * Sources offered on Fetch for this pack.
 * Missing/empty list → file + OCR (no LOGA3 unless pack declares it).
 */
export function getSupportedSourceIds(pack: PackConfig | null | undefined): string[] {
  const raw = pack?.supportedSourceIds
    ?.map((s) => String(s || '').trim())
    .filter(Boolean);
  if (raw?.length) return raw;
  return ['local-files', 'camera-ocr'];
}

export function isSourceSupportedByPack(
  pack: PackConfig | null | undefined,
  sourceId: string | null | undefined
): boolean {
  if (!sourceId) return false;
  return getSupportedSourceIds(pack).includes(sourceId);
}

export function getPreferredSourceId(pack: PackConfig | null | undefined): string {
  const supported = getSupportedSourceIds(pack);
  const preferred = pack?.preferredSourceId?.trim();
  if (preferred && supported.includes(preferred)) return preferred;
  return supported[0] || FALLBACK_SOURCE_ID;
}

export function getMappingForScope(
  hospitalId: string,
  groupId: string,
  areaId: string
): HospitalMapping | null {
  return MAPPINGS[`${hospitalId}/${groupId}/${areaId}`] || null;
}

export function getBuiltinMapping(): HospitalMapping {
  return (
    getMappingForScope(BUILTIN_HOSPITAL_ID, BUILTIN_GROUP_ID, BUILTIN_AREA_ID) ||
    (opMapping as HospitalMapping)
  );
}

export function getDefaultGenericMapping(): HospitalMapping {
  return (
    getMappingForScope(
      DEFAULT_GENERIC_PACK_ID,
      DEFAULT_GENERIC_GROUP_ID,
      DEFAULT_GENERIC_AREA_ID
    ) || (defaultGenericMapping as HospitalMapping)
  );
}

export function listPresetsForScope(
  hospitalId: string,
  groupId: string,
  areaId: string
): string[] {
  const mapping = getMappingForScope(hospitalId, groupId, areaId);
  return Object.keys(mapping?.presets || {});
}

export function listBuiltinPresets(): string[] {
  return listPresetsForScope(BUILTIN_HOSPITAL_ID, BUILTIN_GROUP_ID, BUILTIN_AREA_ID);
}

export function isBuiltinValidatedScope(
  hospitalId: string,
  groupId: string,
  areaId: string,
  preset: string
): boolean {
  return (
    hospitalId === BUILTIN_HOSPITAL_ID &&
    groupId === BUILTIN_GROUP_ID &&
    areaId === BUILTIN_AREA_ID &&
    preset === BUILTIN_PRESET
  );
}
