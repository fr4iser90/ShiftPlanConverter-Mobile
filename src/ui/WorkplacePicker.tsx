/**
 * Shared workplace / employer pack picker.
 */
import { StyleSheet, Text, View } from 'react-native';

import { t } from '@/src/i18n';
import {
  getPackById,
  listBuiltinPacks,
  listPresetsForScope,
  type PackConfig,
} from '@/src/packs';
import { getSnapshot, setWorkplace } from '@/src/state/store';
import { AppButton } from '@/src/ui/AppButton';
import { theme } from '@/src/ui/theme';

export function WorkplacePicker() {
  const snap = getSnapshot();
  const packs = listBuiltinPacks();
  const pack: PackConfig | null = snap.hospitalId ? getPackById(snap.hospitalId) : null;
  const group = pack?.groups.find((g) => g.id === snap.groupId);
  const area = group?.areas.find((a) => a.id === snap.areaId);
  const presets =
    snap.hospitalId && snap.groupId && snap.areaId
      ? listPresetsForScope(snap.hospitalId, snap.groupId, snap.areaId)
      : [];

  const pickHospital = async (p: PackConfig) => {
    const g = p.groups[0];
    const a = g?.areas.find((x) => x.supported) || g?.areas[0];
    await setWorkplace({
      hospitalId: p.id,
      groupId: g?.id || '',
      areaId: a?.id || '',
      preset: a?.defaultPreset || '',
    });
  };

  const pickGroup = async (groupId: string) => {
    if (!pack) return;
    const g = pack.groups.find((x) => x.id === groupId);
    const a = g?.areas.find((x) => x.supported) || g?.areas[0];
    await setWorkplace({
      hospitalId: pack.id,
      groupId,
      areaId: a?.id || '',
      preset: a?.defaultPreset || '',
    });
  };

  const pickArea = async (areaId: string) => {
    if (!pack || !group) return;
    const a = group.areas.find((x) => x.id === areaId);
    await setWorkplace({
      hospitalId: pack.id,
      groupId: group.id,
      areaId,
      preset: a?.defaultPreset || snap.preset || '',
    });
  };

  const pickPreset = async (preset: string) => {
    await setWorkplace({
      hospitalId: snap.hospitalId,
      groupId: snap.groupId,
      areaId: snap.areaId,
      preset,
    });
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{t('hospital')}</Text>
      <View style={styles.rowWrap}>
        {packs.map((p) => (
          <AppButton
            key={p.id}
            compact
            title={p.name}
            variant={snap.hospitalId === p.id ? 'soft' : 'secondary'}
            onPress={() => void pickHospital(p)}
          />
        ))}
      </View>
      {!packs.length && <Text style={styles.meta}>{t('noPacksYet')}</Text>}

      {pack && (
        <>
          <Text style={styles.label}>{t('group')}</Text>
          <View style={styles.rowWrap}>
            {pack.groups.map((g) => (
              <AppButton
                key={g.id}
                compact
                title={g.label}
                variant={snap.groupId === g.id ? 'soft' : 'secondary'}
                onPress={() => void pickGroup(g.id)}
              />
            ))}
          </View>
        </>
      )}

      {group && (
        <>
          <Text style={styles.label}>{t('area')}</Text>
          <View style={styles.rowWrap}>
            {group.areas.map((a) => (
              <AppButton
                key={a.id}
                compact
                title={a.supported ? a.label : `${a.label} (${t('soon')})`}
                disabled={!a.supported}
                variant={snap.areaId === a.id ? 'soft' : 'secondary'}
                onPress={() => void pickArea(a.id)}
              />
            ))}
          </View>
        </>
      )}

      {area && presets.length > 0 && (
        <>
          <Text style={styles.label}>{t('preset')}</Text>
          <View style={styles.rowWrap}>
            {presets.map((p) => (
              <AppButton
                key={p}
                compact
                title={p}
                variant={snap.preset === p ? 'soft' : 'secondary'}
                onPress={() => void pickPreset(p)}
              />
            ))}
          </View>
        </>
      )}

      {pack?.hint ? <Text style={styles.meta}>{pack.hint}</Text> : null}
      <Text style={styles.meta}>{t('moreEmployersSoon')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { fontWeight: '600', marginTop: 8, color: theme.color.ink, fontSize: 13 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 4 },
  meta: { fontSize: 12, color: theme.color.inkMuted, marginTop: 4 },
});
