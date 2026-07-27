import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Switch, Text, View } from 'react-native';

import { t } from '@/src/i18n';
import {
  DEFAULT_QUICK_PREFS,
  loadQuickPrefs,
  saveQuickPrefs,
  type QuickUpdatePrefs,
} from '@/src/state/quickPrefs';
import { buildMonthWindow, formatMonthWindow } from '@/src/sync/monthWindow';
import { AppCard, Meta, SectionTitle } from '@/src/ui/AppCard';
import { Screen } from '@/src/ui/Screen';
import { SettingsStepper } from '@/src/ui/SettingsStepper';
import { makeSettingsStyles } from '@/src/ui/settingsStyles';
import { useTheme } from '@/src/ui/useTheme';

export default function SettingsImportWindowScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeSettingsStyles(theme), [theme]);
  const [quick, setQuick] = useState<QuickUpdatePrefs>(DEFAULT_QUICK_PREFS);

  useEffect(() => {
    void loadQuickPrefs().then(setQuick);
  }, []);

  const patchQuick = async (patch: Partial<QuickUpdatePrefs>) => {
    setQuick(await saveQuickPrefs(patch));
  };

  const windowPreview = useMemo(
    () => formatMonthWindow(buildMonthWindow(quick.prevMonths, quick.nextMonths)),
    [quick.prevMonths, quick.nextMonths]
  );

  return (
    <Screen>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
        <AppCard>
          <SectionTitle>{t('quickPrefsTitle')}</SectionTitle>
          <Meta>{t('quickPrefsHint')}</Meta>
          <Text style={styles.window}>
            {t('quickUpdateWindow')}: {windowPreview}
          </Text>
          <SettingsStepper
            label={t('quickPrefsPrev')}
            value={quick.prevMonths}
            onChange={(n) => void patchQuick({ prevMonths: n })}
            styles={styles}
          />
          <SettingsStepper
            label={t('quickPrefsNext')}
            value={quick.nextMonths}
            onChange={(n) => void patchQuick({ nextMonths: n })}
            styles={styles}
          />
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>{t('quickPrefsGoogle')}</Text>
            <Switch
              value={quick.syncGoogle}
              onValueChange={(v) => void patchQuick({ syncGoogle: v })}
              trackColor={{ true: theme.color.primaryPressed, false: theme.color.border }}
              thumbColor="#fff"
            />
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>{t('quickPrefsOfferIcs')}</Text>
            <Switch
              value={quick.offerIcsAfterFetch}
              onValueChange={(v) => void patchQuick({ offerIcsAfterFetch: v })}
              trackColor={{ true: theme.color.primaryPressed, false: theme.color.border }}
              thumbColor="#fff"
            />
          </View>
        </AppCard>
      </ScrollView>
    </Screen>
  );
}
