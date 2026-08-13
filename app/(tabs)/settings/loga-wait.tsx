import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { t } from '@/src/i18n';
import {
  DEFAULT_WAIT_PATIENCE,
  loadWaitPatience,
  saveWaitPatience,
  type LoGa3WaitPatience,
} from '@/src/sources/webview/loga3/shared/waitPatiencePrefs';
import { AppButton } from '@/src/ui/AppButton';
import { AppCard, Meta, SectionTitle } from '@/src/ui/AppCard';
import { Screen } from '@/src/ui/Screen';
import { makeSettingsStyles } from '@/src/ui/settingsStyles';
import { useTheme } from '@/src/ui/useTheme';

export default function SettingsLogaWaitScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeSettingsStyles(theme), [theme]);
  const [patience, setPatience] = useState<LoGa3WaitPatience>(DEFAULT_WAIT_PATIENCE);

  useEffect(() => {
    void loadWaitPatience().then(setPatience);
  }, []);

  const pick = async (next: LoGa3WaitPatience) => {
    setPatience(await saveWaitPatience(next));
  };

  return (
    <Screen>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
        <AppCard>
          <SectionTitle>{t('settingsLogaWait')}</SectionTitle>
          <Meta>{t('settingsLogaWaitHint')}</Meta>
          <View style={styles.row}>
            <AppButton
              compact
              title={t('settingsLogaWaitNormal')}
              variant={patience === 'normal' ? 'soft' : 'secondary'}
              onPress={() => void pick('normal')}
            />
            <AppButton
              compact
              title={t('settingsLogaWaitVerySlow')}
              variant={patience === 'verySlow' ? 'soft' : 'secondary'}
              onPress={() => void pick('verySlow')}
            />
          </View>
        </AppCard>
      </ScrollView>
    </Screen>
  );
}
