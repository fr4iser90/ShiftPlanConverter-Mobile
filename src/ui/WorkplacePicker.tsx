/**
 * Shared workplace / employer pack picker.
 * Profiles = employers on this device; pack/group/area/preset edit the active one.
 * Preview merges all profiles; Import/Fetch use the active profile.
 */
import { useMemo } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { t } from '@/src/i18n';
import {
  DEFAULT_GENERIC_PACK_ID,
  getPackById,
  isPresetReady,
  listBuiltinPacks,
  listPresetsForScope,
  type PackConfig,
  type PackGroup,
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

function groupHasReadyArea(g: PackGroup): boolean {
  return g.areas.some((a) => a.supported);
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
  const readyAreas = group?.areas.filter((a) => a.supported) || [];
  const soonAreaCount = (group?.areas.length || 0) - readyAreas.length;
  // Generic pack: hide fake Bereich/Rolle (Import / Standard).
  const showGroups = !isGeneric && (pack?.groups.length || 0) > 1;
  const showAreas = !isGeneric && readyAreas.length > 0;
  const showPresets = !isGeneric && presets.length > 0;
  const showProfiles = snap.workplaces.length > 0;
  const inlineProfiles = snap.workplaces.length <= PROFILE_INLINE_MAX;
  const activeProfile =
    snap.workplaces.find((w) => w.id === snap.activeWorkplaceId) || snap.workplaces[0];

  const pickPack = async (p: PackConfig) => {
    const g = p.groups.find((x) => groupHasReadyArea(x)) || p.groups[0];
    const a = g?.areas.find((x) => x.supported) || g?.areas[0];
    const readyPreset =
      a &&
      a.defaultPreset &&
      isPresetReady(p.id, g?.id || '', a.id, a.defaultPreset)
        ? a.defaultPreset
        : (a &&
            listPresetsForScope(p.id, g?.id || '', a.id).find((pr) =>
              isPresetReady(p.id, g?.id || '', a.id, pr)
            )) ||
          a?.defaultPreset ||
          '';
    await setWorkplace({
      packId: p.id,
      groupId: g?.id || '',
      areaId: a?.id || '',
      preset: readyPreset,
    });
  };

  const pickGroup = async (groupId: string) => {
    if (!pack) return;
    const g = pack.groups.find((x) => x.id === groupId);
    if (!g || !groupHasReadyArea(g)) return;
    const a = g.areas.find((x) => x.supported) || g.areas[0];
    await setWorkplace({
      packId: pack.id,
      groupId,
      areaId: a?.id || '',
      preset: a?.defaultPreset || '',
    });
  };

  const pickArea = async (areaId: string) => {
    if (!pack || !group) return;
    const a = group.areas.find((x) => x.id === areaId);
    if (!a?.supported) return;
    const readyPreset =
      a.defaultPreset &&
      isPresetReady(pack.id, group.id, a.id, a.defaultPreset)
        ? a.defaultPreset
        : listPresetsForScope(pack.id, group.id, a.id).find((p) =>
            isPresetReady(pack.id, group.id, a.id, p)
          ) ||
          a.defaultPreset ||
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
            {readyAreas.map((a) => (
              <AppButton
                key={a.id}
                compact
                title={a.label}
                variant={snap.areaId === a.id ? 'soft' : 'secondary'}
                onPress={() => void pickArea(a.id)}
              />
            ))}
          </View>
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
