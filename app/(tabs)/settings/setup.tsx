import { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { router, type Href } from 'expo-router';

import { t } from '@/src/i18n';
import { clearCredentials } from '@/src/loga3/credentials';
import { getSetupStatus, type SetupStatus } from '@/src/setup/status';
import { wipeAllLocalData } from '@/src/state/store';
import { AppButton } from '@/src/ui/AppButton';
import { AppCard, Meta, SectionTitle } from '@/src/ui/AppCard';
import { Screen } from '@/src/ui/Screen';
import { makeSettingsStyles } from '@/src/ui/settingsStyles';
import { useTheme } from '@/src/ui/useTheme';

const SETUP_HREF = '/setup' as Href;

export default function SettingsSetupScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeSettingsStyles(theme), [theme]);
  const [setup, setSetup] = useState<SetupStatus | null>(null);

  useEffect(() => {
    void getSetupStatus().then(setSetup);
  }, []);

  return (
    <Screen>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
        <AppCard>
          <SectionTitle>{t('setupTitle')}</SectionTitle>
          <Meta>
            {setup?.complete
              ? `${t('setupComplete')}: ${setup.summary}`
              : t('setupIncomplete')}
          </Meta>
          <AppButton title={t('openSetup')} onPress={() => router.push(SETUP_HREF)} />
        </AppCard>
        <AppButton
          title={t('clearCreds')}
          variant="danger"
          onPress={async () => {
            await clearCredentials();
            setSetup(await getSetupStatus());
            Alert.alert('OK', t('setupCredsCleared'));
          }}
        />
        <AppButton
          title={t('wipeAllData')}
          variant="danger"
          onPress={() => {
            Alert.alert(t('wipeAllData'), t('wipeAllDataConfirm'), [
              { text: t('wipeAllDataCancel'), style: 'cancel' },
              {
                text: t('wipeAllData'),
                style: 'destructive',
                onPress: () => {
                  void (async () => {
                    await wipeAllLocalData();
                    setSetup(await getSetupStatus());
                    Alert.alert('OK', t('wipeAllDataDone'));
                    router.replace(SETUP_HREF);
                  })();
                },
              },
            ]);
          }}
        />
      </ScrollView>
    </Screen>
  );
}
