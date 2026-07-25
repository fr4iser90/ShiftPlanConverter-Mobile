import { useEffect, useMemo, useState } from 'react';
import { Alert, Linking, ScrollView, Text } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import { router, type Href } from 'expo-router';

import { t } from '@/src/i18n';
import { buildSupportParserSample } from '@/src/convert/anonymize';
import { getSnapshot, subscribe } from '@/src/state/store';
import {
  DESKTOP_GITHUB,
  PROJECT_GITHUB,
  PROJECT_PLAY_STORE,
  PROJECT_PRIVACY,
  PROJECT_RELEASES,
  PROJECT_WEBSITE,
  SUPPORT_EMAIL,
  changelogUrlForLocale,
  isPlayStoreListed,
} from '@/src/support/legal';
import { buildSupportMailBody, openSupportMail } from '@/src/support/mailto';
import { checkForAppUpdate } from '@/src/update/githubRelease';
import { AppButton } from '@/src/ui/AppButton';
import { AppCard, Meta, SectionTitle } from '@/src/ui/AppCard';
import { Screen } from '@/src/ui/Screen';
import { makeSettingsStyles } from '@/src/ui/settingsStyles';
import { useTheme } from '@/src/ui/useTheme';

export default function SettingsAboutScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeSettingsStyles(theme), [theme]);
  const [, setTick] = useState(0);
  const [updateLine, setUpdateLine] = useState('');
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateUrl, setUpdateUrl] = useState<string | null>(null);
  const snap = getSnapshot();
  const version = Constants.expoConfig?.version || '0.1.1';

  useEffect(() => subscribe(() => setTick((n) => n + 1)), []);

  const supportText = useMemo(() => {
    if (!snap.rawText) return '(kein Rohtext — zuerst Fixture/PDF konvertieren)';
    return buildSupportParserSample(snap.rawText, { maxChars: 900 });
  }, [snap.rawText]);

  const openUrl = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch (e) {
      Alert.alert('Link', String(e));
    }
  };

  const onCheckUpdate = async () => {
    setUpdateBusy(true);
    setUpdateLine(t('appUpdateChecking'));
    setUpdateUrl(null);
    try {
      const r = await checkForAppUpdate();
      if (r.status === 'up_to_date') {
        setUpdateLine(t('appUpdateLatest', { latest: r.latest }));
      } else if (r.status === 'update_available') {
        setUpdateLine(t('appUpdateAvailable', { latest: r.latest }));
        setUpdateUrl(r.htmlUrl);
      } else if (r.status === 'no_release') {
        setUpdateLine(t('appUpdateNone'));
      } else if (r.status === 'play_store') {
        setUpdateLine(t('appUpdatePlayStore'));
        setUpdateUrl(r.htmlUrl);
      } else {
        setUpdateLine(t('appUpdateError', { error: r.message }));
      }
    } finally {
      setUpdateBusy(false);
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
        subject: 'ShiftPlan Converter — Support / Pack-Anfrage',
        body,
      });
    } catch (e) {
      Alert.alert('Support', String(e));
    }
  };

  return (
    <Screen>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
        <AppCard>
          <SectionTitle>{t('appUpdateSection')}</SectionTitle>
          <Meta>{t('appUpdateHint')}</Meta>
          <Text style={styles.contact}>{t('appUpdateVersion', { version })}</Text>
          {updateLine ? <Meta>{updateLine}</Meta> : null}
          <AppButton
            title={t('appUpdateCheck')}
            onPress={() => void onCheckUpdate()}
            busy={updateBusy}
            disabled={updateBusy}
          />
          {updateUrl ? (
            <AppButton
              title={
                isPlayStoreListed() && updateUrl === PROJECT_PLAY_STORE
                  ? t('appUpdateOpenPlay')
                  : t('appUpdateOpenRelease')
              }
              variant="soft"
              onPress={() => void openUrl(updateUrl)}
            />
          ) : null}
          <AppButton
            title={t('appUpdateChangelog')}
            variant="secondary"
            onPress={() => void openUrl(changelogUrlForLocale(snap.locale))}
          />
          {!isPlayStoreListed() ? (
            <AppButton
              title={t('legalGithub')}
              variant="ghost"
              onPress={() => void openUrl(PROJECT_RELEASES)}
            />
          ) : null}
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
          <Meta>{t('legalDisclaimerBody')}</Meta>
          <Text style={styles.contact}>{SUPPORT_EMAIL}</Text>
          <Meta>ShiftPlan Converter v{version}</Meta>
          <AppButton
            title={t('legalPrivacy')}
            onPress={() => void openUrl(PROJECT_PRIVACY)}
          />
          <AppButton
            title={t('legalHandbook')}
            onPress={() => router.push('/(tabs)/settings/handbook' as Href)}
          />
          <AppButton
            title={t('legalMail')}
            variant="secondary"
            onPress={() => void openUrl(`mailto:${SUPPORT_EMAIL}`)}
          />
          <AppButton
            title={t('legalWebsite')}
            variant="secondary"
            onPress={() => void openUrl(PROJECT_WEBSITE)}
          />
          <AppButton
            title={t('legalGithub')}
            variant="ghost"
            onPress={() => void openUrl(PROJECT_GITHUB)}
          />
          <AppButton
            title={t('legalDesktop')}
            variant="ghost"
            onPress={() => void openUrl(DESKTOP_GITHUB)}
          />
        </AppCard>
      </ScrollView>
    </Screen>
  );
}
