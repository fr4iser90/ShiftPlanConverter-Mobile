/**
 * Export target UI shell — same layout as GoogleSyncCard, disabled until implemented.
 */
import { useMemo } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppButton } from '@/src/ui/AppButton';
import { AppCard, Meta, SectionTitle } from '@/src/ui/AppCard';
import { useTheme } from '@/src/ui/useTheme';
import type { AppTheme } from '@/src/ui/theme';

function makeBlockStyles(theme: AppTheme) {
  return StyleSheet.create({
    block: {
      gap: 8,
      padding: theme.space.md,
      borderRadius: theme.radius.sm,
      borderWidth: 1,
      borderColor: theme.color.borderStrong,
      backgroundColor: theme.color.surfaceMuted,
    },
    title: {
      color: theme.color.ink,
      fontWeight: '700',
      fontSize: 15,
    },
  });
}

type Props = {
  title: string;
  hint: string;
  connectLabel: string;
  syncLabel: string;
  /** Setup uses connect only (matches inline Google block). Default true for Export/Settings. */
  showSync?: boolean;
};

export function ExportTargetSoonCard({
  title,
  hint,
  connectLabel,
  syncLabel,
  showSync = true,
}: Props) {
  return (
    <AppCard>
      <SectionTitle>{title}</SectionTitle>
      <Meta>{hint}</Meta>
      <AppButton title={connectLabel} disabled />
      {showSync ? <AppButton title={syncLabel} variant="soft" disabled /> : null}
    </AppCard>
  );
}

export function ExportTargetSoonSetupBlock({
  title,
  connectLabel,
  style,
}: {
  title: string;
  connectLabel: string;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeBlockStyles(theme), [theme]);

  return (
    <View style={[styles.block, style]}>
      <Text style={styles.title}>{title}</Text>
      <AppButton title={connectLabel} disabled />
    </View>
  );
}
