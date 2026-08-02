/**
 * Multi-employer workplace profiles.
 * Active profile drives Import/Fetch/Setup; Preview/Widgets merge all entries.
 *
 * Note: do not import `@/src/i18n` here — i18n reads the store, and the store
 * imports this module (cycle). Locale strings are resolved lazily.
 */
import {
  DEFAULT_GENERIC_PACK_ID,
  getPackById,
  isPresetReady,
} from '@/src/packs';

export type WorkplaceProfile = {
  id: string;
  /** Short label shown in UI (defaults to pack name). */
  label: string;
  packId: string;
  groupId: string;
  areaId: string;
  preset: string;
};

export function newWorkplaceId(): string {
  return `wp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function profileConfigured(p: WorkplaceProfile | null | undefined): boolean {
  if (!(p?.packId && p?.groupId && p?.areaId && p?.preset)) return false;
  return isPresetReady(p.packId, p.groupId, p.areaId, p.preset);
}

function noEmployerLabel(): string {
  let en = false;
  try {
    // Lazy: avoid i18n↔store cycle at module load.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const store = require('./store') as typeof import('./store');
    en = store.getSnapshot().locale === 'en';
  } catch {
    // hydrate / tests
  }
  return en ? 'No employer' : 'Ohne Arbeitgeber';
}

function employerFallbackLabel(): string {
  let en = false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const store = require('./store') as typeof import('./store');
    en = store.getSnapshot().locale === 'en';
  } catch {
    // ignore
  }
  return en ? 'Employer' : 'Arbeitgeber';
}

/** User-facing pack title (generic → “Ohne Arbeitgeber”, not “Standard”). */
export function packDisplayName(packId: string, packName?: string): string {
  if (!packId || packId === DEFAULT_GENERIC_PACK_ID) return noEmployerLabel();
  return String(packName || getPackById(packId)?.name || '').trim() || employerFallbackLabel();
}

export function defaultLabelForPack(
  packId: string,
  packName?: string,
  areaLabel?: string,
  preset?: string,
  groupLabel?: string,
  department?: string,
  role?: string
): string {
  if (!packId || packId === DEFAULT_GENERIC_PACK_ID) {
    return noEmployerLabel();
  }
  const name = packDisplayName(packId, packName);
  const group = String(groupLabel || '').trim();
  const b = String(department || '').trim();
  const r = String(role || '').trim();
  const area =
    b || r ? [b, r].filter(Boolean).join(' · ') : String(areaLabel || '').trim();
  const fach = String(preset || '').trim();
  const parts = [name];
  if (group) parts.push(group);
  if (area) parts.push(area);
  // Flat role files store preset as `default` — never show in the chip.
  if (!fach || fach === 'default') {
    return parts.join(' · ');
  }
  const areaNorm = area.toLowerCase();
  const fachNorm = fach.toLowerCase();
  const roleNorm = r.toLowerCase();
  const fachStem = fachNorm.slice(0, Math.min(8, fachNorm.length));
  const fachAlreadyShown =
    areaNorm === fachNorm ||
    roleNorm === fachNorm ||
    areaNorm.endsWith(` · ${fachNorm}`) ||
    areaNorm.endsWith(` ${fachNorm}`) ||
    (!!fachStem && fachStem.length >= 5 && roleNorm.includes(fachStem));
  if (!fachAlreadyShown) parts.push(fach);
  return parts.join(' · ');
}

/** Recompute profile chip labels from current pack metadata / locale. */
export function relabelWorkplace(p: WorkplaceProfile): WorkplaceProfile {
  const pack = p.packId ? getPackById(p.packId) : null;
  const group = pack?.groups.find((g) => g.id === p.groupId);
  const area = group?.areas.find((a) => a.id === p.areaId);
  return {
    ...p,
    label: defaultLabelForPack(
      p.packId,
      pack?.name,
      area?.label,
      p.preset,
      group?.label,
      area?.department,
      area?.role
    ),
  };
}

export function parseWorkplacesJson(raw: string | null): WorkplaceProfile[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => {
        if (!row || typeof row !== 'object') return null;
        const o = row as Record<string, unknown>;
        const id = String(o.id || '').trim();
        if (!id) return null;
        return {
          id,
          label: String(o.label || '').trim() || id,
          packId: String(o.packId || '').trim(),
          groupId: String(o.groupId || '').trim(),
          areaId: String(o.areaId || '').trim(),
          preset: String(o.preset || '').trim(),
        } satisfies WorkplaceProfile;
      })
      .filter((w): w is WorkplaceProfile => !!w);
  } catch {
    return [];
  }
}
