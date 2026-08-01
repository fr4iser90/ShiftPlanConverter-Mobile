/**
 * Photo with translucent OCR region highlights (contain-mapped, snapshot only).
 * All highlights are axis-aligned (skew shown as short segments — no CSS rotate).
 */
import { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import { t } from '@/src/i18n';
import type { OcrHighlightBox, OcrHighlightKind } from '@/src/sources/ocr/highlightOverlay';
import { useTheme } from '@/src/ui/useTheme';
import type { AppTheme } from '@/src/ui/theme';

type Props = {
  imageUri: string;
  highlights: OcrHighlightBox[];
  width: number;
  height: number;
  /** Show color legend under the photo. */
  showLegend?: boolean;
  accessibilityLabel?: string;
  /** Date×duty boards use date/duty legend labels. */
  overlayLayout?: 'date-duty' | null;
};

type NaturalSize = { w: number; h: number };

type ContainRect = { left: number; top: number; width: number; height: number };

function containRect(
  viewW: number,
  viewH: number,
  imgW: number,
  imgH: number
): ContainRect {
  if (!viewW || !viewH || !imgW || !imgH) {
    return { left: 0, top: 0, width: viewW, height: viewH };
  }
  const scale = Math.min(viewW / imgW, viewH / imgH);
  const width = imgW * scale;
  const height = imgH * scale;
  return {
    left: (viewW - width) / 2,
    top: (viewH - height) / 2,
    width,
    height,
  };
}

function strokeFor(kind: OcrHighlightKind, theme: AppTheme): string {
  if (kind === 'own-row') return '#2563EB';
  if (kind === 'day-header') return theme.color.warn;
  return theme.color.primary;
}

function fillFor(kind: OcrHighlightKind, _theme: AppTheme): string {
  if (kind === 'own-row') return 'rgba(37, 99, 235, 0.32)';
  if (kind === 'day-header') return 'rgba(180, 83, 9, 0.22)';
  return 'rgba(15, 118, 110, 0.20)';
}

function legendLabel(
  kind: OcrHighlightKind,
  overlayLayout?: 'date-duty' | null
): string {
  const dateDuty = overlayLayout === 'date-duty';
  if (kind === 'own-row') {
    return dateDuty ? t('sourceOcrHighlightOwnCells') : t('sourceOcrHighlightOwnRow');
  }
  if (kind === 'day-header') {
    return dateDuty ? t('sourceOcrRegionDutyHeader') : t('sourceOcrRegionDayHeader');
  }
  return dateDuty ? t('sourceOcrRegionDateCol') : t('sourceOcrRegionNameCol');
}

export function OcrHighlightLegend({
  kinds,
  overlayLayout = null,
}: {
  kinds: OcrHighlightKind[];
  overlayLayout?: 'date-duty' | null;
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const unique = useMemo(() => {
    const seen = new Set<OcrHighlightKind>();
    const order: OcrHighlightKind[] = [];
    for (const k of kinds) {
      if (seen.has(k)) continue;
      seen.add(k);
      order.push(k);
    }
    return order;
  }, [kinds]);
  if (!unique.length) return null;
  return (
    <View style={styles.legend}>
      {unique.map((kind) => (
        <View key={kind} style={styles.legendItem}>
          <View
            style={[
              styles.swatch,
              { backgroundColor: fillFor(kind, theme), borderColor: strokeFor(kind, theme) },
            ]}
          />
          <Text style={styles.legendText}>{legendLabel(kind, overlayLayout)}</Text>
        </View>
      ))}
    </View>
  );
}

export function OcrPhotoHighlight({
  imageUri,
  highlights,
  width,
  height,
  showLegend = true,
  accessibilityLabel,
  overlayLayout = null,
}: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [natural, setNatural] = useState<NaturalSize | null>(null);
  const [viewSize, setViewSize] = useState({ w: width, h: height });

  useEffect(() => {
    let cancelled = false;
    Image.getSize(
      imageUri,
      (w, h) => {
        if (!cancelled && w > 0 && h > 0) setNatural({ w, h });
      },
      () => {
        if (!cancelled) setNatural(null);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [imageUri]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    if (w > 0 && h > 0) setViewSize({ w, h });
  };

  const mapped = useMemo(() => {
    if (!natural || !highlights.length) return null;
    const rect = containRect(viewSize.w, viewSize.h, natural.w, natural.h);
    return { rect, boxes: highlights };
  }, [natural, highlights, viewSize.w, viewSize.h]);

  const legendKinds = useMemo(() => {
    const seen = new Set<OcrHighlightKind>();
    const order: OcrHighlightKind[] = [];
    for (const h of highlights) {
      if (seen.has(h.kind)) continue;
      seen.add(h.kind);
      order.push(h.kind);
    }
    return order;
  }, [highlights]);

  return (
    <View style={styles.wrap}>
      <View style={[styles.frame, { width, height }]} onLayout={onLayout}>
        <Image
          source={{ uri: imageUri }}
          style={{ width, height }}
          resizeMode="contain"
          accessibilityLabel={accessibilityLabel}
        />
        {mapped
          ? mapped.boxes.map((h, i) => (
              <View
                key={`${h.kind}-${i}`}
                pointerEvents="none"
                style={[
                  styles.box,
                  {
                    left: mapped.rect.left + h.box.x * mapped.rect.width,
                    top: mapped.rect.top + h.box.y * mapped.rect.height,
                    width: Math.max(2, h.box.width * mapped.rect.width),
                    height: Math.max(2, h.box.height * mapped.rect.height),
                    borderColor: strokeFor(h.kind, theme),
                    backgroundColor: fillFor(h.kind, theme),
                    borderWidth: h.kind === 'own-row' && h.box.width < 0.2 ? 2 : 1.5,
                  },
                ]}
              />
            ))
          : null}
      </View>
      {showLegend && legendKinds.length ? (
        <OcrHighlightLegend kinds={legendKinds} overlayLayout={overlayLayout} />
      ) : null}
    </View>
  );
}

function makeStyles(theme: AppTheme) {
  return StyleSheet.create({
    wrap: { gap: 6, alignItems: 'center' },
    frame: {
      position: 'relative',
      overflow: 'hidden',
      backgroundColor: theme.color.surfaceMuted,
    },
    box: {
      position: 'absolute',
      borderRadius: 2,
    },
    legend: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      justifyContent: 'center',
      paddingHorizontal: 4,
    },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    swatch: {
      width: 12,
      height: 12,
      borderRadius: 2,
      borderWidth: 1.5,
    },
    legendText: {
      color: theme.color.inkMuted,
      fontSize: 11,
      fontWeight: '600',
    },
  });
}
