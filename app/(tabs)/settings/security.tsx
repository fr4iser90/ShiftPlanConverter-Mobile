import { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, Switch, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { t } from '@/src/i18n';
import {
  canUseDeviceAuth,
  isBiometricLockEnabled,
  setBiometricLockEnabled,
} from '@/src/security/biometric';
import { AppCard, Meta, SectionTitle } from '@/src/ui/AppCard';
import { Screen } from '@/src/ui/Screen';
import { makeSettingsStyles } from '@/src/ui/settingsStyles';
import { useTheme } from '@/src/ui/useTheme';

export default function SettingsSecurityScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeSettingsStyles(theme), [theme]);
  const [enabled, setEnabled] = useState(false);
  const [available, setAvailable] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        setEnabled(await isBiometricLockEnabled());
        setAvailable(await canUseDeviceAuth());
      })();
    }, [])
  );

  const onToggle = async (next: boolean) => {
    if (next && !available) {
      Alert.alert(t('securityBiometric'), t('securityBiometricUnavailable'));
      return;
    }
    await setBiometricLockEnabled(next);
    setEnabled(next);
  };

  return (
    <Screen>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
        <AppCard>
          <SectionTitle>{t('securityBiometric')}</SectionTitle>
          <Meta>{t('securityBiometricHint')}</Meta>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>{t('securityBiometricToggle')}</Text>
            <Switch
              value={enabled}
              onValueChange={(v) => void onToggle(v)}
              trackColor={{ true: theme.color.primary }}
            />
          </View>
          {!available ? <Meta>{t('securityBiometricUnavailable')}</Meta> : null}
        </AppCard>
        <AppCard>
          <SectionTitle>{t('securityAtRest')}</SectionTitle>
          <Meta>{t('securityAtRestBody')}</Meta>
        </AppCard>
      </ScrollView>
    </Screen>
  );
}
