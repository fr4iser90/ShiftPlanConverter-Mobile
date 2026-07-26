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
import type { MappingValue } from '@/src/convert/types';
import type { OcrCellDisplayMode } from '@/src/sources/ocr/cellDisplay';
import type { MonthMatrixGrid } from '@/src/sources/ocr/monthMatrix';
import { OcrMonthMatrixScrollTable } from '@/src/ui/OcrMonthMatrixScrollTable';
import { useTheme } from '@/src/ui/useTheme';
import type { AppTheme } from '@/src/ui/theme';

type Props = {
  imageUri: string | null;
  grid: MonthMatrixGrid | null;
  matchedName?: string | null;
  title?: string;
  presetMapping?: Record<string, MappingValue> | null;
  colors?: Record<string, string> | null;
};

const MODES: OcrCellDisplayMode[] = ['codes', 'times', 'both'];

function modeLabel(mode: OcrCellDisplayMode): string {
  if (mode === 'codes') return t('sourceOcrCompareDisplayCodes');
  if (mode === 'times') return t('sourceOcrCompareDisplayTimes');
  return t('sourceOcrCompareDisplayBoth');
}

export function OcrCompareReview({
  imageUri,
  grid,
  matchedName,
  title,
  presetMapping = null,
  colors = null,
}: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { width: winW } = useWindowDimensions();
  const [fullOpen, setFullOpen] = useState(false);
  const [displayMode, setDisplayMode] = useState<OcrCellDisplayMode>('codes');

  if (!imageUri && !grid) return null;

  const thumbW = Math.min(winW - 48, 420);

  return (
    <View style={styles.wrap}>
      <Text style={styles.compareTitle}>{t('sourceOcrCompareTitle')}</Text>
      <Text style={styles.compareHint}>{t('sourceOcrCompareHint')}</Text>

      {grid ? (
        <>
          <Text style={styles.displayLabel}>{t('sourceOcrCompareDisplayLabel')}</Text>
          <View style={styles.seg}>
            {MODES.map((mode) => {
              const on = displayMode === mode;
              return (
                <Pressable
                  key={mode}
                  onPress={() => setDisplayMode(mode)}
                  style={[styles.segBtn, on && styles.segBtnOn]}
                >
                  <Text style={[styles.segText, on && styles.segTextOn]}>{modeLabel(mode)}</Text>
                </Pressable>
              );
            })}
          </View>
          <OcrMonthMatrixScrollTable
            grid={grid}
            matchedName={matchedName}
            title={title}
            displayMode={displayMode}
            presetMapping={presetMapping}
            colors={colors}
          />
        </>
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
    displayLabel: {
      color: theme.color.inkSecondary,
      fontSize: 12,
      fontWeight: '600',
    },
    seg: {
      flexDirection: 'row',
      gap: 6,
    },
    segBtn: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: theme.radius.sm,
      borderWidth: 1,
      borderColor: theme.color.borderStrong,
      backgroundColor: theme.color.surfaceMuted,
      alignItems: 'center',
    },
    segBtnOn: {
      backgroundColor: theme.color.primaryTint,
      borderColor: theme.color.primary,
    },
    segText: {
      color: theme.color.inkMuted,
      fontSize: 13,
      fontWeight: '600',
    },
    segTextOn: {
      color: theme.color.primary,
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
