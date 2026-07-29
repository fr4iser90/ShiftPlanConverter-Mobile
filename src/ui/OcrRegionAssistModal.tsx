/**
 * When matrix/names fail: rotate photo, paint name / day / own-row regions, then Fertig.
 * One assist path — does not switch layouts.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import { t } from '@/src/i18n';
import { rotateImageDegrees } from '@/src/sources/ocr/deskew';
import { AppButton } from '@/src/ui/AppButton';
import { useTheme } from '@/src/ui/useTheme';
import type { AppTheme } from '@/src/ui/theme';

export type OcrRegionKind = 'name-column' | 'day-header' | 'own-row';

export type OcrNormBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type OcrPaintedRegion = {
  kind: OcrRegionKind;
  box: OcrNormBox;
};

export type OcrRegionAssistRequest = {
  imageUri: string;
  reason: 'no-names' | 'matrix-failed' | 'weak-grid';
};

export type OcrRegionAssistResult =
  | {
      action: 'painted';
      imageUri: string;
      regions: OcrPaintedRegion[];
      /** Required when only own-row is painted (no day headers). */
      monthYear?: { year: number; month: number };
    }
  | { action: 'rephoto'; kind: OcrRegionKind }
  | { action: 'skip' }
  /** @deprecated kept for type compatibility — modal no longer emits taps */
  | { action: 'tap'; kind: OcrRegionKind; xNorm: number; yNorm: number };

const PAINT_COLORS: Record<OcrRegionKind, string> = {
  'name-column': 'rgba(40, 180, 160, 0.45)',
  'day-header': 'rgba(20, 120, 220, 0.45)',
  'own-row': 'rgba(220, 120, 40, 0.45)',
};

const PAINT_BORDER: Record<OcrRegionKind, string> = {
  'name-column': '#28b4a0',
  'day-header': '#1478dc',
  'own-row': '#dc7828',
};

/** Max normalized size so a long drag does not swallow the whole photo. */
const PAINT_MAX: Record<OcrRegionKind, { w: number; h: number }> = {
  'name-column': { w: 0.28, h: 0.92 },
  'day-header': { w: 0.98, h: 0.12 },
  'own-row': { w: 0.98, h: 0.1 },
};

type Props = {
  visible: boolean;
  imageUri: string;
  reason: OcrRegionAssistRequest['reason'];
  onDone: (result: OcrRegionAssistResult) => void;
};

type ContentRect = { x: number; y: number; w: number; h: number };

function containRect(viewW: number, viewH: number, imgW: number, imgH: number): ContentRect {
  if (imgW <= 0 || imgH <= 0) return { x: 0, y: 0, w: viewW, h: viewH };
  const viewAspect = viewW / viewH;
  const imgAspect = imgW / imgH;
  if (imgAspect > viewAspect) {
    const h = viewW / imgAspect;
    return { x: 0, y: (viewH - h) / 2, w: viewW, h };
  }
  const w = viewH * imgAspect;
  return { x: (viewW - w) / 2, y: 0, w, h: viewH };
}

function clampToContent(x: number, y: number, c: ContentRect): { x: number; y: number } {
  return {
    x: Math.max(c.x, Math.min(c.x + c.w, x)),
    y: Math.max(c.y, Math.min(c.y + c.h, y)),
  };
}

/**
 * Build a normalized paint box from view-space drag, clamped to the letterboxed
 * image and capped per region kind (anchor stays at drag start).
 */
export function paintDragToNormBox(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  c: ContentRect,
  kind: OcrRegionKind
): OcrNormBox | null {
  if (c.w < 1 || c.h < 1) return null;
  const a = clampToContent(x0, y0, c);
  const b = clampToContent(x1, y1, c);
  let left = Math.min(a.x, b.x);
  let right = Math.max(a.x, b.x);
  let top = Math.min(a.y, b.y);
  let bot = Math.max(a.y, b.y);

  const max = PAINT_MAX[kind];
  const maxW = max.w * c.w;
  const maxH = max.h * c.h;
  // Keep the start corner; shrink the expanding edge when over max.
  if (right - left > maxW) {
    if (b.x >= a.x) right = left + maxW;
    else left = right - maxW;
  }
  if (bot - top > maxH) {
    if (b.y >= a.y) bot = top + maxH;
    else top = bot - maxH;
  }

  left = Math.max(c.x, left);
  right = Math.min(c.x + c.w, right);
  top = Math.max(c.y, top);
  bot = Math.min(c.y + c.h, bot);

  if (right - left < 8 || bot - top < 6) return null;
  return {
    x: (left - c.x) / c.w,
    y: (top - c.y) / c.h,
    width: (right - left) / c.w,
    height: (bot - top) / c.h,
  };
}

function draftViewBox(
  draft: { x0: number; y0: number; x1: number; y1: number },
  c: ContentRect,
  kind: OcrRegionKind
): { left: number; top: number; width: number; height: number } | null {
  const box = paintDragToNormBox(draft.x0, draft.y0, draft.x1, draft.y1, c, kind);
  if (!box) return null;
  return {
    left: c.x + box.x * c.w,
    top: c.y + box.y * c.h,
    width: box.width * c.w,
    height: box.height * c.h,
  };
}

export function OcrRegionAssistModal({ visible, imageUri, reason, onDone }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { width: winW } = useWindowDimensions();
  const imgW = Math.min(winW - 32, 420);
  const imgH = Math.round(imgW * 0.78);

  const [displayUri, setDisplayUri] = useState(imageUri);
  const [natW, setNatW] = useState(0);
  const [natH, setNatH] = useState(0);
  const [paintKind, setPaintKind] = useState<OcrRegionKind>('name-column');
  const [regions, setRegions] = useState<Partial<Record<OcrRegionKind, OcrNormBox>>>({});
  const [draft, setDraft] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(
    null
  );
  const [busyRotate, setBusyRotate] = useState(false);
  const [askMonth, setAskMonth] = useState(false);
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [error, setError] = useState<string | null>(null);

  const content = useMemo(
    () => containRect(imgW, imgH, natW || imgW, natH || imgH),
    [imgW, imgH, natW, natH]
  );
  const contentRef = useRef(content);
  contentRef.current = content;
  const paintKindRef = useRef(paintKind);
  paintKindRef.current = paintKind;

  useEffect(() => {
    if (!visible) return;
    setDisplayUri(imageUri);
    setRegions({});
    setDraft(null);
    setAskMonth(false);
    setError(null);
    setPaintKind('name-column');
  }, [visible, imageUri]);

  useEffect(() => {
    if (!displayUri) return;
    Image.getSize(
      displayUri,
      (w, h) => {
        setNatW(w);
        setNatH(h);
      },
      () => {
        setNatW(imgW);
        setNatH(imgH);
      }
    );
  }, [displayUri, imgW, imgH]);

  const toNormBox = (x0: number, y0: number, x1: number, y1: number): OcrNormBox | null =>
    paintDragToNormBox(x0, y0, x1, y1, contentRef.current, paintKindRef.current);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          const c = contentRef.current;
          const p = clampToContent(e.nativeEvent.locationX, e.nativeEvent.locationY, c);
          setDraft({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
          setError(null);
        },
        onPanResponderMove: (e) => {
          const c = contentRef.current;
          const p = clampToContent(e.nativeEvent.locationX, e.nativeEvent.locationY, c);
          setDraft((d) => (d ? { ...d, x1: p.x, y1: p.y } : d));
        },
        onPanResponderRelease: (e) => {
          const c = contentRef.current;
          const p = clampToContent(e.nativeEvent.locationX, e.nativeEvent.locationY, c);
          setDraft((d) => {
            if (!d) return null;
            const box = toNormBox(d.x0, d.y0, p.x, p.y);
            if (box) {
              const kind = paintKindRef.current;
              setRegions((prev) => ({ ...prev, [kind]: box }));
            }
            return null;
          });
        },
      }),
    []
  );

  const reasonText =
    reason === 'no-names'
      ? t('sourceOcrRegionReasonNoNames')
      : reason === 'weak-grid'
        ? t('sourceOcrRegionReasonWeak')
        : t('sourceOcrRegionReasonFailed');

  const rotate = async (deg: number) => {
    if (busyRotate) return;
    setBusyRotate(true);
    setError(null);
    try {
      const next = await rotateImageDegrees(displayUri, deg);
      if (next) {
        setDisplayUri(next);
        setRegions({});
        setDraft(null);
      }
    } finally {
      setBusyRotate(false);
    }
  };

  const paintedList = (): OcrPaintedRegion[] =>
    (Object.entries(regions) as [OcrRegionKind, OcrNormBox][])
      .filter(([, box]) => box)
      .map(([kind, box]) => ({ kind, box }));

  const onFertig = () => {
    const list = paintedList();
    const hasName = !!regions['name-column'];
    const hasHeader = !!regions['day-header'];
    const hasOwn = !!regions['own-row'];

    if (!list.length) {
      setError(t('sourceOcrRegionPaintNeedOne'));
      return;
    }

    if (hasName && hasHeader) {
      onDone({ action: 'painted', imageUri: displayUri, regions: list });
      return;
    }

    if (hasOwn && !hasHeader) {
      if (!askMonth) {
        setAskMonth(true);
        setError(t('sourceOcrRegionNeedMonth'));
        return;
      }
      onDone({
        action: 'painted',
        imageUri: displayUri,
        regions: list,
        monthYear: { year, month },
      });
      return;
    }

    // Name or header alone — still useful bias
    onDone({ action: 'painted', imageUri: displayUri, regions: list });
  };

  const boxToStyle = (box: OcrNormBox) => {
    const c = content;
    return {
      position: 'absolute' as const,
      left: c.x + box.x * c.w,
      top: c.y + box.y * c.h,
      width: box.width * c.w,
      height: box.height * c.h,
    };
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => onDone({ action: 'skip' })}>
      <ScrollView
        contentContainerStyle={styles.root}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={!draft}
      >
        <Text style={styles.title}>{t('sourceOcrRegionTitle')}</Text>
        <Text style={styles.hint}>{reasonText}</Text>
        <Text style={styles.hint}>{t('sourceOcrRegionHint')}</Text>

        <View style={styles.rotateRow}>
          <AppButton
            title={t('sourceOcrRegionRotateCcw')}
            compact
            variant="ghost"
            disabled={busyRotate}
            onPress={() => void rotate(-90)}
          />
          <AppButton
            title={t('sourceOcrRegionRotateCw')}
            compact
            variant="ghost"
            disabled={busyRotate}
            onPress={() => void rotate(90)}
          />
        </View>

        <View style={[styles.photo, { width: imgW, height: imgH }]} {...pan.panHandlers}>
          <View pointerEvents="none" style={{ width: imgW, height: imgH }}>
            <Image
              source={{ uri: displayUri }}
              style={{ width: imgW, height: imgH }}
              resizeMode="contain"
            />
          </View>
          {(Object.entries(regions) as [OcrRegionKind, OcrNormBox][]).map(([kind, box]) => (
            <View
              key={kind}
              pointerEvents="none"
              style={[
                boxToStyle(box),
                {
                  backgroundColor: PAINT_COLORS[kind],
                  borderWidth: 2,
                  borderColor: PAINT_BORDER[kind],
                },
              ]}
            />
          ))}
          {draft ? (
            (() => {
              const vb = draftViewBox(draft, content, paintKind);
              if (!vb) return null;
              return (
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    left: vb.left,
                    top: vb.top,
                    width: vb.width,
                    height: vb.height,
                    borderWidth: 1,
                    borderColor: PAINT_BORDER[paintKind],
                    backgroundColor: PAINT_COLORS[paintKind],
                  }}
                />
              );
            })()
          ) : null}
        </View>

        <Text style={styles.section}>{t('sourceOcrRegionPaintLabel')}</Text>
        <View style={styles.row}>
          {(
            [
              ['name-column', 'sourceOcrRegionNameCol'],
              ['day-header', 'sourceOcrRegionDayHeader'],
              ['own-row', 'sourceOcrRegionOwnRow'],
            ] as const
          ).map(([kind, key]) => (
            <Pressable
              key={kind}
              onPress={() => {
                setPaintKind(kind);
                setError(null);
              }}
              style={[
                styles.chip,
                { borderColor: PAINT_BORDER[kind] },
                paintKind === kind && { backgroundColor: PAINT_COLORS[kind] },
                regions[kind] && styles.chipDone,
              ]}
            >
              <Text style={styles.chipText}>
                {t(key)}
                {regions[kind] ? ' ✓' : ''}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.hint}>{t('sourceOcrRegionPaintHint')}</Text>

        {askMonth ? (
          <View style={styles.monthBox}>
            <Text style={styles.section}>{t('sourceOcrRegionMonthLabel')}</Text>
            <View style={styles.row}>
              <AppButton
                title="−"
                compact
                variant="ghost"
                onPress={() =>
                  setMonth((m) => {
                    if (m <= 1) {
                      setYear((y) => y - 1);
                      return 12;
                    }
                    return m - 1;
                  })
                }
              />
              <Text style={styles.monthVal}>
                {month}/{year}
              </Text>
              <AppButton
                title="+"
                compact
                variant="ghost"
                onPress={() =>
                  setMonth((m) => {
                    if (m >= 12) {
                      setYear((y) => y + 1);
                      return 1;
                    }
                    return m + 1;
                  })
                }
              />
              <AppButton
                title="−Y"
                compact
                variant="ghost"
                onPress={() => setYear((y) => y - 1)}
              />
              <AppButton
                title="+Y"
                compact
                variant="ghost"
                onPress={() => setYear((y) => y + 1)}
              />
            </View>
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.actions}>
          <AppButton title={t('sourceOcrRegionDone')} onPress={onFertig} />
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
      </ScrollView>
    </Modal>
  );
}

function makeStyles(theme: AppTheme) {
  return StyleSheet.create({
    root: {
      flexGrow: 1,
      backgroundColor: theme.color.canvas,
      paddingTop: 52,
      paddingHorizontal: 16,
      paddingBottom: 32,
    },
    title: { color: theme.color.ink, fontSize: 20, fontWeight: '700', marginBottom: 6 },
    hint: { color: theme.color.inkMuted, fontSize: 14, lineHeight: 20, marginBottom: 6 },
    error: { color: theme.color.danger, fontSize: 13, marginTop: 8 },
    rotateRow: { flexDirection: 'row', gap: 8, marginTop: 4, marginBottom: 4 },
    photo: {
      alignSelf: 'center',
      marginVertical: 10,
      borderRadius: 8,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surfaceMuted,
    },
    section: {
      color: theme.color.inkSecondary,
      fontSize: 13,
      fontWeight: '600',
      marginTop: 10,
      marginBottom: 6,
    },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 2,
      backgroundColor: theme.color.surface,
    },
    chipDone: { opacity: 1 },
    chipText: { color: theme.color.ink, fontSize: 13, fontWeight: '600' },
    monthBox: {
      marginTop: 8,
      padding: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
    },
    monthVal: {
      color: theme.color.ink,
      fontSize: 16,
      fontWeight: '700',
      minWidth: 72,
      textAlign: 'center',
    },
    actions: { marginTop: 16 },
  });
}
