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
  name: string;
  hint: string;
  groups: PackGroup[];
};

export const BUILTIN_HOSPITAL_ID = 'st-elisabeth-leipzig';
export const BUILTIN_GROUP_ID = 'pflege';
export const BUILTIN_AREA_ID = 'op-bereich';
export const BUILTIN_PRESET = 'Anästhesie';

export function getBuiltinPackConfig(): PackConfig {
  return hospitalConfig as PackConfig;
}

export function getBuiltinMapping(): HospitalMapping {
  return opMapping as HospitalMapping;
}

export function listBuiltinPresets(): string[] {
  return Object.keys(getBuiltinMapping().presets || {});
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
