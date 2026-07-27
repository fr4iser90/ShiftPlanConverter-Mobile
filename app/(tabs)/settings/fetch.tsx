import { useCallback, useMemo, useState } from 'react';
import { ScrollView } from 'react-native';
import { router, useFocusEffect, type Href } from 'expo-router';

import { t } from '@/src/i18n';
import { loadQuickPrefs } from '@/src/state/quickPrefs';
import { loadOcrPreferredName } from '@/src/state/ocrPreferredName';
import { buildMonthWindow, formatMonthWindow } from '@/src/sync/monthWindow';
import { AppCard } from '@/src/ui/AppCard';
import { SettingsMenuRow } from '@/src/ui/SettingsMenuRow';
import { Screen } from '@/src/ui/Screen';
import { makeSettingsStyles } from '@/src/ui/settingsStyles';
import { useTheme } from '@/src/ui/useTheme';

export default function SettingsImportHubScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeSettingsStyles(theme), [theme]);
  const [windowMeta, setWindowMeta] = useState('');
  const [nameMeta, setNameMeta] = useState('');

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        const quick = await loadQuickPrefs();
        setWindowMeta(
          formatMonthWindow(buildMonthWindow(quick.prevMonths, quick.nextMonths))
        );
        const name = await loadOcrPreferredName();
        setNameMeta(name ? name : t('settingsHubOcrMeta'));
      })();
    }, [])
  );

  const go = (path: string) => router.push(`/(tabs)/settings/${path}` as Href);

  return (
    <Screen>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
        <AppCard style={styles.menuCard}>
          <SettingsMenuRow
            title={t('settingsImportWindow')}
            meta={windowMeta || t('settingsHubFetchMeta')}
            onPress={() => go('import-window')}
            styles={styles}
          />
          <SettingsMenuRow
            title={t('settingsHubOcr')}
            meta={nameMeta || t('settingsHubOcrMeta')}
            onPress={() => go('ocr')}
            styles={styles}
            last
          />
        </AppCard>
      </ScrollView>
    </Screen>
  );
}
