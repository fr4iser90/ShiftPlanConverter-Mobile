import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ShiftEntry } from '@/src/convert/types';
import {
  addDays,
  sameDay,
  startOfWeek,
  toIsoDate,
  weekdayShort,
  weekTitle,
} from '@/src/calendar/dates';
import { colorForShiftType, entriesByDate, formatShiftLine } from '@/src/calendar/shifts';
import { useTheme } from '@/src/ui/useTheme';

type Props = {
  entries: ShiftEntry[];
  anchor: Date;
  onAnchorChange: (d: Date) => void;
  packColors?: Record<string, string> | null;
};

export function ShiftWeekView({ entries, anchor, onAnchorChange, packColors }: Props) {
  const theme = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: { gap: 6, paddingHorizontal: 16, paddingBottom: 8 },
        nav: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 4,
        },
        navBtn: { fontSize: 28, color: theme.color.primary, paddingHorizontal: 8, fontWeight: '300' },
        navTitle: { fontSize: 15, fontWeight: '700', color: theme.color.ink },
        dayRow: {
          flexDirection: 'row',
          gap: 10,
          paddingVertical: 8,
          paddingHorizontal: 10,
          borderRadius: theme.radius.md,
          backgroundColor: theme.color.surface,
          borderWidth: 1,
          borderColor: theme.color.border,
        },
        dayToday: {
          borderColor: theme.color.primary,
          backgroundColor: theme.color.primarySoft,
        },
        dayLabel: { width: 40, alignItems: 'center' },
        weekday: { fontSize: 11, color: theme.color.inkFaint, fontWeight: '600' },
        dayNum: { fontSize: 18, fontWeight: '700', color: theme.color.ink },
        todayText: { color: theme.color.primary },
        chips: { flex: 1, gap: 4, justifyContent: 'center' },
        emptyDay: { color: theme.color.inkFaint, fontSize: 13 },
        chip: {
          borderRadius: 6,
          paddingVertical: 5,
          paddingHorizontal: 8,
        },
        chipText: { color: '#fff', fontSize: 12, fontWeight: '600' },
      }),
    [theme],
  );

  const sow = startOfWeek(anchor);
  const byDate = entriesByDate(entries);
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => addDays(sow, i));

  return (
    <View style={styles.wrap}>
      <View style={styles.nav}>
        <Pressable onPress={() => onAnchorChange(addDays(sow, -7))} hitSlop={8}>
          <Text style={styles.navBtn}>‹</Text>
        </Pressable>
        <Pressable onPress={() => onAnchorChange(new Date())}>
          <Text style={styles.navTitle}>{weekTitle(sow)}</Text>
        </Pressable>
        <Pressable onPress={() => onAnchorChange(addDays(sow, 7))} hitSlop={8}>
          <Text style={styles.navBtn}>›</Text>
        </Pressable>
      </View>

      {days.map((day) => {
        const iso = toIsoDate(day);
        const list = byDate.get(iso) || [];
        const isToday = sameDay(day, today);
        return (
          <View key={iso} style={[styles.dayRow, isToday && styles.dayToday]}>
            <View style={styles.dayLabel}>
              <Text style={[styles.weekday, isToday && styles.todayText]}>{weekdayShort(day)}</Text>
              <Text style={[styles.dayNum, isToday && styles.todayText]}>{day.getDate()}</Text>
            </View>
            <View style={styles.chips}>
              {list.length === 0 ? (
                <Text style={styles.emptyDay}>—</Text>
              ) : (
                list.map((e, i) => (
                  <View
                    key={`${iso}-${i}`}
                    style={[styles.chip, { backgroundColor: colorForShiftType(e.type, packColors) }]}>
                    <Text style={styles.chipText} numberOfLines={1}>
                      {formatShiftLine(e)}
                    </Text>
                  </View>
                ))
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}
