/**
 * Abrufen review: photo + OCR matrix so the user can compare before any calendar step.
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
import type { MonthMatrixGrid } from '@/src/sources/ocr/monthMatrix';
import { OcrMonthMatrixScrollTable } from '@/src/ui/OcrMonthMatrixScrollTable';
import { useTheme } from '@/src/ui/useTheme';
import type { AppTheme } from '@/src/ui/theme';

type Props = {
  imageUri: string | null;
  grid: MonthMatrixGrid | null;
  matchedName?: string | null;
  title?: string;
};

export function OcrCompareReview({ imageUri, grid, matchedName, title }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { width: winW } = useWindowDimensions();
  const [fullOpen, setFullOpen] = useState(false);

  if (!imageUri && !grid) return null;

  const thumbW = Math.min(winW - 48, 420);

  return (
    <View style={styles.wrap}>
      <Text style={styles.compareTitle}>{t('sourceOcrCompareTitle')}</Text>
      <Text style={styles.compareHint}>{t('sourceOcrCompareHint')}</Text>

      {grid ? (
        <OcrMonthMatrixScrollTable grid={grid} matchedName={matchedName} title={title} />
      ) : null}

      {imageUri ? (
        <Pressable onPress={() => setFullOpen(true)} style={styles.photoFrame}>
          <Image
            source={{ uri: imageUri }}
            style={{ width: thumbW, height: Math.round(thumbW * 0.72) }}
            resizeMode="contain"
            accessibilityLabel={t('sourceOcrComparePhotoA11y')}
          />
          <Text style={styles.tapHint}>{t('sourceOcrCompareTapFull')}</Text>
        </Pressable>
      ) : null}

      <Modal visible={fullOpen} animationType="fade" onRequestClose={() => setFullOpen(false)}>
        <View style={styles.fullRoot}>
          <Pressable style={styles.fullClose} onPress={() => setFullOpen(false)}>
            <Text style={styles.fullCloseText}>{t('sourceOcrCompareClose')}</Text>
          </Pressable>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.fullImage} resizeMode="contain" />
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

function makeStyles(theme: AppTheme) {
  return StyleSheet.create({
    wrap: { gap: 10, marginTop: 4 },
    compareTitle: {
      color: theme.color.ink,
      fontSize: 15,
      fontWeight: '700',
    },
    compareHint: {
      color: theme.color.inkMuted,
      fontSize: 13,
      lineHeight: 18,
    },
    photoFrame: {
      borderWidth: 1,
      borderColor: theme.color.borderStrong,
      borderRadius: theme.radius.sm,
      overflow: 'hidden',
      backgroundColor: theme.color.surfaceMuted,
      alignItems: 'center',
      paddingBottom: 8,
    },
    tapHint: {
      color: theme.color.primary,
      fontSize: 12,
      fontWeight: '600',
      marginTop: 4,
    },
    fullRoot: {
      flex: 1,
      backgroundColor: '#000',
      paddingTop: 48,
    },
    fullClose: {
      alignSelf: 'flex-end',
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    fullCloseText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
    fullImage: {
      flex: 1,
      width: '100%',
    },
  });
}
