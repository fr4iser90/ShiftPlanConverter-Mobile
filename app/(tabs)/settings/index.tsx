import { useCallback, useMemo, useState } from 'react';
import { ScrollView } from 'react-native';
import { router, useFocusEffect, type Href } from 'expo-router';

import { t } from '@/src/i18n';
import { getSnapshot, subscribeKeys } from '@/src/state/store';
import { formatSetupStatusMeta, getSetupStatus, type SetupStatus } from '@/src/setup/status';
import {
  formatScheduleSummary,
  getLastSuccessfulFetchAt,
  isSyncOverdue,
  loadSchedulePrefs,
} from '@/src/schedule/prefs';
import { loadShiftAlarmPrefs } from '@/src/schedule/shiftAlarmPrefs';
import { AppCard, ScreenTitle } from '@/src/ui/AppCard';
import { SettingsMenuRow } from '@/src/ui/SettingsMenuRow';
import { Screen } from '@/src/ui/Screen';
import { makeSettingsStyles } from '@/src/ui/settingsStyles';
import { useTheme } from '@/src/ui/useTheme';

export default function SettingsHubScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeSettingsStyles(theme), [theme]);
  const [, setTick] = useState(0);
  const [setup, setSetup] = useState<SetupStatus | null>(null);
  const [remindMeta, setRemindMeta] = useState('');
  const snap = getSnapshot();

  useFocusEffect(
    useCallback(() => {
      const unsub = subscribeKeys(['locale', 'themePref', 'summary'], () =>
        setTick((n) => n + 1)
      );
      void (async () => {
        setSetup(await getSetupStatus());
        const schedule = await loadSchedulePrefs();
        const last = await getLastSuccessfulFetchAt();
        const shift = await loadShiftAlarmPrefs();
        const locale = getSnapshot().locale;
        const syncLine = isSyncOverdue(schedule, last)
          ? t('scheduleOverdue')
          : formatScheduleSummary(schedule, locale === 'en' ? 'en' : 'de');
        const alarmLine = shift.enabled
          ? t('settingsHubRemindersAlarmOn')
          : t('settingsHubRemindersAlarmOff');
        setRemindMeta(`${syncLine} · ${alarmLine}`);
      })();
      return unsub;
    }, [])
  );

  const themeLabel =
    snap.themePref === 'light'
      ? t('widgetThemeLight')
      : snap.themePref === 'dark'
        ? t('widgetThemeDark')
        : t('widgetThemeSystem');

  const go = (path: string) => router.push(`/(tabs)/settings/${path}` as Href);

  return (
    <Screen>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
        <ScreenTitle>{t('tabSettings')}</ScreenTitle>
        <AppCard style={styles.menuCard}>
          <SettingsMenuRow
            title={t('settingsHubSetup')}
            meta={
              setup
                ? formatSetupStatusMeta(setup)
                : t('setupIncompleteWorkplace')
            }
            onPress={() => go('setup')}
            styles={styles}
          />
          <SettingsMenuRow
            title={t('settingsHubSecurity')}
            meta={t('settingsHubSecurityMeta')}
            onPress={() => go('security')}
            styles={styles}
          />
          <SettingsMenuRow
            title={t('settingsHubFetch')}
            meta={t('settingsHubFetchMeta')}
            onPress={() => go('fetch')}
            styles={styles}
          />
          <SettingsMenuRow
            title={t('settingsHubExport')}
            meta={t('settingsHubExportMeta')}
            onPress={() => go('export')}
            styles={styles}
          />
          <SettingsMenuRow
            title={t('settingsHubReminders')}
            meta={remindMeta || t('settingsHubRemindersMeta')}
            onPress={() => go('reminders')}
            styles={styles}
          />
          <SettingsMenuRow
            title={t('settingsHubAppearance')}
            meta={`${themeLabel} · ${snap.locale === 'en' ? 'English' : 'Deutsch'}`}
            onPress={() => go('appearance')}
            styles={styles}
          />
          <SettingsMenuRow
            title={t('settingsHubAbout')}
            meta={t('settingsHubAboutMeta')}
            onPress={() => go('about')}
            styles={styles}
            last
          />
        </AppCard>
      </ScrollView>
    </Screen>
  );
}
