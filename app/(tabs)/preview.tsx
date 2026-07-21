import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { t } from '@/src/i18n';
import { findMissingTimeKeys } from '@/src/convert/pipeline';
import type { ShiftEntry } from '@/src/convert/types';
import {
  getSnapshot,
  setEntries,
  setUserMappings,
  subscribe,
} from '@/src/state/store';
import { applyUserMappings } from '@/src/convert/pipeline';

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Monday=0
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - day);
  return x;
}

function highlightKind(dateStr: string, now = new Date()): 'today' | 'week' | 'month' | null {
  const d = new Date(dateStr + 'T12:00:00');
  const today = now.toISOString().slice(0, 10);
  if (dateStr === today) return 'today';
  const sow = startOfWeek(now);
  const eow = new Date(sow);
  eow.setDate(sow.getDate() + 6);
  if (d >= sow && d <= eow) return 'week';
  if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) return 'month';
  return null;
}

export default function PreviewScreen() {
  const [, setTick] = useState(0);
  const snap = getSnapshot();
  const [draftMappings, setDraftMappings] = useState<Record<string, string>>({});

  useEffect(() => subscribe(() => setTick((n) => n + 1)), []);
  useEffect(() => {
    setDraftMappings({ ...snap.userMappings });
  }, [snap.userMappings]);

  const missing = useMemo(() => findMissingTimeKeys(snap.entries), [snap.entries]);

  const onSaveMappings = async () => {
    const next = { ...snap.userMappings, ...draftMappings };
    await setUserMappings(next);
    const updated = applyUserMappings(snap.entries, next);
    await setEntries(updated);
  };

  const renderItem = ({ item }: { item: ShiftEntry }) => {
    const kind = highlightKind(item.date);
    const badge =
      kind === 'today'
        ? t('today')
        : kind === 'week'
          ? t('thisWeek')
          : kind === 'month'
            ? t('thisMonth')
            : null;
    return (
      <View
        style={[
          styles.row,
          kind === 'today' && styles.today,
          kind === 'week' && styles.week,
          kind === 'month' && styles.month,
        ]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>
            {item.date} · {item.type}
            {item.isValidated === false ? ' ⚠️' : ''}
          </Text>
          <Text style={styles.sub}>
            {item.allDay ? 'ganztägig' : `${item.start || '?'} – ${item.end || '?'}`}
            {item.pause ? ` · Pause ${item.pause}` : ''}
          </Text>
        </View>
        {badge ? <Text style={styles.badge}>{badge}</Text> : null}
      </View>
    );
  };

  if (!snap.entries.length) {
    return (
      <View style={styles.empty}>
        <Text>{t('previewEmpty')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>
        {snap.entries.length} Einträge
        {snap.summary?.uebertragVormonat
          ? ` · Übertrag ${snap.summary.uebertragVormonat}`
          : ''}
      </Text>

      {missing.length > 0 && (
        <View style={styles.mappingBox}>
          <Text style={styles.mappingTitle}>{t('missingMappings')}</Text>
          {missing.map((key) => (
            <View key={key} style={styles.mapRow}>
              <Text style={styles.mapKey}>{key}</Text>
              <TextInput
                style={styles.mapInput}
                placeholder="Code"
                value={draftMappings[key] || ''}
                onChangeText={(v) => setDraftMappings((m) => ({ ...m, [key]: v }))}
              />
            </View>
          ))}
          <Button title={t('saveMapping')} onPress={onSaveMappings} />
        </View>
      )}

      <FlatList
        data={snap.entries}
        keyExtractor={(item, i) => `${item.date}-${item.type}-${item.start}-${i}`}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: 24 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  header: { fontWeight: '600', marginBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#cbd5e1',
    backgroundColor: '#fff',
  },
  today: { backgroundColor: '#ccfbf1' },
  week: { backgroundColor: '#f0fdfa' },
  month: { backgroundColor: '#f8fafc' },
  title: { fontWeight: '600' },
  sub: { color: '#64748b', marginTop: 2 },
  badge: {
    fontSize: 11,
    color: '#0f766e',
    fontWeight: '700',
    marginLeft: 8,
  },
  mappingBox: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#fff7ed',
    marginBottom: 10,
    gap: 6,
  },
  mappingTitle: { fontWeight: '700' },
  mapRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mapKey: { width: 110, fontFamily: 'SpaceMono' },
  mapInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#fdba74',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: '#fff',
  },
});
