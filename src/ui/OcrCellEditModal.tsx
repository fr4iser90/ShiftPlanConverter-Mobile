/**
 * Edit one OCR review cell: duty short + optional time override.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { t } from '@/src/i18n';
import {
  formatOcrDutyCell,
  parseOcrDutyCell,
  type OcrDutyCellPart,
} from '@/src/convert/parsers/ocr/matrixToEntries';
import {
  findDateDutyColumnByShort,
  formatDateDutyTimeLabel,
  resolveDateDutyColumnTime,
} from '@/src/packs/dateDutyTimes';
import type { PackDateDutyConfig } from '@/src/packs/types';
import { useTheme } from '@/src/ui/useTheme';
import type { AppTheme } from '@/src/ui/theme';

type Props = {
  visible: boolean;
  dayLabel: string;
  initialCell: string;
  dateDuty?: PackDateDutyConfig | null;
  date?: Date | null;
  onCancel: () => void;
  onSave: (cell: string) => void;
};

export function OcrCellEditModal({
  visible,
  dayLabel,
  initialCell,
  dateDuty = null,
  date = null,
  onCancel,
  onSave,
}: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const shorts = useMemo(
    () =>
      (dateDuty?.columns || [])
        .map((c) => String(c.short || c.id || '').trim().toUpperCase())
        .filter(Boolean),
    [dateDuty]
  );

  const [short, setShort] = useState('');
  const [timeText, setTimeText] = useState('');

  useEffect(() => {
    if (!visible) return;
    const parts = parseOcrDutyCell(initialCell);
    const first = parts[0];
    setShort(first?.short || '');
    if (first?.start && first?.end) {
      const plus = first.endNextDay || first.end < first.start ? '+1' : '';
      setTimeText(`${first.start}-${first.end}${plus}`);
    } else if (first?.short && date && dateDuty) {
      const col = findDateDutyColumnByShort(dateDuty, first.short);
      const tSlot = col ? resolveDateDutyColumnTime(col, date) : null;
      setTimeText(tSlot ? formatDateDutyTimeLabel(tSlot) : '');
    } else {
      setTimeText('');
    }
  }, [visible, initialCell, date, dateDuty]);

  const applyShort = (code: string) => {
    setShort(code);
    if (!date || !dateDuty) return;
    const col = findDateDutyColumnByShort(dateDuty, code);
    const tSlot = col ? resolveDateDutyColumnTime(col, date) : null;
    setTimeText(tSlot ? formatDateDutyTimeLabel(tSlot) : '');
  };

  const save = () => {
    const code = short.trim().toUpperCase();
    if (!code) {
      onSave('');
      return;
    }
    const m = /^(\d{2}:\d{2})-(\d{2}:\d{2})(\+1)?$/i.exec(timeText.trim());
    let part: OcrDutyCellPart = { short: code };
    if (m) {
      const start = m[1]!;
      const end = m[2]!;
      const endNextDay = !!m[3] || end < start;
      // Pack-default time → store short only (cleaner grid).
      let isDefault = false;
      if (date && dateDuty) {
        const col = findDateDutyColumnByShort(dateDuty, code);
        const tSlot = col ? resolveDateDutyColumnTime(col, date) : null;
        if (
          tSlot &&
          tSlot.start === start &&
          tSlot.end === end &&
          !!tSlot.endNextDay === endNextDay
        ) {
          isDefault = true;
        }
      }
      if (!isDefault) {
        part = { short: code, start, end, endNextDay };
      }
    }
    onSave(formatOcrDutyCell([part]));
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>{t('sourceOcrCellEditTitle', { day: dayLabel })}</Text>
          <Text style={styles.hint}>{t('sourceOcrCellEditHint')}</Text>

          <Text style={styles.label}>{t('sourceOcrCellEditCode')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            <Pressable
              onPress={() => {
                setShort('');
                setTimeText('');
              }}
              style={[styles.chip, !short && styles.chipOn]}
            >
              <Text style={[styles.chipText, !short && styles.chipTextOn]}>
                {t('sourceOcrCellEditClear')}
              </Text>
            </Pressable>
            {shorts.map((s) => (
              <Pressable
                key={s}
                onPress={() => applyShort(s)}
                style={[styles.chip, short === s && styles.chipOn]}
              >
                <Text style={[styles.chipText, short === s && styles.chipTextOn]}>{s}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <TextInput
            style={styles.input}
            value={short}
            onChangeText={(v) => setShort(v.toUpperCase())}
            autoCapitalize="characters"
            placeholder="HD"
            placeholderTextColor={theme.color.inkMuted}
          />

          <Text style={styles.label}>{t('sourceOcrCellEditTime')}</Text>
          <TextInput
            style={styles.input}
            value={timeText}
            onChangeText={setTimeText}
            placeholder="11:30-08:30+1"
            placeholderTextColor={theme.color.inkMuted}
            autoCapitalize="none"
          />

          <View style={styles.actions}>
            <Pressable onPress={onCancel} style={styles.btnGhost}>
              <Text style={styles.btnGhostText}>{t('cancel')}</Text>
            </Pressable>
            <Pressable onPress={save} style={styles.btnPrimary}>
              <Text style={styles.btnPrimaryText}>{t('sourceOcrCellEditSave')}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function makeStyles(theme: AppTheme) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'center',
      padding: 20,
    },
    card: {
      backgroundColor: theme.color.surface,
      borderRadius: theme.radius.md,
      padding: 16,
      gap: 8,
      borderWidth: 1,
      borderColor: theme.color.borderStrong,
    },
    title: { color: theme.color.ink, fontSize: 16, fontWeight: '700' },
    hint: { color: theme.color.inkMuted, fontSize: 12, lineHeight: 16, marginBottom: 4 },
    label: { color: theme.color.inkSecondary, fontSize: 12, fontWeight: '600', marginTop: 4 },
    chipRow: { flexGrow: 0, marginVertical: 4 },
    chip: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: theme.radius.sm,
      borderWidth: 1,
      borderColor: theme.color.borderStrong,
      marginRight: 6,
      backgroundColor: theme.color.surfaceMuted,
    },
    chipOn: {
      borderColor: theme.color.primary,
      backgroundColor: theme.color.primaryTint,
    },
    chipText: { color: theme.color.inkSecondary, fontWeight: '600', fontSize: 12 },
    chipTextOn: { color: theme.color.primary },
    input: {
      borderWidth: 1,
      borderColor: theme.color.borderStrong,
      borderRadius: theme.radius.sm,
      paddingHorizontal: 10,
      paddingVertical: 8,
      color: theme.color.ink,
      fontSize: 14,
      backgroundColor: theme.color.surfaceMuted,
    },
    actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 10 },
    btnGhost: { paddingHorizontal: 12, paddingVertical: 10 },
    btnGhostText: { color: theme.color.inkSecondary, fontWeight: '600' },
    btnPrimary: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: theme.radius.sm,
      backgroundColor: theme.color.primary,
    },
    btnPrimaryText: { color: '#fff', fontWeight: '700' },
  });
}
