/**
 * When name/date region is unclear: tap on photo or rephotograph that band.
 * One path — does not switch layouts.
 */
import { useMemo, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import { t } from '@/src/i18n';
import { AppButton } from '@/src/ui/AppButton';
import { useTheme } from '@/src/ui/useTheme';
import type { AppTheme } from '@/src/ui/theme';

export type OcrRegionKind = 'name-column' | 'day-header' | 'cell-area';

export type OcrRegionAssistRequest = {
  imageUri: string;
  reason: 'no-names' | 'matrix-failed' | 'weak-grid';
};

export type OcrRegionAssistResult =
  | { action: 'tap'; kind: OcrRegionKind; xNorm: number; yNorm: number }
  | { action: 'rephoto'; kind: OcrRegionKind }
  | { action: 'skip' };

type Props = {
  visible: boolean;
  imageUri: string;
  reason: OcrRegionAssistRequest['reason'];
  onDone: (result: OcrRegionAssistResult) => void;
};

export function OcrRegionAssistModal({ visible, imageUri, reason, onDone }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { width: winW } = useWindowDimensions();
  const [tapKind, setTapKind] = useState<OcrRegionKind | null>(null);
  const imgW = Math.min(winW - 32, 420);
  const imgH = Math.round(imgW * 0.72);

  const reasonText =
    reason === 'no-names'
      ? t('sourceOcrRegionReasonNoNames')
      : reason === 'weak-grid'
        ? t('sourceOcrRegionReasonWeak')
        : t('sourceOcrRegionReasonFailed');

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => onDone({ action: 'skip' })}>
      <View style={styles.root}>
        <Text style={styles.title}>{t('sourceOcrRegionTitle')}</Text>
        <Text style={styles.hint}>{reasonText}</Text>
        <Text style={styles.hint}>{t('sourceOcrRegionHint')}</Text>

        <Pressable
          disabled={!tapKind}
          onPress={(e) => {
            if (!tapKind) return;
            const { locationX, locationY } = e.nativeEvent;
            onDone({
              action: 'tap',
              kind: tapKind,
              xNorm: Math.min(1, Math.max(0, locationX / imgW)),
              yNorm: Math.min(1, Math.max(0, locationY / imgH)),
            });
          }}
          style={[styles.photo, { width: imgW, height: imgH }]}
        >
          <Image
            source={{ uri: imageUri }}
            style={{ width: imgW, height: imgH }}
            resizeMode="contain"
          />
          {tapKind ? (
            <Text style={styles.tapBanner}>{t('sourceOcrRegionTapNow')}</Text>
          ) : null}
        </Pressable>

        <Text style={styles.section}>{t('sourceOcrRegionTapLabel')}</Text>
        <View style={styles.row}>
          {(
            [
              ['name-column', 'sourceOcrRegionNameCol'],
              ['day-header', 'sourceOcrRegionDayHeader'],
              ['cell-area', 'sourceOcrRegionCells'],
            ] as const
          ).map(([kind, key]) => (
            <Pressable
              key={kind}
              onPress={() => setTapKind(kind)}
              style={[styles.chip, tapKind === kind && styles.chipOn]}
            >
              <Text style={[styles.chipText, tapKind === kind && styles.chipTextOn]}>
                {t(key)}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.section}>{t('sourceOcrRegionRephotoLabel')}</Text>
        <View style={styles.row}>
          <AppButton
            title={t('sourceOcrRegionRephotoName')}
            compact
            variant="ghost"
            onPress={() => onDone({ action: 'rephoto', kind: 'name-column' })}
          />
          <AppButton
            title={t('sourceOcrRegionRephotoHeader')}
            compact
            variant="ghost"
            onPress={() => onDone({ action: 'rephoto', kind: 'day-header' })}
          />
        </View>

        <View style={styles.actions}>
          <AppButton
            title={t('sourceOcrRegionSkip')}
            variant="ghost"
            onPress={() => onDone({ action: 'skip' })}
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
    title: { color: theme.color.ink, fontSize: 20, fontWeight: '700', marginBottom: 6 },
    hint: { color: theme.color.inkMuted, fontSize: 14, lineHeight: 20, marginBottom: 6 },
    photo: {
      alignSelf: 'center',
      marginVertical: 12,
      borderRadius: 8,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surfaceMuted,
    },
    tapBanner: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.55)',
      color: '#fff',
      textAlign: 'center',
      paddingVertical: 6,
      fontSize: 13,
      fontWeight: '600',
    },
    section: {
      color: theme.color.inkSecondary,
      fontSize: 13,
      fontWeight: '600',
      marginTop: 10,
      marginBottom: 6,
    },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
    },
    chipOn: { borderColor: theme.color.primary, backgroundColor: theme.color.primarySoft },
    chipText: { color: theme.color.ink, fontSize: 13 },
    chipTextOn: { color: theme.color.primary, fontWeight: '600' },
    actions: { marginTop: 20 },
  });
}
