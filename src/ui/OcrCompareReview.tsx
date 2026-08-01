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
import { estimateHighlightOverlays } from '@/src/sources/ocr/highlightOverlay';
import type { MonthMatrixGrid } from '@/src/sources/ocr/layouts/month-matrix';
import type { OcrRegionSnapshot } from '@/src/sources/ocr/regionSnapshots';
import { OcrMonthMatrixScrollTable } from '@/src/ui/OcrMonthMatrixScrollTable';
import { OcrHighlightLegend, OcrPhotoHighlight } from '@/src/ui/OcrPhotoHighlight';
import { OcrZoomablePhoto } from '@/src/ui/OcrZoomablePhoto';
import { useTheme } from '@/src/ui/useTheme';
import type { AppTheme } from '@/src/ui/theme';

type Props = {
  imageUri: string | null;
  grid: MonthMatrixGrid | null;
  matchedName?: string | null;
  title?: string;
  presetMapping?: Record<string, MappingValue> | null;
  colors?: Record<string, string> | null;
  ocrEngineId?: string | null;
  /** Auto region crops after confident grid (on-device). */
  regionSnapshots?: OcrRegionSnapshot[] | null;
  /** OCR page size for mapping row/column boxes onto the photo. */
  pageWidth?: number | null;
  pageHeight?: number | null;
};

const MODES: OcrCellDisplayMode[] = ['codes', 'times', 'both'];

function modeLabel(mode: OcrCellDisplayMode): string {
  if (mode === 'codes') return t('sourceOcrCompareDisplayCodes');
  if (mode === 'times') return t('sourceOcrCompareDisplayTimes');
  return t('sourceOcrCompareDisplayBoth');
}

function snapLabel(
  kind: OcrRegionSnapshot['kind'],
  overlayLayout?: 'date-duty' | null
): string {
  if (kind === 'own-name') return t('sourceOcrCompareSnapOwnName');
  if (kind === 'name-column') {
    return overlayLayout === 'date-duty'
      ? t('sourceOcrRegionDateCol')
      : t('sourceOcrRegionNameCol');
  }
  return overlayLayout === 'date-duty'
    ? t('sourceOcrRegionDutyHeader')
    : t('sourceOcrRegionDayHeader');
}

export function OcrCompareReview({
  imageUri,
  grid,
  matchedName,
  title,
  presetMapping = null,
  colors = null,
  ocrEngineId = null,
  regionSnapshots = null,
  pageWidth = null,
  pageHeight = null,
}: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { width: winW, height: winH } = useWindowDimensions();
  const [fullOpen, setFullOpen] = useState(false);
  const [displayMode, setDisplayMode] = useState<OcrCellDisplayMode>('codes');
  const [onlyMine, setOnlyMine] = useState(true);

  const overlayLayout = grid?.overlayLayout === 'date-duty' ? 'date-duty' : null;

  const highlights = useMemo(() => {
    if (!grid?.ok || !pageWidth || !pageHeight) return [];
    return estimateHighlightOverlays(grid, pageWidth, pageHeight, matchedName);
  }, [grid, pageWidth, pageHeight, matchedName]);

  const snaps = useMemo(
    () =>
      (regionSnapshots || []).filter(
        (s): s is OcrRegionSnapshot & { uri: string } => !!s.uri
      ),
    [regionSnapshots]
  );

  if (!imageUri && !grid) return null;

  const thumbW = Math.min(winW - 48, 420);
  const thumbH = Math.round(thumbW * 0.72);
  const fullW = winW;
  const fullH = Math.max(280, Math.round(winH * 0.62));

  const snapStrip = snaps.length ? (
    <View style={styles.snapRow}>
      <Text style={styles.displayLabel}>{t('sourceOcrCompareSnapshots')}</Text>
      <View style={styles.snapThumbs}>
        {snaps.map((s) => (
          <View key={s.kind} style={styles.snapItem}>
            <Image source={{ uri: s.uri }} style={styles.snapImg} resizeMode="contain" />
            <Text style={styles.snapLabel}>{snapLabel(s.kind, overlayLayout)}</Text>
          </View>
        ))}
      </View>
    </View>
  ) : null;

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
            ocrEngineId={ocrEngineId}
            onlyMine={!!matchedName && onlyMine}
            onOnlyMineChange={setOnlyMine}
          />
        </>
      ) : null}

      {imageUri ? (
        <Pressable onPress={() => setFullOpen(true)} style={styles.photoFrame}>
          <OcrPhotoHighlight
            imageUri={imageUri}
            highlights={highlights}
            width={thumbW}
            height={thumbH}
            showLegend={highlights.length > 0}
            overlayLayout={overlayLayout}
            accessibilityLabel={t('sourceOcrComparePhotoA11y')}
          />
          <Text style={styles.tapHint}>{t('sourceOcrCompareTapFull')}</Text>
        </Pressable>
      ) : null}

      {snapStrip}

      <Modal visible={fullOpen} animationType="fade" onRequestClose={() => setFullOpen(false)}>
        <View style={styles.fullRoot}>
          <Pressable style={styles.fullClose} onPress={() => setFullOpen(false)}>
            <Text style={styles.fullCloseText}>{t('sourceOcrCompareClose')}</Text>
          </Pressable>
          <Text style={styles.fullHint}>{t('sourceOcrCompareZoomHint')}</Text>
          {imageUri ? (
            <OcrZoomablePhoto width={fullW} height={fullH} resetKey={fullOpen}>
              <OcrPhotoHighlight
                imageUri={imageUri}
                highlights={highlights}
                width={fullW}
                height={fullH}
                showLegend={false}
                overlayLayout={overlayLayout}
                accessibilityLabel={t('sourceOcrComparePhotoA11y')}
              />
            </OcrZoomablePhoto>
          ) : null}
          {highlights.length ? (
            <OcrHighlightLegend
              kinds={highlights.map((h) => h.kind)}
              overlayLayout={overlayLayout}
            />
          ) : null}
          <View style={styles.fullSnaps}>{snapStrip}</View>
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
      paddingTop: 8,
    },
    tapHint: {
      color: theme.color.primary,
      fontSize: 12,
      fontWeight: '600',
      marginTop: 4,
    },
    snapRow: { gap: 6 },
    snapThumbs: { flexDirection: 'row', gap: 10 },
    snapItem: { flex: 1, gap: 4 },
    snapImg: {
      width: '100%' as const,
      height: 72,
      borderRadius: theme.radius.sm,
      backgroundColor: theme.color.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.color.border,
    },
    snapLabel: {
      color: theme.color.inkMuted,
      fontSize: 11,
      fontWeight: '600',
    },
    fullRoot: {
      flex: 1,
      backgroundColor: '#0b1220',
      paddingTop: 48,
      paddingBottom: 16,
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
    fullHint: {
      color: 'rgba(255,255,255,0.7)',
      fontSize: 12,
      textAlign: 'center',
      marginBottom: 8,
      paddingHorizontal: 16,
    },
    fullSnaps: {
      paddingHorizontal: 12,
      paddingTop: 8,
    },
  });
}
