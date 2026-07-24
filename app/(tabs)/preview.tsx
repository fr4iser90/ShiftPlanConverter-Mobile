import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { t } from '@/src/i18n';
import {
  findMissingTimeKeys,
  applyUserMappings,
  resolveStoredEntries,
} from '@/src/convert/pipeline';
import type { MonthSummary, ShiftEntry } from '@/src/convert/types';
import { getMappingForScope } from '@/src/packs';
import {
  formatDeDate,
  highlightKind,
} from '@/src/calendar/dates';
import {
  getSnapshot,
  setEntries,
  setUserMappings,
  subscribe,
} from '@/src/state/store';
import { AppButton } from '@/src/ui/AppButton';
import { ShiftWeekView } from '@/src/ui/ShiftWeekView';
import { ShiftMonthView } from '@/src/ui/ShiftMonthView';
import { theme } from '@/src/ui/theme';

type CalMode = 'week' | 'month' | 'list';
const MODE_KEY = 'loga3.calendarViewMode';

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

function ModeSwitch({ mode, onChange }: { mode: CalMode; onChange: (m: CalMode) => void }) {
  const modes: { id: CalMode; label: string }[] = [
    { id: 'week', label: t('calWeek') },
    { id: 'month', label: t('calMonth') },
    { id: 'list', label: t('calList') },
  ];
  return (
    <View style={styles.modeRow}>
      {modes.map((m) => (
        <Pressable
          key={m.id}
          onPress={() => onChange(m.id)}
          style={[styles.modeChip, mode === m.id && styles.modeChipOn]}>
          <Text style={[styles.modeChipText, mode === m.id && styles.modeChipTextOn]}>
            {m.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function PreviewScreen() {
  const [, setTick] = useState(0);
  const snap = getSnapshot();
  const [draftMappings, setDraftMappings] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<CalMode>('week');
  const [anchor, setAnchor] = useState(() => new Date());
  const listRef = useRef<FlatList<ShiftEntry>>(null);
  const scrolledRef = useRef(false);

  useEffect(() => subscribe(() => setTick((n) => n + 1)), []);
  useEffect(() => {
    setDraftMappings({ ...snap.userMappings });
  }, [snap.userMappings]);
  useEffect(() => {
    void AsyncStorage.getItem(MODE_KEY).then((v) => {
      if (v === 'week' || v === 'month' || v === 'list') setMode(v);
    });
  }, []);

  const setModePersist = (m: CalMode) => {
    setMode(m);
    void AsyncStorage.setItem(MODE_KEY, m);
  };

  const packMapping = useMemo(() => {
    if (!snap.hospitalId || !snap.groupId || !snap.areaId) return null;
    return getMappingForScope(snap.hospitalId, snap.groupId, snap.areaId);
  }, [snap.hospitalId, snap.groupId, snap.areaId]);

  const entries = useMemo(() => {
    return resolveStoredEntries(snap.entries, {
      preset: snap.preset || undefined,
      mapping: packMapping || undefined,
      userMappings: snap.userMappings,
    });
  }, [snap.entries, snap.preset, snap.userMappings, packMapping]);

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
    if (mode !== 'list' || !entries.length || scrolledRef.current) return;
    const timer = setTimeout(() => {
      try {
        listRef.current?.scrollToIndex({ index: focusIndex, animated: true, viewPosition: 0.15 });
        scrolledRef.current = true;
      } catch {
        // ignore
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [entries, focusIndex, mode]);

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

  const packColors = packMapping?.colors || null;

  const header = (
    <View>
      <Text style={styles.h1}>{t('tabPreview')}</Text>
      <Text style={styles.hint}>{t('previewHint')}</Text>
      <ModeSwitch mode={mode} onChange={setModePersist} />
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
    </View>
  );

  if (!entries.length) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>{t('previewEmpty')}</Text>
      </View>
    );
  }

  if (mode === 'week' || mode === 'month') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 28 }}>
        {header}
        {mode === 'week' ? (
          <ShiftWeekView
            entries={entries}
            anchor={anchor}
            onAnchorChange={setAnchor}
            packColors={packColors}
          />
        ) : (
          <ShiftMonthView
            entries={entries}
            anchor={anchor}
            onAnchorChange={setAnchor}
            packColors={packColors}
          />
        )}
        <Text style={styles.footer}>
          {entries.length} {t('entriesCount')}
        </Text>
      </ScrollView>
    );
  }

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

  return (
    <View style={styles.container}>
      <FlatList
        ref={listRef}
        data={entries}
        keyExtractor={(item, i) => `${item.date}-${item.type}-${item.start}-${i}`}
        renderItem={renderItem}
        ListHeaderComponent={
          <View>
            {header}
            <View style={styles.tableHead}>
              <Text style={[styles.colDate, styles.headCell]}>{t('colDate')}</Text>
              <Text style={[styles.colCode, styles.headCell]}>{t('colCode')}</Text>
              <Text style={[styles.colTime, styles.headCell]}>{t('colStart')}</Text>
              <Text style={[styles.colTime, styles.headCell]}>{t('colEnd')}</Text>
            </View>
          </View>
        }
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
  container: { flex: 1, backgroundColor: theme.color.canvas },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText: { color: theme.color.inkMuted, textAlign: 'center', fontSize: 15, lineHeight: 22 },
  h1: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.3,
    paddingHorizontal: 16,
    paddingTop: 16,
    color: theme.color.ink,
  },
  hint: {
    color: theme.color.inkMuted,
    fontSize: 13,
    paddingHorizontal: 16,
    marginBottom: 8,
    marginTop: 4,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  modeChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.borderStrong,
  },
  modeChipOn: {
    backgroundColor: theme.color.primary,
    borderColor: theme.color.primary,
  },
  modeChipText: { fontSize: 13, fontWeight: '600', color: theme.color.inkSecondary },
  modeChipTextOn: { color: '#fff' },
  sectionTitle: { fontWeight: '700', fontSize: 15, marginBottom: 8, color: theme.color.ink },
  summaryWrap: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  summaryBlock: { marginBottom: 10 },
  summaryTitle: { fontWeight: '600', marginBottom: 8, color: theme.color.ink },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: {
    minWidth: '45%',
    flexGrow: 1,
    backgroundColor: theme.color.primaryTint,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  statValue: { fontWeight: '700', fontSize: 16, color: theme.color.primary },
  statLabel: { fontSize: 11, color: theme.color.inkMuted, marginTop: 2 },
  mappingBox: {
    marginHorizontal: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: theme.color.warnSoft,
    marginBottom: 10,
    gap: 6,
  },
  mappingTitle: { fontWeight: '700', color: theme.color.ink },
  mappingHint: { fontSize: 12, color: theme.color.warn, marginBottom: 4 },
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
    backgroundColor: theme.color.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: theme.color.borderStrong,
  },
  headCell: { fontWeight: '700', fontSize: 12, color: theme.color.inkSecondary },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.color.border,
    backgroundColor: '#fff',
  },
  focusRow: { borderLeftWidth: 3, borderLeftColor: theme.color.primary },
  today: { backgroundColor: theme.color.today },
  week: { backgroundColor: theme.color.week },
  month: { backgroundColor: theme.color.month },
  cell: { fontSize: 13, color: theme.color.ink },
  code: { fontWeight: '700' },
  colDate: { width: '28%' },
  colCode: { width: '28%' },
  colTime: { width: '22%' },
  footer: {
    padding: 14,
    color: theme.color.inkMuted,
    fontSize: 12,
    textAlign: 'center',
  },
});
