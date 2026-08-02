/**
 * Last name / first name for the preferred roster name.
 */
import { useMemo } from 'react';
import { StyleSheet, Text, TextInput, View, type TextStyle } from 'react-native';

import { t } from '@/src/i18n';
import type { RosterNameParts } from '@/src/state/rosterNameParts';
import { useTheme } from '@/src/ui/useTheme';
import type { AppTheme } from '@/src/ui/theme';

type Props = {
  value: RosterNameParts;
  onChange: (next: RosterNameParts) => void;
  /** Optional override for TextInput style (settings vs setup). */
  inputStyle?: TextStyle;
};

export function RosterNameFields({ value, onChange, inputStyle }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{t('settingsOcrNameLast')}</Text>
      <TextInput
        style={[styles.input, inputStyle]}
        value={value.last}
        onChangeText={(last) => onChange({ ...value, last })}
        placeholder={t('settingsOcrNameLastPlaceholder')}
        placeholderTextColor={theme.color.inkMuted}
        autoCapitalize="words"
        autoCorrect={false}
      />
      <Text style={styles.label}>{t('settingsOcrNameFirst')}</Text>
      <TextInput
        style={[styles.input, inputStyle]}
        value={value.first}
        onChangeText={(first) => onChange({ ...value, first })}
        placeholder={t('settingsOcrNameFirstPlaceholder')}
        placeholderTextColor={theme.color.inkMuted}
        autoCapitalize="words"
        autoCorrect={false}
      />
    </View>
  );
}

function makeStyles(theme: AppTheme) {
  return StyleSheet.create({
    wrap: { gap: 6 },
    label: {
      marginTop: 6,
      fontSize: 13,
      fontWeight: '600',
      color: theme.color.inkSecondary,
    },
    input: {
      borderWidth: 1,
      borderColor: theme.color.border,
      borderRadius: theme.radius.sm,
      paddingHorizontal: 10,
      paddingVertical: 10,
      color: theme.color.ink,
      backgroundColor: theme.color.surfaceMuted,
      fontSize: 15,
    },
  });
}
