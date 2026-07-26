/**
 * Manual crop after scan/photo — mark your roster row before OCR.
 * Normalized rect (0–1) mapped through contain-fit layout.
 */
import { useEffect, useMemo, useState } from 'react';
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
import {
  cropImageNormalized,
  defaultRowCrop,
  sanitizeNormalizedCrop,
  type NormalizedCropRect,
} from '@/src/sources/ocr/crop';
import { AppButton } from '@/src/ui/AppButton';
import { useTheme } from '@/src/ui/useTheme';

type Props = {
  visible: boolean;
  uri: string | null;
  onCancel: () => void;
  /** Cropped uri, or original if user skips. */
  onDone: (uri: string) => void;
};

type LayoutBox = { x: number; y: number; width: number; height: number };

function containBox(
  containerW: number,
  containerH: number,
  imageW: number,
  imageH: number
): LayoutBox {
  if (containerW <= 0 || containerH <= 0 || imageW <= 0 || imageH <= 0) {
    return { x: 0, y: 0, width: containerW, height: containerH };
  }
  const scale = Math.min(containerW / imageW, containerH / imageH);
  const width = imageW * scale;
  const height = imageH * scale;
  return {
    x: (containerW - width) / 2,
    y: (containerH - height) / 2,
    width,
    height,
  };
}

export function OcrCropModal({ visible, uri, onCancel, onDone }: Props) {
  const theme = useTheme();
  useWindowDimensions(); // re-render on rotate
  const [imgSize, setImgSize] = useState({ width: 0, height: 0 });
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const [rect, setRect] = useState<NormalizedCropRect>(() => defaultRowCrop());
  const [busy, setBusy] = useState(false);
  const [cropError, setCropError] = useState<string | null>(null);
  const [drag, setDrag] = useState<null | {
    edge: 'top' | 'bottom' | 'move';
    startY: number;
    startRect: NormalizedCropRect;
  }>(null);

  useEffect(() => {
    if (visible && uri) {
      setRect(defaultRowCrop());
      setCropError(null);
      setDrag(null);
    }
  }, [visible, uri]);

  const fitted = useMemo(
    () => containBox(stage.width, stage.height, imgSize.width, imgSize.height),
    [stage, imgSize]
  );

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: {
          flex: 1,
          backgroundColor: '#0b1220',
          paddingTop: 48,
          paddingBottom: 24,
          paddingHorizontal: 12,
        },
        title: {
          color: '#f8fafc',
          fontSize: 18,
          fontWeight: '700',
          marginBottom: 4,
        },
        hint: {
          color: '#94a3b8',
          fontSize: 13,
          marginBottom: 12,
          lineHeight: 18,
        },
        stage: {
          flex: 1,
          borderRadius: 12,
          overflow: 'hidden',
          backgroundColor: '#020617',
        },
        image: {
          ...StyleSheet.absoluteFill,
        },
        dim: {
          position: 'absolute',
          backgroundColor: 'rgba(2, 6, 23, 0.55)',
        },
        window: {
          position: 'absolute',
          borderWidth: 2,
          borderColor: theme.color.primary,
          backgroundColor: 'transparent',
        },
        handle: {
          position: 'absolute',
          left: 16,
          right: 16,
          height: 28,
          marginTop: -14,
          borderRadius: 8,
          backgroundColor: theme.color.primary,
          opacity: 0.9,
        },
        actions: {
          gap: 8,
          marginTop: 14,
        },
        skip: {
          alignSelf: 'center',
          paddingVertical: 8,
        },
        skipText: {
          color: '#94a3b8',
          fontSize: 14,
        },
      }),
    [theme]
  );

  const windowPx = useMemo(() => {
    const r = sanitizeNormalizedCrop(rect);
    return {
      left: fitted.x + r.x * fitted.width,
      top: fitted.y + r.y * fitted.height,
      width: r.width * fitted.width,
      height: r.height * fitted.height,
    };
  }, [rect, fitted]);

  const onConfirmCrop = async () => {
    if (!uri || busy) return;
    setBusy(true);
    setCropError(null);
    try {
      const cropped = await cropImageNormalized(uri, rect);
      onDone(cropped);
    } catch (e) {
      setCropError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!uri) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <View style={styles.root}>
        <Text style={styles.title}>{t('sourceOcrCropTitle')}</Text>
        <Text style={styles.hint}>{t('sourceOcrCropHint')}</Text>
        <View
          style={styles.stage}
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            setStage({ width, height });
          }}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={(e) => {
            const y = e.nativeEvent.locationY;
            const topEdge = windowPx.top;
            const bottomEdge = windowPx.top + windowPx.height;
            if (Math.abs(y - topEdge) < 28) {
              setDrag({ edge: 'top', startY: y, startRect: rect });
            } else if (Math.abs(y - bottomEdge) < 28) {
              setDrag({ edge: 'bottom', startY: y, startRect: rect });
            } else if (y >= topEdge && y <= bottomEdge) {
              setDrag({ edge: 'move', startY: y, startRect: rect });
            } else {
              setDrag(null);
            }
          }}
          onResponderMove={(e) => {
            if (!drag || fitted.height <= 0) return;
            const y = e.nativeEvent.locationY;
            const dyNorm = (y - drag.startY) / fitted.height;
            if (drag.edge === 'move') {
              setRect(
                sanitizeNormalizedCrop({
                  ...drag.startRect,
                  y: drag.startRect.y + dyNorm,
                })
              );
              return;
            }
            if (drag.edge === 'top') {
              const nextY = drag.startRect.y + dyNorm;
              const nextH = drag.startRect.height - dyNorm;
              setRect(sanitizeNormalizedCrop({ ...drag.startRect, y: nextY, height: nextH }));
              return;
            }
            setRect(
              sanitizeNormalizedCrop({
                ...drag.startRect,
                height: drag.startRect.height + dyNorm,
              })
            );
          }}
          onResponderRelease={() => setDrag(null)}
        >
          <Image
            source={{ uri }}
            style={styles.image}
            resizeMode="contain"
            onLoad={(e) => {
              const { width, height } = e.nativeEvent.source;
              if (width && height) setImgSize({ width, height });
            }}
          />
          {/* dim regions */}
          <View style={[styles.dim, { left: 0, top: 0, right: 0, height: windowPx.top }]} />
          <View
            style={[
              styles.dim,
              {
                left: 0,
                top: windowPx.top + windowPx.height,
                right: 0,
                bottom: 0,
              },
            ]}
          />
          <View
            style={[
              styles.dim,
              {
                left: 0,
                top: windowPx.top,
                width: windowPx.left,
                height: windowPx.height,
              },
            ]}
          />
          <View
            style={[
              styles.dim,
              {
                left: windowPx.left + windowPx.width,
                top: windowPx.top,
                right: 0,
                height: windowPx.height,
              },
            ]}
          />
          <View
            pointerEvents="none"
            style={[
              styles.window,
              {
                left: windowPx.left,
                top: windowPx.top,
                width: windowPx.width,
                height: windowPx.height,
              },
            ]}
          />
          <View
            pointerEvents="none"
            style={[styles.handle, { top: windowPx.top }]}
          />
          <View
            pointerEvents="none"
            style={[styles.handle, { top: windowPx.top + windowPx.height }]}
          />
        </View>
        <View style={styles.actions}>
          {cropError ? <Text style={styles.hint}>{cropError}</Text> : null}
          <AppButton
            title={t('sourceOcrCropConfirm')}
            onPress={() => void onConfirmCrop()}
            busy={busy}
            disabled={busy}
          />
          <AppButton
            title={t('sourceOcrCropCancel')}
            variant="ghost"
            onPress={onCancel}
            disabled={busy}
          />
          <Pressable
            style={styles.skip}
            disabled={busy}
            onPress={() => {
              if (uri) onDone(uri);
            }}
          >
            <Text style={styles.skipText}>{t('sourceOcrCropSkip')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
