import { StyleSheet, Text, View, type ViewProps } from 'react-native';
import type { ReactNode } from 'react';

import { theme } from './theme';

export function Screen({ children, style, ...rest }: ViewProps) {
  return (
    <View style={[styles.screen, style]} {...rest}>
      {children}
    </View>
  );
}

export function AppCard({
  children,
  style,
  accent,
  ...rest
}: ViewProps & { accent?: boolean }) {
  return (
    <View style={[styles.card, accent && styles.cardAccent, style]} {...rest}>
      {children}
    </View>
  );
}

export function ScreenTitle({ children }: { children: string }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.h2}>{children}</Text>;
}

export function Meta({ children }: { children: ReactNode }) {
  return <Text style={styles.meta}>{children}</Text>;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.color.canvas,
  },
  card: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.border,
    padding: theme.space.lg,
    gap: theme.space.sm,
    ...theme.shadow.card,
  },
  cardAccent: {
    backgroundColor: theme.color.primaryTint,
    borderColor: '#A7F3D0',
  },
  title: {
    ...theme.type.title,
    color: theme.color.ink,
  },
  h2: {
    ...theme.type.h2,
    color: theme.color.ink,
  },
  meta: {
    ...theme.type.meta,
    color: theme.color.inkMuted,
    lineHeight: 18,
  },
});
