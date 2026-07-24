import { Pressable, Text, View } from 'react-native';

import type { SettingsStyles } from '@/src/ui/settingsStyles';

export function SettingsMenuRow({
  title,
  meta,
  onPress,
  styles,
  last,
}: {
  title: string;
  meta?: string;
  onPress: () => void;
  styles: SettingsStyles;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.menuRow, last && styles.menuRowLast, pressed && { opacity: 0.7 }]}
      accessibilityRole="button"
    >
      <View style={styles.menuTextWrap}>
        <Text style={styles.menuTitle}>{title}</Text>
        {meta ? <Text style={styles.menuMeta}>{meta}</Text> : null}
      </View>
      <Text style={styles.menuChevron}>›</Text>
    </Pressable>
  );
}
