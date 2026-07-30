import type { PackMapping } from '../convert/types';
import type { Messages } from '../i18n';
import type { PackAreaPayroll, PayrollProfile } from '../payroll/types';
import { DEFAULT_PARSER_ID } from '../convert/parsers';
import type { PackPdfConfig } from '../convert/parsers/engines';
import { DEFAULT_OCR_ENGINE_ID } from '../convert/parsers/ocr';
import defaultGenericConfig from './builtin/default-generic/config.json';
import defaultGenericOcr from './builtin/default-generic/parsers/ocr.json';
import defaultGenericPdf from './builtin/default-generic/parsers/pdf.json';
import defaultGenericMapping from './builtin/default-generic/mappings/generic.json';
import stElisabethConfig from './builtin/st-elisabeth-leipzig/config.json';
import stElisabethOcr from './builtin/st-elisabeth-leipzig/parsers/ocr.json';
import stElisabethPdf from './builtin/st-elisabeth-leipzig/parsers/pdf.json';
import opMapping from './builtin/st-elisabeth-leipzig/mappings/pflege/op.json';
import stationEmptyMapping from './builtin/st-elisabeth-leipzig/mappings/pflege/station-empty.json';
import serviceAllgemeinMapping from './builtin/st-elisabeth-leipzig/mappings/service/allgemein.json';
import arztOpMapping from './builtin/st-elisabeth-leipzig/mappings/arzt/op.json';
import arztOpPayroll from './builtin/st-elisabeth-leipzig/mappings/arzt/op.payroll.json';
import pflegeOpPayroll from './builtin/st-elisabeth-leipzig/mappings/pflege/op.payroll.json';

export type PackArea = {
  id: string;
  label: string;
  mapping: string;
  supported: boolean;
  defaultPreset?: string;
  /** Optional Abrechnungsprüfer — omit or supported:false = feature off. */
  payroll?: PackAreaPayroll;
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
    ...(stElisabethConfig as Omit<PackConfig, 'id' | 'ocr' | 'pdf'>),
    ocr: stElisabethOcr as PackOcrConfig,
    pdf: stElisabethPdf as PackPdfConfig,
  },
];

function registerScopeMappings(
  out: Record<string, PackMapping>,
  packId: string,
  groupId: string,
  areaIds: string[],
  mapping: PackMapping
): void {
  for (const areaId of areaIds) {
    out[`${packId}/${groupId}/${areaId}`] = mapping;
  }
}

const ST_ELISABETH_STATION_AREA_IDS = Array.from({ length: 19 }, (_, i) => `station-${i + 1}`);

const MAPPINGS: Record<string, PackMapping> = {
  [`${DEFAULT_GENERIC_PACK_ID}/${DEFAULT_GENERIC_GROUP_ID}/${DEFAULT_GENERIC_AREA_ID}`]:
    defaultGenericMapping as PackMapping,
  'st-elisabeth-leipzig/pflege/op-bereich': opMapping as PackMapping,
};

registerScopeMappings(
  MAPPINGS,
  'st-elisabeth-leipzig',
  'pflege',
  ST_ELISABETH_STATION_AREA_IDS,
  stationEmptyMapping as PackMapping
);
registerScopeMappings(
  MAPPINGS,
  'st-elisabeth-leipzig',
  'service',
  ['allgemein'],
  serviceAllgemeinMapping as PackMapping
);
registerScopeMappings(
  MAPPINGS,
  'st-elisabeth-leipzig',
  'arzt',
  ['op'],
  arztOpMapping as PackMapping
);

const PAYROLL_PROFILES: Record<string, PayrollProfile> = {
  'st-elisabeth-leipzig/pflege/op-bereich': pflegeOpPayroll as PayrollProfile,
  'st-elisabeth-leipzig/arzt/op': arztOpPayroll as PayrollProfile,
};

/** Validated St. Elisabeth · Pflege · OP scope (default smoke / fixture pack). */
export const BUILTIN_PACK_ID = 'st-elisabeth-leipzig';
export const BUILTIN_GROUP_ID = 'pflege';
export const BUILTIN_AREA_ID = 'op-bereich';
export const BUILTIN_PRESET = 'Anästhesie';

export function listBuiltinPacks(): PackConfig[] {
  return BUILTIN_PACKS;
}

export function getPackById(packId: string): PackConfig | null {
  return BUILTIN_PACKS.find((p) => p.id === packId) || null;
}

export function getBuiltinPackConfig(): PackConfig {
  return getPackById(BUILTIN_PACK_ID) || BUILTIN_PACKS[0];
}

export function getDefaultGenericPack(): PackConfig {
  return getPackById(DEFAULT_GENERIC_PACK_ID) || BUILTIN_PACKS[0];
}

export function getParserIdForPack(pack: PackConfig | null | undefined): string {
  return pack?.pdf?.engine?.trim() || DEFAULT_PARSER_ID;
}

export function getPdfConfigForPack(pack: PackConfig | null | undefined): PackPdfConfig {
  if (pack?.pdf) return pack.pdf;
  return defaultGenericPdf as PackPdfConfig;
}

export function getOcrEngineIdForPack(pack: PackConfig | null | undefined): string {
  return pack?.ocr?.engine?.trim() || DEFAULT_OCR_ENGINE_ID;
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
 * Missing/empty list → local import (file + photo) only.
 * Packs may still list `camera-ocr`; UI collapses it with `local-files`.
 */
export function getSupportedSourceIds(pack: PackConfig | null | undefined): string[] {
  const raw = pack?.supportedSourceIds
    ?.map((s) => String(s || '').trim())
    .filter(Boolean);
  if (raw?.length) return raw;
  return ['local-files'];
}

export function isSourceSupportedByPack(
  pack: PackConfig | null | undefined,
  sourceId: string | null | undefined
): boolean {
  if (!sourceId) return false;
  const supported = getSupportedSourceIds(pack);
  if (supported.includes(sourceId)) return true;
  // Merged local import: either id counts if the other is listed.
  if (sourceId === 'local-files' || sourceId === 'camera-ocr') {
    return supported.includes('local-files') || supported.includes('camera-ocr');
  }
  return false;
}

export function getPreferredSourceId(pack: PackConfig | null | undefined): string {
  const supported = getSupportedSourceIds(pack);
  const preferred = pack?.preferredSourceId?.trim();
  if (preferred && supported.includes(preferred)) return preferred;
  return supported[0] || FALLBACK_SOURCE_ID;
}

export function getMappingForScope(
  packId: string,
  groupId: string,
  areaId: string
): PackMapping | null {
  return MAPPINGS[`${packId}/${groupId}/${areaId}`] || null;
}

export function getPackArea(
  packId: string,
  groupId: string,
  areaId: string
): PackArea | null {
  const pack = getPackById(packId);
  const group = pack?.groups.find((g) => g.id === groupId);
  return group?.areas.find((a) => a.id === areaId) || null;
}

/** True when active scope ships a supported payroll profile. */
export function isPayrollSupportedForScope(
  packId: string,
  groupId: string,
  areaId: string
): boolean {
  const area = getPackArea(packId, groupId, areaId);
  if (!area?.payroll?.supported) return false;
  return !!getPayrollProfileForScope(packId, groupId, areaId);
}

export function getPayrollProfileForScope(
  packId: string,
  groupId: string,
  areaId: string
): PayrollProfile | null {
  const area = getPackArea(packId, groupId, areaId);
  if (!area?.payroll?.supported) return null;
  return PAYROLL_PROFILES[`${packId}/${groupId}/${areaId}`] || null;
}

export function getBuiltinMapping(): PackMapping {
  return (
    getMappingForScope(BUILTIN_PACK_ID, BUILTIN_GROUP_ID, BUILTIN_AREA_ID) ||
    (opMapping as PackMapping)
  );
}

export function getDefaultGenericMapping(): PackMapping {
  return (
    getMappingForScope(
      DEFAULT_GENERIC_PACK_ID,
      DEFAULT_GENERIC_GROUP_ID,
      DEFAULT_GENERIC_AREA_ID
    ) || (defaultGenericMapping as PackMapping)
  );
}

export function listPresetsForScope(
  packId: string,
  groupId: string,
  areaId: string
): string[] {
  const mapping = getMappingForScope(packId, groupId, areaId);
  return Object.keys(mapping?.presets || {});
}

/**
 * Preset usable for setup / import.
 * Employer packs: needs ≥1 time→code row (empty = placeholder / bald).
 * default-generic: empty Standard is valid (no employer codes).
 */
export function isPresetReady(
  packId: string,
  groupId: string,
  areaId: string,
  preset: string
): boolean {
  const mapping = getMappingForScope(packId, groupId, areaId);
  const table = mapping?.presets?.[preset];
  if (!table) return false;
  if (Object.keys(table).length > 0) return true;
  const pack = getPackById(packId);
  const area = pack?.groups
    .find((g) => g.id === groupId)
    ?.areas.find((a) => a.id === areaId);
  return packId === DEFAULT_GENERIC_PACK_ID && !!area?.supported;
}

/** First supported area + ready preset across builtin packs (files-only default). */
export function firstReadyWorkplaceScope(): {
  packId: string;
  groupId: string;
  areaId: string;
  preset: string;
} | null {
  for (const p of listBuiltinPacks()) {
    for (const g of p.groups) {
      for (const a of g.areas) {
        if (!a.supported) continue;
        const presets = listPresetsForScope(p.id, g.id, a.id);
        const ready =
          (a.defaultPreset && isPresetReady(p.id, g.id, a.id, a.defaultPreset)
            ? a.defaultPreset
            : null) ||
          presets.find((pr) => isPresetReady(p.id, g.id, a.id, pr));
        if (ready) {
          return { packId: p.id, groupId: g.id, areaId: a.id, preset: ready };
        }
      }
    }
  }
  return null;
}

export function listBuiltinPresets(): string[] {
  return listPresetsForScope(BUILTIN_PACK_ID, BUILTIN_GROUP_ID, BUILTIN_AREA_ID);
}

export function isBuiltinValidatedScope(
  packId: string,
  groupId: string,
  areaId: string,
  preset: string
): boolean {
  return (
    packId === BUILTIN_PACK_ID &&
    groupId === BUILTIN_GROUP_ID &&
    areaId === BUILTIN_AREA_ID &&
    preset === BUILTIN_PRESET
  );
}
