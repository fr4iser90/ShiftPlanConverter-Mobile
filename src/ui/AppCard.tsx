import { StyleSheet, Text, View, type ViewProps } from 'react-native';
import type { ReactNode } from 'react';

import { useTheme } from '@/src/ui/useTheme';

export function AppCard({
  children,
  style,
  accent,
  ...rest
}: ViewProps & { accent?: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: accent ? theme.color.primaryTint : theme.color.surface,
          borderRadius: theme.radius.md,
          borderWidth: 1,
          borderColor: accent ? theme.color.cardAccentBorder : theme.color.border,
          padding: theme.space.lg,
          gap: theme.space.sm,
          ...theme.shadow.card,
        },
        style,
      ]}
      {...rest}>
      {children}
    </View>
  );
}

export function ScreenTitle({ children }: { children: string }) {
  const theme = useTheme();
  return (
    <Text style={{ ...theme.type.title, color: theme.color.ink }}>{children}</Text>
  );
}

export function SectionTitle({ children }: { children: string }) {
  const theme = useTheme();
  return <Text style={{ ...theme.type.h2, color: theme.color.ink }}>{children}</Text>;
}

export function Meta({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <Text style={{ ...theme.type.meta, color: theme.color.inkMuted, lineHeight: 18 }}>
      {children}
    </Text>
  );
}
