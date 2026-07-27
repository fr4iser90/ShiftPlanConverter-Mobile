import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { t } from '@/src/i18n';
import {
  loadCredentials,
  saveCredentials,
} from '@/src/sources/loga3/credentials';
import {
  getLoga3BaseUrl,
  hydrateLoga3Env,
  isValidLoga3BaseUrl,
  setLoga3BaseUrl,
} from '@/src/sources/loga3/env';
import {
  getGoogleCalendarId,
  getSnapshot,
  isWorkplaceConfigured,
  setGoogleCalendarId,
  setWorkplace,
  subscribe,
} from '@/src/state/store';
import {
  getPackById,
  isSourceSupportedByPack,
  listBuiltinPacks,
} from '@/src/packs';
import { saveActiveSourceId } from '@/src/state/activeSource';
import { WorkplacePicker } from '@/src/ui/WorkplacePicker';
import { getSetupStatus } from '@/src/setup/status';
import {
  connectGoogle,
  getGoogleAccountEmail,
  hasGoogleSession,
  isPrimaryCalendar,
  listCalendars,
  preferredCalendarId,
  restoreGoogleSession,
  type GoogleCalendar,
} from '@/src/sync/google';
import { ensureBiometricUnlocked } from '@/src/security/biometric';
import { AppButton } from '@/src/ui/AppButton';
import { AppCard, Meta, ScreenTitle, SectionTitle } from '@/src/ui/AppCard';
import { GoogleCalendarPicker } from '@/src/ui/GoogleCalendarPicker';
import { ExportTargetSoonSetupBlock } from '@/src/ui/ExportTargetSoonCard';
import { theme } from '@/src/ui/theme';

/** 0 = workplace · 1 = portal (optional, pack-dependent) · 2 = calendars (optional) */
type Step = 0 | 1 | 2;

async function preferNonLoga3Source(hospitalId: string | null | undefined): Promise<void> {
  const pack = hospitalId ? getPackById(hospitalId) : null;
  if (isSourceSupportedByPack(pack, 'local-files')) {
    await saveActiveSourceId('local-files');
    return;
  }
  if (isSourceSupportedByPack(pack, 'camera-ocr')) {
    await saveActiveSourceId('camera-ocr');
  }
}

async function preferLoga3Source(hospitalId: string | null | undefined): Promise<void> {
  const pack = hospitalId ? getPackById(hospitalId) : null;
  if (isSourceSupportedByPack(pack, 'loga3-webview')) {
    await saveActiveSourceId('loga3-webview');
  }
}

export default function SetupScreen() {
  const [, setTick] = useState(0);
  const [step, setStep] = useState<Step>(0);
  const [url, setUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busyGoogle, setBusyGoogle] = useState(false);
  const [calendars, setCalendars] = useState<GoogleCalendar[]>([]);
  const [calendarId, setCalendarId] = useState<string | null>(null);
  const [primaryWarn, setPrimaryWarn] = useState(false);
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const snap = getSnapshot();
  const pack = useMemo(
    () => (snap.hospitalId ? getPackById(snap.hospitalId) : null),
    [snap.hospitalId]
  );
  const portalAvailable = isSourceSupportedByPack(pack, 'loga3-webview');

  useEffect(() => subscribe(() => setTick((n) => n + 1)), []);

  const hydrateGoogleUi = useCallback(async () => {
    const storedCal = await getGoogleCalendarId();
    if (storedCal) setCalendarId(storedCal);

    const restored = hasGoogleSession() || (await restoreGoogleSession());
    setGoogleEmail(getGoogleAccountEmail());
    if (!restored) {
      setCalendars([]);
      return;
    }
    try {
      const list = await listCalendars();
      setCalendars(list);
      const preferred = storedCal || (await preferredCalendarId(list));
      if (preferred) {
        setCalendarId(preferred);
        if (!storedCal) await setGoogleCalendarId(preferred);
      }
      const selected = list.find((c) => c.id === preferred);
      setPrimaryWarn(!!selected && isPrimaryCalendar(selected));
    } catch {
      // session ok but Calendar API failed — keep stored id
    }
  }, []);

  const hydrateFields = useCallback(async () => {
    await hydrateLoga3Env();
    setUrl(getLoga3BaseUrl());
    const c = await loadCredentials();
    if (c) {
      setUsername(c.username);
      const unlocked = await ensureBiometricUnlocked(t('securityBiometricPromptSetup'));
      setPassword(unlocked ? c.password : '');
    } else {
      setUsername('');
      setPassword('');
    }
    await hydrateGoogleUi();
    const st = await getSetupStatus();
    const snapNow = getSnapshot();
    const packNow = snapNow.hospitalId ? getPackById(snapNow.hospitalId) : null;
    const hasPortal = isSourceSupportedByPack(packNow, 'loga3-webview');
    if (!st.workplaceOk) setStep(0);
    else if (hasPortal && !st.loga3Ready) setStep(1);
    else setStep(2);
  }, [hydrateGoogleUi]);

  useFocusEffect(
    useCallback(() => {
      void hydrateFields();
    }, [hydrateFields])
  );

  const goAfterWorkplace = () => {
    if (!isWorkplaceConfigured(snap)) {
      Alert.alert(t('setupWorkplace'), t('setupWorkplaceRequired'));
      return;
    }
    if (portalAvailable) setStep(1);
    else setStep(2);
  };

  const saveLoga3AndContinue = async () => {
    const next = url.trim();
    if (!isValidLoga3BaseUrl(next)) {
      Alert.alert(t('setupTenant'), t('setupUrlInvalid'));
      return;
    }
    if (!username.trim() || !password) {
      Alert.alert(t('loginTitle'), t('setupLoginRequired'));
      return;
    }
    try {
      await setLoga3BaseUrl(next);
    } catch {
      Alert.alert(t('setupTenant'), t('setupUrlInvalid'));
      return;
    }
    await saveCredentials({ username: username.trim(), password });
    await preferLoga3Source(snap.hospitalId);
    setStep(2);
  };

  const skipLoga3 = async () => {
    if (!isWorkplaceConfigured(snap)) {
      Alert.alert(t('setupWorkplace'), t('setupWorkplaceRequired'));
      return;
    }
    await preferNonLoga3Source(snap.hospitalId);
    setStep(2);
  };

  /** One tap: default pack + role, file/photo sources, skip portal & calendar. */
  const finishFilesOnly = async () => {
    if (!isWorkplaceConfigured(snap)) {
      const p = listBuiltinPacks()[0];
      if (!p) {
        Alert.alert(t('setupWorkplace'), t('noPacksYet'));
        return;
      }
      const g = p.groups[0];
      const a = g?.areas.find((x) => x.supported) || g?.areas[0];
      await setWorkplace({
        hospitalId: p.id,
        groupId: g?.id || '',
        areaId: a?.id || '',
        preset: a?.defaultPreset || '',
      });
    }
    const hospitalId = getSnapshot().hospitalId;
    await preferNonLoga3Source(hospitalId);
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const onGoogleConnect = async () => {
    try {
      setBusyGoogle(true);
      await connectGoogle();
      setGoogleEmail(getGoogleAccountEmail());
      const list = await listCalendars();
      setCalendars(list);
      const preferred = await preferredCalendarId(list);
      setCalendarId(preferred);
      if (preferred) await setGoogleCalendarId(preferred);
      const selected = list.find((c) => c.id === preferred);
      setPrimaryWarn(!!selected && isPrimaryCalendar(selected));
      Alert.alert('Google', `${list.length} ${t('setupGoogleCalendarsLoaded')}`);
    } catch (e) {
      Alert.alert('Google', String(e));
    } finally {
      setBusyGoogle(false);
    }
  };

  const finish = async () => {
    if (!isWorkplaceConfigured(snap)) {
      Alert.alert(t('setupWorkplace'), t('setupWorkplaceRequired'));
      return;
    }
    const st = await getSetupStatus();
    if (!st.workplaceReady) {
      Alert.alert(t('setupTitle'), t('setupIncompleteWorkplace'));
      return;
    }
    if (calendarId) await setGoogleCalendarId(calendarId);
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <ScreenTitle>{t('setupTitle')}</ScreenTitle>
      <Meta>{t('setupIntro')}</Meta>

      <View style={styles.steps}>
        <StepDot n={1} active={step === 0} done={step > 0} label={t('setupStepWorkplace')} />
        <StepDot
          n={2}
          active={step === 1}
          done={step > 1}
          label={portalAvailable ? t('setupStepLoga3') : t('setupStepGoogle')}
        />
        {portalAvailable ? (
          <StepDot n={3} active={step === 2} done={false} label={t('setupStepGoogle')} />
        ) : null}
      </View>

      {step === 0 && (
        <AppCard>
          <SectionTitle>{t('setupWorkplace')}</SectionTitle>
          <Meta>{t('workplaceHint')}</Meta>
          <WorkplacePicker />
          <AppButton title={t('setupNext')} onPress={goAfterWorkplace} />
          <AppButton
            title={t('setupFilesOnly')}
            variant="ghost"
            onPress={() => void finishFilesOnly()}
          />
          <Meta>{t('setupFilesOnlyHint')}</Meta>
        </AppCard>
      )}

      {step === 1 && portalAvailable && (
        <AppCard>
          <SectionTitle>{t('setupLoga3OptionalTitle')}</SectionTitle>
          <Text style={styles.optional}>{t('setupLoga3Optional')}</Text>
          <Meta>{t('setupLoga3OptionalHint')}</Meta>
          <SectionTitle>{t('setupTenant')}</SectionTitle>
          <Meta>{t('setupTenantHint')}</Meta>
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            value={url}
            onChangeText={setUrl}
            placeholder="https://…/loga3/#"
            placeholderTextColor={theme.color.inkFaint}
          />
          <SectionTitle>{t('setupStepLogin')}</SectionTitle>
          <Meta>{t('setupLoginHint')}</Meta>
          <TextInput
            style={styles.input}
            placeholder={t('username')}
            placeholderTextColor={theme.color.inkFaint}
            autoCapitalize="none"
            autoCorrect={false}
            value={username}
            onChangeText={setUsername}
          />
          <TextInput
            style={styles.input}
            placeholder={t('password')}
            placeholderTextColor={theme.color.inkFaint}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          <View style={styles.row}>
            <AppButton
              title={t('setupBack')}
              variant="secondary"
              onPress={() => setStep(0)}
              style={styles.flexBtn}
            />
            <AppButton
              title={t('setupSkip')}
              variant="ghost"
              onPress={() => void skipLoga3()}
              style={styles.flexBtn}
            />
            <AppButton
              title={t('setupNext')}
              onPress={() => void saveLoga3AndContinue()}
              style={styles.flexBtn}
            />
          </View>
        </AppCard>
      )}

      {step === 2 && (
        <AppCard>
          <SectionTitle>{t('setupGoogle')}</SectionTitle>
          <Meta>{t('setupGoogleHint')}</Meta>
          <Text style={styles.optional}>{t('setupGoogleOptional')}</Text>

          <View style={styles.calTargets}>
            <View style={styles.calTargetOn}>
              <Text style={styles.calTargetTitle}>{t('settingsHubGoogle')}</Text>
              {googleEmail ? (
                <Text style={styles.connected}>
                  {t('googleConnectedAs', { email: googleEmail })}
                </Text>
              ) : null}
              {calendarId && calendars.length === 0 ? (
                <Text style={styles.connected}>
                  {t('googleCalendarSaved', {
                    name: calendarId.includes('@') ? calendarId.split('@')[0]! : calendarId,
                  })}
                </Text>
              ) : null}
              <AppButton
                title={googleEmail || calendarId ? t('googleReconnect') : t('googleConnect')}
                onPress={() => void onGoogleConnect()}
                disabled={busyGoogle}
                busy={busyGoogle}
              />
              {primaryWarn && <Text style={styles.warn}>{t('primaryWarn')}</Text>}
              {(calendars.length > 0 || googleEmail) && (
                <GoogleCalendarPicker
                  calendars={calendars}
                  calendarId={calendarId}
                  title={t('setupGooglePickCalendar')}
                  onChange={(list, id) => {
                    setCalendars(list);
                    setCalendarId(id);
                    const selected = list.find((c) => c.id === id);
                    setPrimaryWarn(!!selected && isPrimaryCalendar(selected));
                  }}
                />
              )}
            </View>

            <ExportTargetSoonSetupBlock
              title={t('settingsHubOutlook')}
              connectLabel={t('outlookConnect')}
            />
            <ExportTargetSoonSetupBlock
              title={t('settingsHubApple')}
              connectLabel={t('appleConnect')}
            />
          </View>

          <View style={styles.row}>
            <AppButton
              title={t('setupBack')}
              variant="secondary"
              onPress={() => setStep(portalAvailable ? 1 : 0)}
              style={styles.flexBtn}
            />
            <AppButton
              title={t('setupSkip')}
              variant="ghost"
              onPress={() => void finish()}
              style={styles.flexBtn}
            />
            <AppButton title={t('setupFinish')} onPress={() => void finish()} style={styles.flexBtn} />
          </View>
        </AppCard>
      )}
    </ScrollView>
  );
}

function StepDot({
  n,
  active,
  done,
  label,
}: {
  n: number;
  active: boolean;
  done: boolean;
  label: string;
}) {
  return (
    <View style={styles.stepItem}>
      <View style={[styles.dot, active && styles.dotActive, done && styles.dotDone]}>
        <Text style={styles.dotText}>{done ? '✓' : n}</Text>
      </View>
      <Text style={[styles.stepLabel, active && styles.stepLabelActive]} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: theme.color.canvas },
  container: { padding: theme.space.lg, gap: theme.space.md, paddingBottom: 48 },
  steps: { flexDirection: 'row', gap: 4, marginVertical: 4 },
  stepItem: { flex: 1, alignItems: 'center', gap: 4 },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotActive: { backgroundColor: theme.color.primary },
  dotDone: { backgroundColor: theme.color.primaryPressed },
  dotText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  stepLabel: { fontSize: 11, color: theme.color.inkFaint, textAlign: 'center' },
  stepLabelActive: { color: theme.color.ink, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: theme.color.borderStrong,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.space.md,
    paddingVertical: 12,
    backgroundColor: theme.color.surfaceMuted,
    color: theme.color.ink,
    fontSize: 15,
  },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 },
  flexBtn: { flexGrow: 1, minWidth: 100 },
  optional: {
    color: theme.color.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  connected: {
    color: theme.color.inkSecondary,
    fontSize: 13,
  },
  warn: {
    color: theme.color.warn,
    fontSize: 12,
  },
  calTargets: { gap: 10, marginTop: 8 },
  calTargetOn: {
    gap: 8,
    padding: theme.space.md,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.color.borderStrong,
    backgroundColor: theme.color.surfaceMuted,
  },
  calTargetTitle: {
    color: theme.color.ink,
    fontWeight: '700',
    fontSize: 15,
  },
});
