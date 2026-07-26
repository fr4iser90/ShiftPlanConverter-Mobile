/**
 * Shared Google connect / calendar pick / sync UI (Export + Settings).
 */
import { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { t } from '@/src/i18n';
import { resolveStoredEntries } from '@/src/convert/pipeline';
import { getMappingForScope } from '@/src/packs';
import {
  getGoogleCalendarId,
  getSnapshot,
  setGoogleCalendarId,
} from '@/src/state/store';
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
import { openErrorReportMail } from '@/src/support/mailto';
import { AppButton } from '@/src/ui/AppButton';
import { AppCard, Meta, SectionTitle } from '@/src/ui/AppCard';
import { GoogleCalendarPicker } from '@/src/ui/GoogleCalendarPicker';
import { useTheme } from '@/src/ui/useTheme';
import type { AppTheme } from '@/src/ui/theme';

function makeStyles(theme: AppTheme) {
  return StyleSheet.create({
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

type Props = {
  /** Show sync button (needs entries). Default true. */
  showSync?: boolean;
  title?: string;
  hint?: string;
};

export function GoogleSyncCard({
  showSync = true,
  title,
  hint,
}: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const snap = getSnapshot();
  const [busy, setBusy] = useState(false);
  const [calendars, setCalendars] = useState<GoogleCalendar[]>([]);
  const [calendarId, setCalendarId] = useState<string | null>(null);
  const [primaryWarn, setPrimaryWarn] = useState(false);
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);

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
        source: 'settings',
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
      const msg = String(e);
      Alert.alert(t('syncTitle'), msg, [
        { text: 'OK', style: 'cancel' },
        {
          text: t('reportError'),
          onPress: () => {
            void openErrorReportMail({ error: msg, context: 'Settings / Google sync' }).catch(
              (err) =>
                Alert.alert(
                  t('reportError'),
                  t('reportErrorFailed', {
                    msg: err instanceof Error ? err.message : String(err),
                  })
                )
            );
          },
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const hasEntries = snap.entries.length > 0;
  const selectedSummary =
    calendars.find((c) => c.id === calendarId)?.summary ||
    (calendarId ? calendarId.split('@')[0] : null);

  return (
    <AppCard>
      <SectionTitle>{title || t('exportGoogleSection')}</SectionTitle>
      <Meta>{hint || t('exportGoogleHint')}</Meta>
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
      {showSync ? (
        <AppButton
          title={t('googleSync')}
          variant="soft"
          onPress={() => void onSync()}
          disabled={busy || !hasEntries || !calendarId}
        />
      ) : null}
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
  );
}
