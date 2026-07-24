import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { router, type Href } from 'expo-router';
import Constants from 'expo-constants';

import { t } from '@/src/i18n';
import { buildSupportParserSample } from '@/src/convert/anonymize';
import {
  getSnapshot,
  setLocale,
  setRichDetails,
  subscribe,
  type AppLocale,
} from '@/src/state/store';
import { clearCredentials } from '@/src/loga3/credentials';
import { getSetupStatus, type SetupStatus } from '@/src/setup/status';
import {
  DESKTOP_GITHUB,
  PROJECT_GITHUB,
  PROJECT_WEBSITE,
  SUPPORT_EMAIL,
} from '@/src/support/legal';
import { buildSupportMailBody, openSupportMail } from '@/src/support/mailto';
import {
  DEFAULT_QUICK_PREFS,
  loadQuickPrefs,
  saveQuickPrefs,
  type QuickUpdatePrefs,
} from '@/src/state/quickPrefs';
import { buildMonthWindow, formatMonthWindow } from '@/src/sync/monthWindow';
import { AppButton } from '@/src/ui/AppButton';
import { AppCard, Meta, ScreenTitle, SectionTitle } from '@/src/ui/AppCard';
import { theme } from '@/src/ui/theme';

const SETUP_HREF = '/setup' as Href;

export default function SettingsScreen() {
  const [, setTick] = useState(0);
  const [setup, setSetup] = useState<SetupStatus | null>(null);
  const [quick, setQuick] = useState<QuickUpdatePrefs>(DEFAULT_QUICK_PREFS);
  const snap = getSnapshot();
  const version = Constants.expoConfig?.version || '0.1.1';

  useEffect(() => subscribe(() => setTick((n) => n + 1)), []);
  useEffect(() => {
    void getSetupStatus().then(setSetup);
    void loadQuickPrefs().then(setQuick);
  }, []);

  const supportText = useMemo(() => {
    if (!snap.rawText) return '(kein Rohtext — zuerst Fixture/PDF konvertieren)';
    return buildSupportParserSample(snap.rawText, { maxChars: 900 });
  }, [snap.rawText]);

  const windowPreview = useMemo(
    () => formatMonthWindow(buildMonthWindow(quick.prevMonths, quick.nextMonths)),
    [quick.prevMonths, quick.nextMonths]
  );

  const patchQuick = async (patch: Partial<QuickUpdatePrefs>) => {
    const next = await saveQuickPrefs(patch);
    setQuick(next);
  };

  const openUrl = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch (e) {
      Alert.alert('Link', String(e));
    }
  };

  const onSupportMail = async () => {
    try {
      const body = buildSupportMailBody({
        hospital: snap.hospitalId,
        group: snap.groupId,
        area: snap.areaId,
        sample: snap.rawText ? supportText : undefined,
      });
      await openSupportMail({
        subject: 'LOGA3 Mobile — Support / Pack-Anfrage',
        body,
      });
    } catch (e) {
      Alert.alert('Support', String(e));
    }
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <ScreenTitle>{t('tabSettings')}</ScreenTitle>

      <AppCard>
        <SectionTitle>{t('setupTitle')}</SectionTitle>
        <Meta>
          {setup?.complete
            ? `${t('setupComplete')}: ${setup.summary}`
            : t('setupIncomplete')}
        </Meta>
        <AppButton title={t('openSetup')} onPress={() => router.push(SETUP_HREF)} />
      </AppCard>

      <AppCard>
        <SectionTitle>{t('quickPrefsTitle')}</SectionTitle>
        <Meta>{t('quickPrefsHint')}</Meta>
        <Text style={styles.window}>{t('quickUpdateWindow')}: {windowPreview}</Text>
        <Stepper
          label={t('quickPrefsPrev')}
          value={quick.prevMonths}
          onChange={(n) => void patchQuick({ prevMonths: n })}
        />
        <Stepper
          label={t('quickPrefsNext')}
          value={quick.nextMonths}
          onChange={(n) => void patchQuick({ nextMonths: n })}
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
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>{t('richDetails')}</Text>
          <Switch
            value={snap.richDetails}
            onValueChange={(v) => void setRichDetails(v)}
            trackColor={{ true: theme.color.primaryPressed, false: theme.color.border }}
            thumbColor="#fff"
          />
        </View>
      </AppCard>

      <AppCard>
        <SectionTitle>{t('supportTitle')}</SectionTitle>
        <Meta>{t('supportIntro')}</Meta>
        <Text style={styles.sampleLabel}>{t('supportSample')}</Text>
        <Text style={styles.sample}>{supportText}</Text>
        <AppButton
          title={t('copySupport')}
          variant="secondary"
          onPress={async () => {
            try {
              await Clipboard.setStringAsync(supportText);
              Alert.alert('OK', t('supportCopied'));
            } catch (e) {
              Alert.alert('Clipboard', String(e));
            }
          }}
        />
        <AppButton title={t('supportMail')} onPress={() => void onSupportMail()} />
      </AppCard>

      <AppCard>
        <SectionTitle>{t('legalTitle')}</SectionTitle>
        <Meta>{t('legalImpressumBody')}</Meta>
        <Meta>{t('legalPrivacyBody')}</Meta>
        <Text style={styles.contact}>{SUPPORT_EMAIL}</Text>
        <Meta>LOGA3 Automation Mobile v{version}</Meta>
        <AppButton title={t('legalMail')} variant="secondary" onPress={() => void openUrl(`mailto:${SUPPORT_EMAIL}`)} />
        <AppButton title={t('legalWebsite')} variant="secondary" onPress={() => void openUrl(PROJECT_WEBSITE)} />
        <AppButton title={t('legalGithub')} variant="ghost" onPress={() => void openUrl(PROJECT_GITHUB)} />
        <AppButton title={t('legalDesktop')} variant="ghost" onPress={() => void openUrl(DESKTOP_GITHUB)} />
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
    </ScrollView>
  );
}

function Stepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <View style={styles.stepper}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.row}>
        <AppButton compact title="−" variant="secondary" onPress={() => onChange(Math.max(0, value - 1))} />
        <Text style={styles.stepperVal}>{value}</Text>
        <AppButton compact title="+" variant="secondary" onPress={() => onChange(Math.min(6, value + 1))} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: theme.color.canvas },
  container: { padding: theme.space.lg, gap: theme.space.md, paddingBottom: 48 },
  window: { ...theme.type.caption, color: theme.color.primary, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  switchLabel: { flex: 1, color: theme.color.ink, fontSize: 14 },
  stepper: { gap: 4, marginTop: 4 },
  stepperLabel: { fontSize: 13, color: theme.color.inkSecondary },
  stepperVal: { minWidth: 28, textAlign: 'center', fontWeight: '700', fontSize: 16, color: theme.color.ink },
  sampleLabel: { fontWeight: '600', fontSize: 13, color: theme.color.ink, marginTop: 4 },
  sample: {
    fontSize: 11,
    fontFamily: 'SpaceMono',
    backgroundColor: theme.color.surfaceMuted,
    padding: 10,
    borderRadius: theme.radius.sm,
    color: theme.color.inkSecondary,
  },
  contact: { fontSize: 14, fontWeight: '600', color: theme.color.ink },
});
