import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';

import { t } from '@/src/i18n';
import {
  findMissingTimeKeys,
  applyUserMappings,
  resolveStoredEntries,
} from '@/src/convert/pipeline';
import type { MonthSummary, ShiftEntry } from '@/src/convert/types';
import { getMappingForScope } from '@/src/packs';
import {
  getSnapshot,
  setEntries,
  setUserMappings,
  subscribe,
} from '@/src/state/store';
import { AppButton } from '@/src/ui/AppButton';
import { theme } from '@/src/ui/theme';

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Monday=0
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - day);
  return x;
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseEntryDate(dateStr: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function formatDeDate(dateStr: string): string {
  const d = parseEntryDate(dateStr);
  if (!d) return dateStr;
  return d.toLocaleDateString('de-DE');
}

function highlightKind(dateStr: string, now = new Date()): 'today' | 'week' | 'month' | null {
  const d = parseEntryDate(dateStr);
  if (!d) return null;
  const today = startOfLocalDay(now);
  if (d.getTime() === today.getTime()) return 'today';
  const sow = startOfWeek(now);
  const eow = new Date(sow);
  eow.setDate(sow.getDate() + 6);
  eow.setHours(23, 59, 59, 999);
  if (d >= sow && d <= eow) return 'week';
  if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) return 'month';
  return null;
}

function usefulSummary(s: MonthSummary | null | undefined): boolean {
  if (!s) return false;
  return !!(
    s.uebertragVormonat ||
    s.uebertragFolgemonat ||
    s.periodeIst ||
    s.periodeSaldo ||
    s.bereitschaftAuszahlung ||
    s.bereitschaftAzk
  );
}

function SummaryCard({ summaries }: { summaries: MonthSummary[] }) {
  const list = summaries.filter(usefulSummary);
  if (!list.length) return null;

  return (
    <View style={styles.summaryWrap}>
      <Text style={styles.sectionTitle}>{t('monthSummary')}</Text>
      {list.map((s, i) => {
        const title =
          s.month && s.year
            ? `${t('monthSummary')} ${s.month}/${s.year}`
            : t('monthSummary');
        const cells: [string, string | null][] = [
          [t('sumCarryPrev'), s.uebertragVormonat],
          [t('sumCarryNext'), s.uebertragFolgemonat],
          [t('sumPeriodIst'), s.periodeIst],
          [t('sumPeriodSaldo'), s.periodeSaldo],
          [t('sumBereitPay'), s.bereitschaftAuszahlung],
          [t('sumBereitAzk'), s.bereitschaftAzk],
        ];
        return (
          <View key={`${s.month}-${s.year}-${i}`} style={styles.summaryBlock}>
            <Text style={styles.summaryTitle}>{title}</Text>
            <View style={styles.summaryGrid}>
              {cells
                .filter(([, v]) => v != null && v !== '')
                .map(([label, value]) => (
                  <View key={label} style={styles.stat}>
                    <Text style={styles.statValue}>{value}</Text>
                    <Text style={styles.statLabel}>{label}</Text>
                  </View>
                ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

export default function PreviewScreen() {
  const [, setTick] = useState(0);
  const snap = getSnapshot();
  const [draftMappings, setDraftMappings] = useState<Record<string, string>>({});
  const listRef = useRef<FlatList<ShiftEntry>>(null);
  const scrolledRef = useRef(false);

  useEffect(() => subscribe(() => setTick((n) => n + 1)), []);
  useEffect(() => {
    setDraftMappings({ ...snap.userMappings });
  }, [snap.userMappings]);

  const entries = useMemo(() => {
    const mapping =
      snap.hospitalId && snap.groupId && snap.areaId
        ? getMappingForScope(snap.hospitalId, snap.groupId, snap.areaId) || undefined
        : undefined;
    return resolveStoredEntries(snap.entries, {
      preset: snap.preset || undefined,
      mapping,
      userMappings: snap.userMappings,
    });
  }, [
    snap.entries,
    snap.preset,
    snap.userMappings,
    snap.hospitalId,
    snap.groupId,
    snap.areaId,
  ]);

  // Persist soft-resolved early-leave codes so Export/ICS match Kalender
  useEffect(() => {
    if (!snap.entries.length) return;
    let changed = false;
    for (let i = 0; i < snap.entries.length; i++) {
      if (snap.entries[i].type !== entries[i]?.type) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    void setEntries(entries);
  }, [snap.entries, entries]);

  const missing = useMemo(() => findMissingTimeKeys(entries), [entries]);

  const focusIndex = useMemo(() => {
    const now = new Date();
    let monthIdx: number | null = null;
    for (let i = 0; i < entries.length; i++) {
      const kind = highlightKind(entries[i].date, now);
      if (kind === 'today' || kind === 'week') return i;
      if (kind === 'month' && monthIdx == null) monthIdx = i;
    }
    return monthIdx ?? 0;
  }, [entries]);

  useEffect(() => {
    scrolledRef.current = false;
  }, [entries.length]);

  useEffect(() => {
    if (!entries.length || scrolledRef.current) return;
    const timer = setTimeout(() => {
      try {
        listRef.current?.scrollToIndex({ index: focusIndex, animated: true, viewPosition: 0.15 });
        scrolledRef.current = true;
      } catch {
        // ignore if not measured yet
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [entries, focusIndex]);

  const onSaveMappings = async () => {
    const next = { ...snap.userMappings, ...draftMappings };
    await setUserMappings(next);
    const updated = applyUserMappings(entries, next);
    await setEntries(updated);
  };

  const summaries =
    snap.summaries?.length > 0
      ? snap.summaries
      : snap.summary
        ? [snap.summary]
        : [];

  const renderItem = ({ item, index }: { item: ShiftEntry; index: number }) => {
    const kind = highlightKind(item.date);
    const type = item.isWork && !item.type ? '?' : item.type || '';
    const start = item.allDay ? t('allDay') : item.start || '';
    const end = item.allDay ? '' : item.end || '';
    return (
      <View
        style={[
          styles.row,
          kind === 'today' && styles.today,
          kind === 'week' && styles.week,
          kind === 'month' && styles.month,
          index === focusIndex && styles.focusRow,
        ]}>
        <Text style={[styles.colDate, styles.cell]} numberOfLines={1}>
          {formatDeDate(item.date)}
        </Text>
        <Text style={[styles.colCode, styles.cell, styles.code]} numberOfLines={1}>
          {type}
          {item.isValidated === false ? ' ⚠️' : ''}
        </Text>
        <Text style={[styles.colTime, styles.cell]} numberOfLines={1}>
          {start}
        </Text>
        <Text style={[styles.colTime, styles.cell]} numberOfLines={1}>
          {end}
        </Text>
      </View>
    );
  };

  if (!entries.length) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>{t('previewEmpty')}</Text>
      </View>
    );
  }

  const ListHeader = (
    <View>
      <Text style={styles.h1}>{t('tabPreview')}</Text>
      <Text style={styles.hint}>{t('previewHint')}</Text>

      <SummaryCard summaries={summaries} />

      {missing.length > 0 && (
        <View style={styles.mappingBox}>
          <Text style={styles.mappingTitle}>{t('missingMappings')}</Text>
          <Text style={styles.mappingHint}>{t('missingMappingsHint')}</Text>
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
          <AppButton title={t('saveMapping')} onPress={onSaveMappings} />
        </View>
      )}

      <View style={styles.tableHead}>
        <Text style={[styles.colDate, styles.headCell]}>{t('colDate')}</Text>
        <Text style={[styles.colCode, styles.headCell]}>{t('colCode')}</Text>
        <Text style={[styles.colTime, styles.headCell]}>{t('colStart')}</Text>
        <Text style={[styles.colTime, styles.headCell]}>{t('colEnd')}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        ref={listRef}
        data={entries}
        keyExtractor={(item, i) => `${item.date}-${item.type}-${item.start}-${i}`}
        renderItem={renderItem}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={
          <Text style={styles.footer}>
            {entries.length} {t('entriesCount')} · {t('previewHighlightHint')}
          </Text>
        }
        contentContainerStyle={{ paddingBottom: 28 }}
        onScrollToIndexFailed={(info) => {
          setTimeout(() => {
            listRef.current?.scrollToIndex({
              index: Math.min(info.index, entries.length - 1),
              animated: true,
            });
          }, 400);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5F9' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText: { color: '#64748B', textAlign: 'center', fontSize: 15, lineHeight: 22 },
  h1: { fontSize: 24, fontWeight: '700', letterSpacing: -0.3, paddingHorizontal: 16, paddingTop: 16, color: '#0F172A' },
  hint: { color: '#64748B', fontSize: 13, paddingHorizontal: 16, marginBottom: 10, marginTop: 4 },
  sectionTitle: { fontWeight: '700', fontSize: 15, marginBottom: 8, color: '#0F172A' },
  summaryWrap: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  summaryBlock: { marginBottom: 10 },
  summaryTitle: { fontWeight: '600', marginBottom: 8, color: '#0F172A' },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: {
    minWidth: '45%',
    flexGrow: 1,
    backgroundColor: '#ECFDF5',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  statValue: { fontWeight: '700', fontSize: 16, color: '#0F766E' },
  statLabel: { fontSize: 11, color: '#64748B', marginTop: 2 },
  mappingBox: {
    marginHorizontal: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FFFBEB',
    marginBottom: 10,
    gap: 6,
  },
  mappingTitle: { fontWeight: '700', color: '#0F172A' },
  mappingHint: { fontSize: 12, color: '#B45309', marginBottom: 4 },
  mapRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mapKey: { width: 110, fontFamily: 'SpaceMono' },
  mapInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#FCD34D',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: '#fff',
  },
  tableHead: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#E2E8F0',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: '#CBD5E1',
  },
  headCell: { fontWeight: '700', fontSize: 12, color: '#334155' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#fff',
  },
  focusRow: { borderLeftWidth: 3, borderLeftColor: '#0F766E' },
  today: { backgroundColor: 'rgba(15, 118, 110, 0.18)' },
  week: { backgroundColor: 'rgba(15, 118, 110, 0.10)' },
  month: { backgroundColor: 'rgba(15, 118, 110, 0.05)' },
  cell: { fontSize: 13, color: '#0F172A' },
  code: { fontWeight: '700' },
  colDate: { width: '28%' },
  colCode: { width: '28%' },
  colTime: { width: '22%' },
  footer: {
    padding: 14,
    color: '#64748B',
    fontSize: 12,
    textAlign: 'center',
  },
});
