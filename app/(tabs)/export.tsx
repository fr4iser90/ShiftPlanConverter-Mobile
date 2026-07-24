import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { t } from '@/src/i18n';
import {
  getGoogleCalendarId,
  getSnapshot,
  setGoogleCalendarId,
  subscribe,
} from '@/src/state/store';
import { resolveStoredEntries } from '@/src/convert/pipeline';
import { getMappingForScope } from '@/src/packs';
import { shareIcsFile } from '@/src/sync/shareIcs';
import {
  connectGoogle,
  getGoogleAccountEmail,
  hasGoogleSession,
  isPrimaryCalendar,
  listCalendars,
  preferredCalendarId,
  restoreGoogleSession,
  syncEntriesToGoogle,
  type GoogleCalendar,
} from '@/src/sync/google';
import { askRecreateGoogleCalendar } from '@/src/sync/askRecreateGoogleCalendar';
import { AppButton } from '@/src/ui/AppButton';
import { AppCard, Meta, ScreenTitle, SectionTitle } from '@/src/ui/AppCard';
import { GoogleCalendarPicker } from '@/src/ui/GoogleCalendarPicker';
import { Screen } from '@/src/ui/Screen';
import { useTheme } from '@/src/ui/useTheme';
import type { AppTheme } from '@/src/ui/theme';

function makeExportStyles(theme: AppTheme) {
  return StyleSheet.create({
    scroll: { flex: 1, backgroundColor: theme.color.canvas },
    container: { padding: theme.space.lg, gap: theme.space.md, paddingBottom: 40 },
    connected: {
      color: theme.color.inkSecondary,
      fontSize: 13,
    },
    warn: {
      marginTop: 4,
      color: theme.color.warn,
      backgroundColor: theme.color.warnSoft,
      padding: 10,
      borderRadius: theme.radius.sm,
      fontSize: 12,
    },
  });
}

export default function ExportScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeExportStyles(theme), [theme]);
  const [, setTick] = useState(0);
  const snap = getSnapshot();
  const [busy, setBusy] = useState(false);
  const [calendars, setCalendars] = useState<GoogleCalendar[]>([]);
  const [calendarId, setCalendarId] = useState<string | null>(null);
  const [primaryWarn, setPrimaryWarn] = useState(false);
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);

  useEffect(() => subscribe(() => setTick((n) => n + 1)), []);

  const hydrateGoogle = useCallback(async () => {
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
      // keep stored calendar id
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void hydrateGoogle();
    }, [hydrateGoogle])
  );

  const resolvedEntries = () => {
    const mapping =
      snap.hospitalId && snap.groupId && snap.areaId
        ? getMappingForScope(snap.hospitalId, snap.groupId, snap.areaId) || undefined
        : undefined;
    return resolveStoredEntries(snap.entries, {
      preset: snap.preset || undefined,
      mapping,
      userMappings: snap.userMappings,
    });
  };

  const onShareIcs = async () => {
    try {
      setBusy(true);
      await shareIcsFile(resolvedEntries(), { richDetails: snap.richDetails });
    } catch (e) {
      Alert.alert('ICS', String(e));
    } finally {
      setBusy(false);
    }
  };

  const onGoogleConnect = async () => {
    try {
      setBusy(true);
      await connectGoogle();
      setGoogleEmail(getGoogleAccountEmail());
      const list = await listCalendars();
      setCalendars(list);
      const preferred = await preferredCalendarId(list);
      setCalendarId(preferred);
      if (preferred) await setGoogleCalendarId(preferred);
      const selected = list.find((c) => c.id === preferred);
      setPrimaryWarn(!!selected && isPrimaryCalendar(selected));
      Alert.alert('Google', t('googleCalendarsLoaded', { count: list.length }));
    } catch (e) {
      Alert.alert('Google', String(e));
    } finally {
      setBusy(false);
    }
  };

  const onSync = async () => {
    if (!calendarId) {
      Alert.alert('Google', t('googleConnectFirst'));
      return;
    }
    try {
      setBusy(true);
      if (!hasGoogleSession()) {
        await restoreGoogleSession();
        if (!hasGoogleSession()) await connectGoogle();
        setGoogleEmail(getGoogleAccountEmail());
      }
      const { created, deleted } = await syncEntriesToGoogle(resolvedEntries(), calendarId, {
        richDetails: snap.richDetails,
        onCalendarMissing: async (oldId) => {
          const next = await askRecreateGoogleCalendar(oldId);
          if (next) {
            setCalendarId(next);
            try {
              setCalendars(await listCalendars());
            } catch {
              // list optional
            }
          }
          return next;
        },
      });
      const body = deleted
        ? `${t('syncDone', { created })}\n${t('syncDeleted', { deleted })}`
        : t('syncDone', { created });
      Alert.alert(t('syncTitle'), body);
    } catch (e) {
      Alert.alert(t('syncTitle'), String(e));
    } finally {
      setBusy(false);
    }
  };

  const hasEntries = snap.entries.length > 0;
  const selectedSummary =
    calendars.find((c) => c.id === calendarId)?.summary ||
    (calendarId ? calendarId.split('@')[0] : null);

  return (
    <Screen>
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <ScreenTitle>{t('tabExport')}</ScreenTitle>
      <Meta>
        {hasEntries
          ? t('exportReady', { count: snap.entries.length })
          : t('exportEmpty')}
      </Meta>

      <AppCard>
        <SectionTitle>{t('exportIcsSection')}</SectionTitle>
        <Meta>{t('exportIcsHint')}</Meta>
        <AppButton
          title={t('exportIcs')}
          variant="secondary"
          onPress={() => void onShareIcs()}
          disabled={busy || !hasEntries}
          busy={busy}
        />
      </AppCard>

      <AppCard>
        <SectionTitle>{t('exportGoogleSection')}</SectionTitle>
        <Meta>{t('exportGoogleHint')}</Meta>
        {googleEmail ? (
          <Text style={styles.connected}>{t('googleConnectedAs', { email: googleEmail })}</Text>
        ) : null}
        {selectedSummary && calendars.length === 0 ? (
          <Text style={styles.connected}>
            {t('googleCalendarSaved', { name: selectedSummary })}
          </Text>
        ) : null}
        <AppButton
          title={googleEmail || calendarId ? t('googleReconnect') : t('googleConnect')}
          onPress={() => void onGoogleConnect()}
          disabled={busy}
          busy={busy}
        />
        <AppButton
          title={t('googleSync')}
          variant="soft"
          onPress={() => void onSync()}
          disabled={busy || !hasEntries || !calendarId}
        />
        {primaryWarn && <Text style={styles.warn}>{t('primaryWarn')}</Text>}
        {(calendars.length > 0 || googleEmail) && (
          <GoogleCalendarPicker
            calendars={calendars}
            calendarId={calendarId}
            onChange={(list, id) => {
              setCalendars(list);
              setCalendarId(id);
              const selected = list.find((c) => c.id === id);
              setPrimaryWarn(!!selected && isPrimaryCalendar(selected));
            }}
          />
        )}
      </AppCard>
    </ScrollView>
    </Screen>
  );
}
