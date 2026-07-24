import { type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/src/ui/useTheme';

type Props = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Also pad bottom (default false — tab bar already owns bottom). */
  bottom?: boolean;
};

/** Pads under status bar / notch; canvas color follows system light/dark. */
export function Screen({ children, style, bottom = false }: Props) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: theme.color.canvas,
          paddingTop: Math.max(insets.top, 8),
          paddingBottom: bottom ? insets.bottom : 0,
        },
        style,
      ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
