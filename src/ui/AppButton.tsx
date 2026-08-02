import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type ViewStyle,
  type TextStyle,
} from 'react-native';

import { useTheme } from '@/src/ui/useTheme';

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
  const theme = useTheme();
  const off = disabled || busy;
  const variantBox: Record<AppButtonVariant, ViewStyle> = {
    primary: { backgroundColor: theme.color.primary },
    secondary: {
      backgroundColor: theme.color.surface,
      borderWidth: 1,
      borderColor: theme.color.borderStrong,
    },
    soft: { backgroundColor: theme.color.primarySoft },
    ghost: { backgroundColor: 'transparent' },
    danger: { backgroundColor: theme.color.danger },
  };
  const variantLabel: Record<AppButtonVariant, TextStyle> = {
    primary: { color: theme.color.primaryText },
    secondary: { color: theme.color.ink },
    soft: { color: theme.color.primary },
    ghost: { color: theme.color.primary },
    danger: { color: '#fff' },
  };
  const ripple =
    variant === 'primary' || variant === 'danger'
      ? 'rgba(255,255,255,0.28)'
      : theme.color.primarySoft;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={off}
      onPress={onPress}
      android_ripple={off ? undefined : { color: ripple, borderless: false }}
      style={({ pressed }) => [
        {
          minHeight: compact ? 40 : 48,
          paddingHorizontal: compact ? theme.space.md : theme.space.lg,
          paddingVertical: compact ? theme.space.sm : theme.space.md,
          borderRadius: theme.radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        },
        variantBox[variant],
        pressed && !off && {
          opacity: variant === 'ghost' || variant === 'secondary' ? 0.65 : 0.82,
          backgroundColor:
            variant === 'primary'
              ? theme.color.primaryPressed
              : variant === 'ghost'
                ? theme.color.primarySoft
                : variantBox[variant].backgroundColor,
          transform: [{ scale: 0.985 }],
        },
        off && styles.disabled,
        style,
      ]}>
      {busy ? (
        <ActivityIndicator
          color={variant === 'primary' || variant === 'danger' ? '#fff' : theme.color.primary}
        />
      ) : (
        <Text
          style={[
            {
              fontSize: compact ? 13 : 15,
              fontWeight: '600',
              letterSpacing: 0.1,
            },
            variantLabel[variant],
            textStyle,
          ]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  disabled: { opacity: 0.45 },
});
