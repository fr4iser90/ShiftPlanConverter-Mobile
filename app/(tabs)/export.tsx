import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { t } from '@/src/i18n';
import { getSnapshot, subscribe } from '@/src/state/store';
import { resolveStoredEntries } from '@/src/convert/pipeline';
import { getMappingForScope } from '@/src/packs';
import { shareIcsFile } from '@/src/sync/shareIcs';
import {
  connectGoogle,
  isPrimaryCalendar,
  listCalendars,
  preferredCalendarId,
  syncEntriesToGoogle,
  type GoogleCalendar,
} from '@/src/sync/google';
import { AppButton } from '@/src/ui/AppButton';
import { AppCard, Meta, ScreenTitle, SectionTitle } from '@/src/ui/AppCard';
import { theme } from '@/src/ui/theme';

export default function ExportScreen() {
  const [, setTick] = useState(0);
  const snap = getSnapshot();
  const [busy, setBusy] = useState(false);
  const [calendars, setCalendars] = useState<GoogleCalendar[]>([]);
  const [calendarId, setCalendarId] = useState<string | null>(null);
  const [primaryWarn, setPrimaryWarn] = useState(false);

  useEffect(() => subscribe(() => setTick((n) => n + 1)), []);

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
      const list = await listCalendars();
      setCalendars(list);
      const preferred = await preferredCalendarId(list);
      setCalendarId(preferred);
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
      const { created, deleted } = await syncEntriesToGoogle(resolvedEntries(), calendarId, {
        richDetails: snap.richDetails,
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

  return (
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
        <AppButton
          title={t('googleConnect')}
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
        {calendars.length > 0 && (
          <View style={styles.list}>
            <Text style={styles.listTitle}>{t('pickCalendar')}</Text>
            {calendars.map((c) => (
              <AppButton
                key={c.id}
                compact
                variant={calendarId === c.id ? 'soft' : 'secondary'}
                title={`${c.summary}${c.primary ? ' (primary)' : ''}${
                  calendarId === c.id ? ' ✓' : ''
                }`}
                onPress={() => {
                  setCalendarId(c.id);
                  setPrimaryWarn(isPrimaryCalendar(c));
                }}
              />
            ))}
          </View>
        )}
      </AppCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: theme.color.canvas },
  container: { padding: theme.space.lg, gap: theme.space.md, paddingBottom: 40 },
  warn: {
    marginTop: 4,
    color: theme.color.warn,
    backgroundColor: theme.color.warnSoft,
    padding: 10,
    borderRadius: theme.radius.sm,
    fontSize: 12,
  },
  list: { gap: 6, marginTop: 8 },
  listTitle: { ...theme.type.caption, color: theme.color.inkSecondary, fontWeight: '600' },
});
