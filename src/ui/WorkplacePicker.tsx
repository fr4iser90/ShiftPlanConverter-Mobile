/**
 * Shared workplace / employer pack picker.
 * Profiles = employers on this device; pack/group/area/preset edit the active one.
 * Preview merges all profiles; Import/Fetch use the active profile.
 */
import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { t } from '@/src/i18n';
import {
  DEFAULT_GENERIC_PACK_ID,
  getPackById,
  isPresetReady,
  listBuiltinPacks,
  listPresetsForScope,
  type PackArea,
  type PackConfig,
} from '@/src/packs';
import {
  addWorkplace,
  getSnapshot,
  removeWorkplace,
  setActiveWorkplaceId,
  setWorkplace,
} from '@/src/state/store';
import { packDisplayName } from '@/src/state/workplaces';
import { AppButton } from '@/src/ui/AppButton';
import { useTheme } from '@/src/ui/useTheme';
import type { AppTheme } from '@/src/ui/theme';

/** Above this, profiles use a switcher sheet instead of pill spam. */
const PROFILE_INLINE_MAX = 4;

function groupHasReadyArea(g: { areas: PackArea[] }): boolean {
  return g.areas.some((a) => a.supported);
}

function departmentKey(a: PackArea): string {
  return String(a.department || a.label || '').trim();
}

function makePickerStyles(theme: AppTheme) {
  return StyleSheet.create({
    wrap: { gap: 6 },
    label: { fontWeight: '600', marginTop: 8, color: theme.color.ink, fontSize: 13 },
    rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 4 },
    meta: { fontSize: 12, color: theme.color.inkMuted, marginTop: 4 },
  });
}

export function WorkplacePicker() {
  const theme = useTheme();
  const styles = useMemo(() => makePickerStyles(theme), [theme]);
  const snap = getSnapshot();
  const packs = listBuiltinPacks();
  const pack: PackConfig | null = snap.packId ? getPackById(snap.packId) : null;
  const group = pack?.groups.find((g) => g.id === snap.groupId);
  const area = group?.areas.find((a) => a.id === snap.areaId);
  const presets =
    snap.packId && snap.groupId && snap.areaId
      ? listPresetsForScope(snap.packId, snap.groupId, snap.areaId)
      : [];

  const isGeneric = pack?.id === DEFAULT_GENERIC_PACK_ID;
  const allAreas = group?.areas || [];
  const readyAreas = allAreas.filter((a) => a.supported);
  const soonAreaCount = allAreas.length - readyAreas.length;
  // Generic pack: hide fake department/role chips (Import / Standard).
  const showGroups = !isGeneric && (pack?.groups.length || 0) > 1;
  const splitDepartmentRole = allAreas.some((a) => !!(a.department || a.role));
  const showAreas = !isGeneric && allAreas.length > 0 && !!snap.groupId;
  const showPresets =
    !isGeneric &&
    presets.length > 0 &&
    !!snap.areaId &&
    !(presets.length === 1 && presets[0] === 'default');
  const showProfiles = snap.workplaces.length > 0;
  const inlineProfiles = snap.workplaces.length <= PROFILE_INLINE_MAX;
  const activeProfile =
    snap.workplaces.find((w) => w.id === snap.activeWorkplaceId) || snap.workplaces[0];

  /** Remember department when multiple roles exist and area is not chosen yet. */
  const [pickedDepartment, setPickedDepartment] = useState('');
  const selectedDepartment =
    (area ? departmentKey(area) : '') ||
    (pickedDepartment && allAreas.some((a) => departmentKey(a) === pickedDepartment)
      ? pickedDepartment
      : '');

  const departmentOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const a of readyAreas) {
      const key = departmentKey(a);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(key);
    }
    return out;
  }, [readyAreas]);

  const roleAreas = allAreas.filter(
    (a) => selectedDepartment && departmentKey(a) === selectedDepartment && a.role
  );
  const showRoles = splitDepartmentRole && roleAreas.length > 0;

  const pickPack = async (p: PackConfig) => {
    const readyGroups = p.groups.filter(groupHasReadyArea);
    const soleGroup = readyGroups.length === 1 ? readyGroups[0] : null;
    const readyAreasSole = soleGroup?.areas.filter((a) => a.supported) || [];
    const soleArea = readyAreasSole.length === 1 ? readyAreasSole[0] : null;

    // Only auto-fill when there is exactly one ready path (e.g. Ohne Arbeitgeber).
    // Multi-group packs (St. Elisabeth: Pflege / Ärzte / …) stay on employer until the user picks.
    if (!soleGroup || !soleArea) {
      await setWorkplace({
        packId: p.id,
        groupId: '',
        areaId: '',
        preset: '',
      });
      return;
    }

    const g = soleGroup;
    const a = soleArea;
    const readyPreset =
      a.defaultDutyTable && isPresetReady(p.id, g.id, a.id, a.defaultDutyTable)
        ? a.defaultDutyTable
        : listPresetsForScope(p.id, g.id, a.id).find((pr) =>
            isPresetReady(p.id, g.id, a.id, pr)
          ) ||
          a.defaultDutyTable ||
          '';
    await setWorkplace({
      packId: p.id,
      groupId: g.id,
      areaId: a.id,
      preset: readyPreset,
    });
  };

  const pickGroup = async (groupId: string) => {
    if (!pack) return;
    const g = pack.groups.find((x) => x.id === groupId);
    if (!g || !groupHasReadyArea(g)) return;
    setPickedDepartment('');
    const ready = g.areas.filter((x) => x.supported);
    // Multiple areas → group only; user picks department next.
    if (ready.length !== 1) {
      await setWorkplace({
        packId: pack.id,
        groupId,
        areaId: '',
        preset: '',
      });
      return;
    }
    const a = ready[0];
    await setWorkplace({
      packId: pack.id,
      groupId,
      areaId: a.id,
      preset: a.defaultDutyTable || '',
    });
  };

  const pickDepartment = async (b: string) => {
    if (!pack || !group) return;
    const inB = group.areas.filter((a) => departmentKey(a) === b);
    const ready = inB.filter((a) => a.supported);
    setPickedDepartment(b);
    if (ready.length === 1) {
      await pickArea(ready[0].id);
      return;
    }
    if (ready.length === 0) return;
    await setWorkplace({
      packId: pack.id,
      groupId: group.id,
      areaId: '',
      preset: '',
    });
  };

  const pickArea = async (areaId: string) => {
    if (!pack || !group) return;
    const a = group.areas.find((x) => x.id === areaId);
    if (!a?.supported) return;
    setPickedDepartment(departmentKey(a));
    const readyPreset =
      a.defaultDutyTable &&
      isPresetReady(pack.id, group.id, a.id, a.defaultDutyTable)
        ? a.defaultDutyTable
        : listPresetsForScope(pack.id, group.id, a.id).find((p) =>
            isPresetReady(pack.id, group.id, a.id, p)
          ) ||
          a.defaultDutyTable ||
          '';
    await setWorkplace({
      packId: pack.id,
      groupId: group.id,
      areaId,
      preset: readyPreset,
    });
  };

  const pickPreset = async (preset: string) => {
    if (!isPresetReady(snap.packId, snap.groupId, snap.areaId, preset)) return;
    await setWorkplace({
      packId: snap.packId,
      groupId: snap.groupId,
      areaId: snap.areaId,
      preset,
    });
  };

  const openProfileSwitcher = () => {
    Alert.alert(
      t('workplaceProfiles'),
      undefined,
      [
        ...snap.workplaces.map((w) => ({
          text: `${snap.activeWorkplaceId === w.id ? '✓ ' : ''}${w.label}`,
          onPress: () => void setActiveWorkplaceId(w.id),
        })),
        { text: t('cancel'), style: 'cancel' as const },
      ]
    );
  };

  return (
    <View style={styles.wrap}>
      {showProfiles ? (
        <>
          <Text style={styles.label}>{t('workplaceProfiles')}</Text>
          {inlineProfiles ? (
            <View style={styles.rowWrap}>
              {snap.workplaces.map((w) => (
                <AppButton
                  key={w.id}
                  compact
                  title={w.label}
                  variant={snap.activeWorkplaceId === w.id ? 'soft' : 'secondary'}
                  onPress={() => void setActiveWorkplaceId(w.id)}
                />
              ))}
              <AppButton
                compact
                title={t('workplaceAdd')}
                variant="ghost"
                onPress={() => void addWorkplace()}
              />
            </View>
          ) : (
            <View style={styles.rowWrap}>
              <AppButton
                compact
                title={activeProfile?.label || t('employer')}
                variant="soft"
                onPress={openProfileSwitcher}
              />
              <AppButton
                compact
                title={t('workplaceSwitch')}
                variant="secondary"
                onPress={openProfileSwitcher}
              />
              <AppButton
                compact
                title={t('workplaceAdd')}
                variant="ghost"
                onPress={() => void addWorkplace()}
              />
            </View>
          )}
          {snap.workplaces.length > 1 ? (
            <AppButton
              compact
              title={t('workplaceRemoveActive')}
              variant="ghost"
              onPress={() =>
                snap.activeWorkplaceId
                  ? void removeWorkplace(snap.activeWorkplaceId)
                  : undefined
              }
            />
          ) : null}
        </>
      ) : null}

      <Text style={styles.label}>{t('employer')}</Text>
      <View style={styles.rowWrap}>
        {packs.map((p) => (
          <AppButton
            key={p.id}
            compact
            title={packDisplayName(p.id, p.name)}
            variant={snap.packId === p.id ? 'soft' : 'secondary'}
            onPress={() => void pickPack(p)}
          />
        ))}
      </View>
      {!packs.length && <Text style={styles.meta}>{t('noPacksYet')}</Text>}
      {!showProfiles ? (
        <AppButton
          compact
          title={t('workplaceAdd')}
          variant="ghost"
          onPress={() => void addWorkplace()}
        />
      ) : null}

      {pack && showGroups ? (
        <>
          <Text style={styles.label}>{t('group')}</Text>
          <View style={styles.rowWrap}>
            {pack.groups.map((g) => {
              const ready = groupHasReadyArea(g);
              return (
                <AppButton
                  key={g.id}
                  compact
                  title={ready ? g.label : `${g.label} (${t('soon')})`}
                  disabled={!ready}
                  variant={snap.groupId === g.id ? 'soft' : 'secondary'}
                  onPress={() => void pickGroup(g.id)}
                />
              );
            })}
          </View>
        </>
      ) : null}

      {group && showAreas ? (
        <>
          <Text style={styles.label}>{t('area')}</Text>
          <View style={styles.rowWrap}>
            {splitDepartmentRole
              ? departmentOptions.map((b) => (
                  <AppButton
                    key={b}
                    compact
                    title={b}
                    variant={selectedDepartment === b ? 'soft' : 'secondary'}
                    onPress={() => void pickDepartment(b)}
                  />
                ))
              : readyAreas.map((a) => (
                  <AppButton
                    key={a.id}
                    compact
                    title={a.label}
                    variant={snap.areaId === a.id ? 'soft' : 'secondary'}
                    onPress={() => void pickArea(a.id)}
                  />
                ))}
          </View>
          {showRoles ? (
            <>
              <Text style={styles.label}>{t('role')}</Text>
              <View style={styles.rowWrap}>
                {roleAreas.map((a) => (
                  <AppButton
                    key={a.id}
                    compact
                    title={a.supported ? a.role! : `${a.role} (${t('soon')})`}
                    disabled={!a.supported}
                    variant={snap.areaId === a.id ? 'soft' : 'secondary'}
                    onPress={() => void pickArea(a.id)}
                  />
                ))}
              </View>
            </>
          ) : null}
          {soonAreaCount > 0 ? (
            <Text style={styles.meta}>
              {t('workplaceAreasSoon', { count: String(soonAreaCount) })}
            </Text>
          ) : null}
        </>
      ) : null}

      {area && showPresets ? (
        <>
          <Text style={styles.label}>{t('preset')}</Text>
          <View style={styles.rowWrap}>
            {presets.map((p) => {
              const ready = isPresetReady(snap.packId, snap.groupId, snap.areaId, p);
              return (
                <AppButton
                  key={p}
                  compact
                  title={ready ? p : `${p} (${t('soon')})`}
                  disabled={!ready}
                  variant={snap.preset === p ? 'soft' : 'secondary'}
                  onPress={() => void pickPreset(p)}
                />
              );
            })}
          </View>
        </>
      ) : null}

      {pack?.hintKey ? <Text style={styles.meta}>{t(pack.hintKey)}</Text> : null}
    </View>
  );
}
