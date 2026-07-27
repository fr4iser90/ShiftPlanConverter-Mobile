import { useMemo } from 'react';
import { ScrollView } from 'react-native';
import { router, type Href } from 'expo-router';

import { t } from '@/src/i18n';
import { AppCard } from '@/src/ui/AppCard';
import { SettingsMenuRow } from '@/src/ui/SettingsMenuRow';
import { Screen } from '@/src/ui/Screen';
import { makeSettingsStyles } from '@/src/ui/settingsStyles';
import { useTheme } from '@/src/ui/useTheme';

export default function SettingsExportHubScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeSettingsStyles(theme), [theme]);

  const go = (path: string) => router.push(`/(tabs)/settings/${path}` as Href);

  return (
    <Screen>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
        <AppCard style={styles.menuCard}>
          <SettingsMenuRow
            title={t('settingsHubGoogle')}
            meta={t('settingsHubGoogleMeta')}
            onPress={() => go('google')}
            styles={styles}
          />
          <SettingsMenuRow
            title={t('settingsHubOutlook')}
            meta={t('settingsHubOutlookMeta')}
            onPress={() => go('outlook')}
            styles={styles}
          />
          <SettingsMenuRow
            title={t('settingsHubApple')}
            meta={t('settingsHubAppleMeta')}
            onPress={() => go('apple')}
            styles={styles}
            last
          />
        </AppCard>
      </ScrollView>
    </Screen>
  );
}
