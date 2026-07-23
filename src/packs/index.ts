import type { HospitalMapping } from '../convert/types';
import hospitalConfig from './builtin/st-elisabeth-leipzig/config.json';
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

export type PackConfig = {
  id: string;
  name: string;
  hint: string;
  groups: PackGroup[];
};

/** Catalog of employer packs shipped in the app (more will be added). */
const BUILTIN_PACKS: PackConfig[] = [
  {
    id: 'st-elisabeth-leipzig',
    ...(hospitalConfig as Omit<PackConfig, 'id'>),
  },
];

const MAPPINGS: Record<string, HospitalMapping> = {
  'st-elisabeth-leipzig/pflege/op-bereich': opMapping as HospitalMapping,
};

/** @deprecated use listBuiltinPacks — kept for older call sites */
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
  return BUILTIN_PACKS[0];
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
