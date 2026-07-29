/**
 * Pinch-zoom + pan like a normal phone photo viewer.
 * Scale around the fingers (focal point); one-finger pan when zoomed.
 */
import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

type Props = {
  width: number;
  height: number;
  children: ReactNode;
  /** Reset transform when URI / open state changes. */
  resetKey?: string | number | boolean;
};

const MIN_SCALE = 1;
const MAX_SCALE = 5;

export function OcrZoomablePhoto({ width, height, children, resetKey }: Props) {
  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);

  // Pinch gesture start snapshot
  const startScale = useSharedValue(1);
  const startTx = useSharedValue(0);
  const startTy = useSharedValue(0);
  const startFocalX = useSharedValue(0);
  const startFocalY = useSharedValue(0);

  // Pan gesture start snapshot
  const panStartTx = useSharedValue(0);
  const panStartTy = useSharedValue(0);

  useEffect(() => {
    scale.value = 1;
    tx.value = 0;
    ty.value = 0;
    // Shared values are stable; reset when the viewer opens / size changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, width, height]);

  const clampScale = (s: number) => {
    'worklet';
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
  };

  const clampPan = (s: number, x: number, y: number) => {
    'worklet';
    // How far the scaled image can slide before edges meet the frame.
    const maxX = Math.max(0, ((s - 1) * width) / 2);
    const maxY = Math.max(0, ((s - 1) * height) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, x)),
      y: Math.min(maxY, Math.max(-maxY, y)),
    };
  };

  const pinch = Gesture.Pinch()
    .onStart((e) => {
      startScale.value = scale.value;
      startTx.value = tx.value;
      startTy.value = ty.value;
      // Focal relative to view center (= default transform origin).
      startFocalX.value = e.focalX - width / 2;
      startFocalY.value = e.focalY - height / 2;
    })
    .onUpdate((e) => {
      const next = clampScale(startScale.value * e.scale);
      const fx = e.focalX - width / 2;
      const fy = e.focalY - height / 2;
      const ratio = next / startScale.value;
      // Keep the content under the fingers; follow focal drift while pinching.
      const nextTx = fx + (startTx.value - startFocalX.value) * ratio;
      const nextTy = fy + (startTy.value - startFocalY.value) * ratio;
      const p = clampPan(next, nextTx, nextTy);
      scale.value = next;
      tx.value = p.x;
      ty.value = p.y;
    })
    .onEnd(() => {
      if (scale.value < 1.02) {
        scale.value = withTiming(1);
        tx.value = withTiming(0);
        ty.value = withTiming(0);
      } else {
        const p = clampPan(scale.value, tx.value, ty.value);
        tx.value = withTiming(p.x);
        ty.value = withTiming(p.y);
      }
    });

  // One finger only — two-finger moves are handled by pinch focal tracking.
  const pan = Gesture.Pan()
    .maxPointers(1)
    .onStart(() => {
      panStartTx.value = tx.value;
      panStartTy.value = ty.value;
    })
    .onUpdate((e) => {
      if (scale.value <= 1.01) return;
      const p = clampPan(
        scale.value,
        panStartTx.value + e.translationX,
        panStartTy.value + e.translationY
      );
      tx.value = p.x;
      ty.value = p.y;
    })
    .onEnd(() => {
      const p = clampPan(scale.value, tx.value, ty.value);
      tx.value = withTiming(p.x);
      ty.value = withTiming(p.y);
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(250)
    .onEnd((e) => {
      if (scale.value > 1.15) {
        scale.value = withTiming(1);
        tx.value = withTiming(0);
        ty.value = withTiming(0);
        return;
      }
      const next = 2.5;
      const fx = e.x - width / 2;
      const fy = e.y - height / 2;
      const ratio = next / scale.value;
      const nextTx = fx + (tx.value - fx) * ratio;
      const nextTy = fy + (ty.value - fy) * ratio;
      const p = clampPan(next, nextTx, nextTy);
      scale.value = withTiming(next);
      tx.value = withTiming(p.x);
      ty.value = withTiming(p.y);
    });

  // Simultaneous — never Exclusive(doubleTap, …): that waits for tap-fail and makes pinch laggy.
  const gesture = Gesture.Simultaneous(pinch, pan, doubleTap);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureHandlerRootView style={styles.root}>
      <View style={[styles.clip, { width, height }]}>
        <GestureDetector gesture={gesture}>
          <Animated.View style={[{ width, height }, animStyle]}>{children}</Animated.View>
        </GestureDetector>
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  clip: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
});
