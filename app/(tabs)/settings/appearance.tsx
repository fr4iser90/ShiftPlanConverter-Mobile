import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Switch, Text, View } from 'react-native';

import { t } from '@/src/i18n';
import {
  getSnapshot,
  setLocale,
  setThemePref,
  subscribeKeys,
  type AppLocale,
  type ThemePref,
} from '@/src/state/store';
import {
  DEFAULT_WIDGET_PREFS,
  loadWidgetPrefs,
  saveWidgetPrefs,
  type WidgetPrefs,
  type WidgetThemePref,
} from '@/src/widget/prefs';
import { refreshHomeWidgets } from '@/src/widget/refresh';
import { AppButton } from '@/src/ui/AppButton';
import { AppCard, Meta, SectionTitle } from '@/src/ui/AppCard';
import { Screen } from '@/src/ui/Screen';
import { makeSettingsStyles } from '@/src/ui/settingsStyles';
import { useTheme } from '@/src/ui/useTheme';

export default function SettingsAppearanceScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeSettingsStyles(theme), [theme]);
  const [, setTick] = useState(0);
  const [widgetPrefs, setWidgetPrefs] = useState<WidgetPrefs>(DEFAULT_WIDGET_PREFS);
  const snap = getSnapshot();

  useEffect(
    () =>
      subscribeKeys(['locale', 'themePref', 'entries'], () =>
        setTick((n) => n + 1)
      ),
    []
  );
  useEffect(() => {
    void loadWidgetPrefs().then(setWidgetPrefs);
  }, []);

  const patchWidgetTheme = async (themePref: WidgetThemePref) => {
    const next = await saveWidgetPrefs({ theme: themePref });
    setWidgetPrefs(next);
    void refreshHomeWidgets(snap.entries);
  };

  const patchWidget = async (patch: Partial<WidgetPrefs>) => {
    const next = await saveWidgetPrefs(patch);
    setWidgetPrefs(next);
    void refreshHomeWidgets(snap.entries);
  };

  return (
    <Screen>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
        <AppCard>
          <SectionTitle>{t('appTheme')}</SectionTitle>
          <Meta>{t('appThemeHint')}</Meta>
          <View style={styles.row}>
            {(
              [
                ['system', 'widgetThemeSystem'],
                ['light', 'widgetThemeLight'],
                ['dark', 'widgetThemeDark'],
              ] as const
            ).map(([pref, labelKey]) => (
              <AppButton
                key={pref}
                compact
                title={t(labelKey)}
                variant={snap.themePref === pref ? 'soft' : 'secondary'}
                onPress={() => void setThemePref(pref as ThemePref)}
              />
            ))}
          </View>
        </AppCard>

        <AppCard>
          <SectionTitle>{t('language')}</SectionTitle>
          <View style={styles.row}>
            <AppButton
              compact
              title="Deutsch"
              variant={snap.locale === 'de' ? 'soft' : 'secondary'}
              onPress={() => void setLocale('de' as AppLocale)}
            />
            <AppButton
              compact
              title="English"
              variant={snap.locale === 'en' ? 'soft' : 'secondary'}
              onPress={() => void setLocale('en' as AppLocale)}
            />
          </View>
        </AppCard>

        <AppCard>
          <SectionTitle>{t('widgetSection')}</SectionTitle>
          <Meta>{t('widgetSectionHint')}</Meta>
          <Text style={styles.stepperLabel}>{t('widgetTheme')}</Text>
          <View style={styles.row}>
            {(
              [
                ['system', 'widgetThemeSystem'],
                ['light', 'widgetThemeLight'],
                ['dark', 'widgetThemeDark'],
              ] as const
            ).map(([pref, labelKey]) => (
              <AppButton
                key={pref}
                compact
                title={t(labelKey)}
                variant={widgetPrefs.theme === pref ? 'soft' : 'secondary'}
                onPress={() => void patchWidgetTheme(pref)}
              />
            ))}
          </View>
          <Text style={styles.stepperLabel}>{t('widgetDensity')}</Text>
          <View style={styles.row}>
            <AppButton
              compact
              title={t('widgetDensityComfortable')}
              variant={widgetPrefs.density === 'comfortable' ? 'soft' : 'secondary'}
              onPress={() => void patchWidget({ density: 'comfortable' })}
            />
            <AppButton
              compact
              title={t('widgetDensityCompact')}
              variant={widgetPrefs.density === 'compact' ? 'soft' : 'secondary'}
              onPress={() => void patchWidget({ density: 'compact' })}
            />
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>{t('widgetShowTimes')}</Text>
            <Switch
              value={widgetPrefs.showTimes}
              onValueChange={(v) => void patchWidget({ showTimes: v })}
              trackColor={{ true: theme.color.primaryPressed, false: theme.color.border }}
              thumbColor="#fff"
            />
          </View>
        </AppCard>
      </ScrollView>
    </Screen>
  );
}
