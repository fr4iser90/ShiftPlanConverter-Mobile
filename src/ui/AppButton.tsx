import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type ViewStyle,
  type TextStyle,
} from 'react-native';

import { theme } from './theme';

export type AppButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft';

type Props = {
  title: string;
  onPress?: () => void;
  disabled?: boolean;
  busy?: boolean;
  variant?: AppButtonVariant;
  compact?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
};

export function AppButton({
  title,
  onPress,
  disabled,
  busy,
  variant = 'primary',
  compact,
  style,
  textStyle,
}: Props) {
  const off = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        compact && styles.compact,
        variantStyles[variant],
        pressed && !off && styles.pressed,
        off && styles.disabled,
        style,
      ]}>
      {busy ? (
        <ActivityIndicator color={variant === 'primary' || variant === 'danger' ? '#fff' : theme.color.primary} />
      ) : (
        <Text
          style={[
            styles.label,
            compact && styles.labelCompact,
            labelStyles[variant],
            off && styles.labelDisabled,
            textStyle,
          ]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.md,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compact: {
    minHeight: 40,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.sm,
  },
  pressed: { opacity: 0.88, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.45 },
  label: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  labelCompact: { fontSize: 13 },
  labelDisabled: {},
});

const variantStyles = StyleSheet.create({
  primary: { backgroundColor: theme.color.primary },
  secondary: {
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.borderStrong,
  },
  soft: { backgroundColor: theme.color.primarySoft },
  ghost: { backgroundColor: 'transparent' },
  danger: { backgroundColor: theme.color.danger },
});

const labelStyles = StyleSheet.create({
  primary: { color: theme.color.primaryText },
  secondary: { color: theme.color.ink },
  soft: { color: theme.color.primary },
  ghost: { color: theme.color.primary },
  danger: { color: '#fff' },
});
