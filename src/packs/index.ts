import type { PackMapping } from '../convert/types';
import { DEFAULT_PDF_ENGINE_ID } from '../convert/parsers/engines';
import type { PackPdfConfig } from '../convert/parsers/engines';
import { DEFAULT_OCR_ENGINE_ID } from '../convert/parsers/ocr';
import type { PayrollProfile } from '../payroll/types';
import {
  PACK_REGISTRY,
  SMOKE_DEFAULT_PACK_ID,
  type PackRegistryEntry,
} from './registry.generated';
import type { PackArea, PackConfig, PackOcrConfig } from './types';
import { expandPackAreas } from './expandAreas';

export type {
  PackArea,
  PackConfig,
  PackConfigJson,
  PackGroup,
  PackOcrConfig,
} from './types';
export type { PackAreaEntry, PackAreaSeries } from './expandAreas';
export type { PackPdfConfig };

export const DEFAULT_GENERIC_PACK_ID = 'default-generic';
export const DEFAULT_GENERIC_GROUP_ID = 'generic';
export const DEFAULT_GENERIC_AREA_ID = 'import';
export const DEFAULT_GENERIC_PRESET = 'Standard';

function entryById(packId: string): PackRegistryEntry | undefined {
  return PACK_REGISTRY.find((p) => p.id === packId);
}

function buildPackConfig(entry: PackRegistryEntry): PackConfig {
  const { isSmokeDefault: _s, smokeWorkplace: _w, groups, ...rest } = entry.config;
  return {
    id: entry.id,
    ...rest,
    groups: groups.map((g) => ({
      id: g.id,
      label: g.label,
      areas: expandPackAreas(g.areas),
    })),
    ocr: entry.ocr,
    pdf: entry.pdf,
  };
}

/** Catalog of employer packs shipped in the app (from builtin pack config.json files). */
const BUILTIN_PACKS: PackConfig[] = PACK_REGISTRY.map(buildPackConfig);

const MAPPINGS: Record<string, PackMapping> = {};
const PAYROLL_PROFILES: Record<string, PayrollProfile> = {};

for (const pack of BUILTIN_PACKS) {
  const entry = entryById(pack.id);
  if (!entry) continue;
  for (const group of pack.groups) {
    for (const area of group.areas) {
      const scope = `${pack.id}/${group.id}/${area.id}`;
      const mapping = entry.mappingsByPath[area.mapping];
      if (mapping) MAPPINGS[scope] = mapping;
      if (area.payroll?.supported && area.payroll.profile) {
        const profile = entry.payrollByPath[area.payroll.profile];
        if (profile) PAYROLL_PROFILES[scope] = profile;
      }
    }
  }
}

function resolveSmokeWorkplace(): {
  packId: string;
  groupId: string;
  areaId: string;
  preset: string;
} {
  const smokeEntry =
    (SMOKE_DEFAULT_PACK_ID && entryById(SMOKE_DEFAULT_PACK_ID)) || PACK_REGISTRY[0];
  const sw = smokeEntry?.config.smokeWorkplace;
  if (smokeEntry && sw?.groupId && sw?.areaId && sw?.preset) {
    return {
      packId: smokeEntry.id,
      groupId: sw.groupId,
      areaId: sw.areaId,
      preset: sw.preset,
    };
  }
  const pack = BUILTIN_PACKS[0];
  const group = pack?.groups[0];
  const area = group?.areas[0];
  return {
    packId: pack?.id || DEFAULT_GENERIC_PACK_ID,
    groupId: group?.id || DEFAULT_GENERIC_GROUP_ID,
    areaId: area?.id || DEFAULT_GENERIC_AREA_ID,
    preset: area?.defaultPreset || DEFAULT_GENERIC_PRESET,
  };
}

const smoke = resolveSmokeWorkplace();

/** Validated smoke / fixture pack scope (from pack config isSmokeDefault). */
export const BUILTIN_PACK_ID = smoke.packId;
export const BUILTIN_GROUP_ID = smoke.groupId;
export const BUILTIN_AREA_ID = smoke.areaId;
export const BUILTIN_PRESET = smoke.preset;

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
  return pack?.pdf?.engine?.trim() || DEFAULT_PDF_ENGINE_ID;
}

export function getPdfConfigForPack(pack: PackConfig | null | undefined): PackPdfConfig {
  if (pack?.pdf) return pack.pdf;
  return (
    entryById(DEFAULT_GENERIC_PACK_ID)?.pdf ||
    (PACK_REGISTRY[0]?.pdf as PackPdfConfig)
  );
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
    getMappingForScope(BUILTIN_PACK_ID, BUILTIN_GROUP_ID, BUILTIN_AREA_ID) || {
      presets: {},
    }
  );
}

export function getDefaultGenericMapping(): PackMapping {
  return (
    getMappingForScope(
      DEFAULT_GENERIC_PACK_ID,
      DEFAULT_GENERIC_GROUP_ID,
      DEFAULT_GENERIC_AREA_ID
    ) || { presets: {} }
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
