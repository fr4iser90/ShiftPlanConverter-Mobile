import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ShiftEntry } from '@/src/convert/types';
import {
  addDays,
  monthTitle,
  sameDay,
  startOfWeek,
  toIsoDate,
  weekdayShort,
} from '@/src/calendar/dates';
import { colorForShiftType, entriesByDate } from '@/src/calendar/shifts';
import { useTheme } from '@/src/ui/useTheme';

type Props = {
  entries: ShiftEntry[];
  anchor: Date;
  onAnchorChange: (d: Date) => void;
  packColors?: Record<string, string> | null;
};

export function ShiftMonthView({ entries, anchor, onAnchorChange, packColors }: Props) {
  const theme = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: { paddingHorizontal: 12, paddingBottom: 8 },
        nav: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
          paddingHorizontal: 4,
        },
        navBtn: { fontSize: 28, color: theme.color.primary, paddingHorizontal: 8, fontWeight: '300' },
        navTitle: {
          fontSize: 16,
          fontWeight: '700',
          color: theme.color.ink,
          textTransform: 'capitalize',
        },
        weekHead: { flexDirection: 'row', marginBottom: 4 },
        weekHeadCell: {
          flex: 1,
          textAlign: 'center',
          fontSize: 11,
          fontWeight: '700',
          color: theme.color.inkFaint,
        },
        grid: { flexDirection: 'row', flexWrap: 'wrap' },
        cell: {
          width: '14.28%',
          minHeight: 64,
          padding: 4,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.color.border,
          backgroundColor: theme.color.surface,
        },
        cellOutside: { backgroundColor: theme.color.canvas },
        cellToday: { borderColor: theme.color.primary, borderWidth: 1.5 },
        dayNum: { fontSize: 12, fontWeight: '600', color: theme.color.ink },
        todayText: { color: theme.color.primary },
        outText: { color: theme.color.inkFaint },
        dots: { flexDirection: 'row', flexWrap: 'wrap', gap: 2, marginTop: 2, alignItems: 'center' },
        dot: { width: 6, height: 6, borderRadius: 3 },
        more: { fontSize: 9, color: theme.color.inkFaint },
        code: { fontSize: 10, fontWeight: '700', color: theme.color.inkSecondary, marginTop: 2 },
      }),
    [theme],
  );

  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const first = new Date(year, month, 1);
  const gridStart = startOfWeek(first);
  const byDate = entriesByDate(entries);
  const today = new Date();
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  const prevMonth = () => onAnchorChange(new Date(year, month - 1, 1));
  const nextMonth = () => onAnchorChange(new Date(year, month + 1, 1));

  return (
    <View style={styles.wrap}>
      <View style={styles.nav}>
        <Pressable onPress={prevMonth} hitSlop={8}>
          <Text style={styles.navBtn}>‹</Text>
        </Pressable>
        <Pressable onPress={() => onAnchorChange(new Date())}>
          <Text style={styles.navTitle}>{monthTitle(anchor)}</Text>
        </Pressable>
        <Pressable onPress={nextMonth} hitSlop={8}>
          <Text style={styles.navBtn}>›</Text>
        </Pressable>
      </View>

      <View style={styles.weekHead}>
        {Array.from({ length: 7 }, (_, i) => addDays(gridStart, i)).map((d) => (
          <Text key={weekdayShort(d)} style={styles.weekHeadCell}>
            {weekdayShort(d)}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((day) => {
          const iso = toIsoDate(day);
          const inMonth = day.getMonth() === month;
          const list = byDate.get(iso) || [];
          const isToday = sameDay(day, today);
          return (
            <View
              key={iso}
              style={[styles.cell, !inMonth && styles.cellOutside, isToday && styles.cellToday]}>
              <Text style={[styles.dayNum, isToday && styles.todayText, !inMonth && styles.outText]}>
                {day.getDate()}
              </Text>
              <View style={styles.dots}>
                {list.slice(0, 3).map((e, i) => (
                  <View
                    key={`${iso}-${i}`}
                    style={[styles.dot, { backgroundColor: colorForShiftType(e.type, packColors) }]}
                  />
                ))}
                {list.length > 3 ? <Text style={styles.more}>+{list.length - 3}</Text> : null}
              </View>
              {list[0] ? (
                <Text style={styles.code} numberOfLines={1}>
                  {list[0].type}
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}
