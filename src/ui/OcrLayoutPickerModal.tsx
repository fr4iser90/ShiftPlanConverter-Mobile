/**
 * Choose OCR layout when auto detection is uncertain (one path — ask, don't chain).
 */
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { t } from '@/src/i18n';
import type { ConcreteOcrLayoutId } from '@/src/sources/ocr/layouts/types';
import { OCR_TEXT_ONLY_FALLBACK, getOcrLayout } from '@/src/sources/ocr/layouts';
import { AppButton } from '@/src/ui/AppButton';
import { useTheme } from '@/src/ui/useTheme';
import type { AppTheme } from '@/src/ui/theme';

export type OcrLayoutPickOption = {
  id: ConcreteOcrLayoutId | typeof OCR_TEXT_ONLY_FALLBACK;
  score?: number;
};

export type OcrLayoutPickRequest = {
  options: OcrLayoutPickOption[];
  suggestedId?: string | null;
  reason?: string | null;
};

export type OcrLayoutPickResult = {
  id: ConcreteOcrLayoutId | typeof OCR_TEXT_ONLY_FALLBACK;
};

type Props = {
  visible: boolean;
  options: OcrLayoutPickOption[];
  suggestedId?: string | null;
  reason?: string | null;
  onCancel: () => void;
  onPick: (result: OcrLayoutPickResult) => void;
};

function labelFor(id: string): string {
  if (id === OCR_TEXT_ONLY_FALLBACK) return t('ocrLayoutRaw');
  const layout = getOcrLayout(id);
  return layout ? t(layout.labelKey as 'ocrLayoutRaw') : id;
}

function hintFor(id: string): string {
  if (id === OCR_TEXT_ONLY_FALLBACK) return t('ocrLayoutRawHint');
  const layout = getOcrLayout(id);
  return layout?.hintKey ? t(layout.hintKey as 'ocrLayoutRawHint') : '';
}

export function OcrLayoutPickerModal({
  visible,
  options,
  suggestedId,
  reason,
  onCancel,
  onPick,
}: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setSelectedId(suggestedId || options[0]?.id || null);
  }, [visible, suggestedId, options]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <View style={styles.root}>
        <Text style={styles.title}>{t('sourceOcrLayoutPickTitle')}</Text>
        <Text style={styles.hint}>{t('sourceOcrLayoutPickHint')}</Text>
        {reason ? <Text style={styles.reason}>{reason}</Text> : null}
        <FlatList
          data={options}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const on = selectedId === item.id;
            return (
              <Pressable
                onPress={() => setSelectedId(item.id)}
                android_ripple={{ color: theme.color.primarySoft }}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                style={({ pressed }) => [
                  styles.row,
                  on && styles.rowOn,
                  pressed && !on && { opacity: 0.85, backgroundColor: theme.color.primaryTint },
                ]}
              >
                <View style={[styles.radio, on && styles.radioOn]}>
                  {on ? <View style={styles.radioDot} /> : null}
                </View>
                <View style={styles.rowText}>
                  <Text style={[styles.rowTitle, on && styles.rowTitleOn]}>{labelFor(item.id)}</Text>
                  <Text style={styles.rowHint} numberOfLines={2}>
                    {hintFor(item.id)}
                  </Text>
                </View>
                {typeof item.score === 'number' ? (
                  <Text style={styles.score}>{Math.round(item.score * 100)}%</Text>
                ) : null}
              </Pressable>
            );
          }}
        />
        <View style={styles.actions}>
          <AppButton title={t('sourceOcrLayoutPickSkip')} variant="ghost" onPress={onCancel} />
          <AppButton
            title={t('sourceOcrLayoutPickConfirm')}
            disabled={!selectedId}
            onPress={() => {
              if (!selectedId) return;
              onPick({ id: selectedId as OcrLayoutPickResult['id'] });
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(theme: AppTheme) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: theme.color.canvas,
      paddingTop: 52,
      paddingHorizontal: 16,
      paddingBottom: 24,
    },
    title: {
      color: theme.color.ink,
      fontSize: 20,
      fontWeight: '700',
      marginBottom: 6,
    },
    hint: {
      color: theme.color.inkMuted,
      fontSize: 14,
      lineHeight: 20,
      marginBottom: 8,
    },
    reason: {
      color: theme.color.primary,
      fontSize: 12,
      marginBottom: 12,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: theme.color.border,
      marginBottom: 8,
      backgroundColor: theme.color.surface,
      gap: 10,
      overflow: 'hidden',
    },
    rowOn: {
      borderColor: theme.color.primary,
      backgroundColor: theme.color.primarySoft,
    },
    radio: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      borderColor: theme.color.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioOn: { borderColor: theme.color.primary },
    radioDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: theme.color.primary,
    },
    rowText: { flex: 1, paddingRight: 8 },
    rowTitle: { fontSize: 16, fontWeight: '600', color: theme.color.ink },
    rowTitleOn: { color: theme.color.primary },
    rowHint: { fontSize: 12, color: theme.color.inkMuted, marginTop: 2 },
    score: { fontSize: 13, fontWeight: '600', color: theme.color.inkMuted },
    actions: { gap: 8, marginTop: 12 },
  });
}
