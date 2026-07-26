import { useMemo } from 'react';
import { ScrollView } from 'react-native';

import { t } from '@/src/i18n';
import { GoogleSyncCard } from '@/src/ui/GoogleSyncCard';
import { Screen } from '@/src/ui/Screen';
import { makeSettingsStyles } from '@/src/ui/settingsStyles';
import { useTheme } from '@/src/ui/useTheme';

export default function SettingsGoogleScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeSettingsStyles(theme), [theme]);

  return (
    <Screen>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
        <GoogleSyncCard
          title={t('settingsHubGoogle')}
          hint={t('exportGoogleHint')}
          showSync
        />
      </ScrollView>
    </Screen>
  );
}
