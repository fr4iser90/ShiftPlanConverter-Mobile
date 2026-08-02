import { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { router, type Href } from 'expo-router';

import { t } from '@/src/i18n';
import { clearCredentials } from '@/src/sources/webview/loga3/shared/credentials';
import { formatSetupStatusMeta, getSetupStatus, type SetupStatus } from '@/src/setup/status';
import { clearLocalShifts, getSnapshot, wipeAllLocalData } from '@/src/state/store';
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
            {setup ? formatSetupStatusMeta(setup) : t('setupIncompleteWorkplace')}
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
          title={t('clearLocalShifts')}
          variant="danger"
          onPress={() => {
            const n = getSnapshot().entries.length;
            if (!n) {
              Alert.alert(t('clearLocalShifts'), t('clearLocalShiftsEmpty'));
              return;
            }
            Alert.alert(t('clearLocalShifts'), t('clearLocalShiftsConfirm'), [
              { text: t('cancel'), style: 'cancel' },
              {
                text: t('clearLocalShifts'),
                style: 'destructive',
                onPress: () => {
                  void (async () => {
                    try {
                      const removed = await clearLocalShifts();
                      Alert.alert('OK', t('clearLocalShiftsDone', { count: removed }));
                    } catch (e) {
                      Alert.alert(
                        t('alertError'),
                        e instanceof Error ? e.message : String(e)
                      );
                    }
                  })();
                },
              },
            ]);
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
