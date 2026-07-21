import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { t } from '@/src/i18n';
import { getSnapshot, subscribe } from '@/src/state/store';
import { shareIcsFile } from '@/src/sync/shareIcs';
import {
  connectGoogle,
  hasGoogleClientConfig,
  isPrimaryCalendar,
  listCalendars,
  preferredCalendarId,
  syncEntriesToGoogle,
  type GoogleCalendar,
} from '@/src/sync/google';

export default function ExportScreen() {
  const [, setTick] = useState(0);
  const snap = getSnapshot();
  const [busy, setBusy] = useState(false);
  const [calendars, setCalendars] = useState<GoogleCalendar[]>([]);
  const [calendarId, setCalendarId] = useState<string | null>(null);
  const [primaryWarn, setPrimaryWarn] = useState(false);

  useEffect(() => subscribe(() => setTick((n) => n + 1)), []);

  const onShareIcs = async () => {
    try {
      setBusy(true);
      await shareIcsFile(snap.entries, { richDetails: snap.richDetails });
    } catch (e) {
      Alert.alert('ICS', String(e));
    } finally {
      setBusy(false);
    }
  };

  const onGoogleConnect = async () => {
    try {
      setBusy(true);
      if (!hasGoogleClientConfig()) {
        Alert.alert(
          'Google',
          'Client IDs fehlen. Kopiere .env.example → .env und setze EXPO_PUBLIC_GOOGLE_*_CLIENT_ID.'
        );
        return;
      }
      await connectGoogle();
      const list = await listCalendars();
      setCalendars(list);
      const preferred = await preferredCalendarId(list);
      setCalendarId(preferred);
      const selected = list.find((c) => c.id === preferred);
      setPrimaryWarn(!!selected && isPrimaryCalendar(selected));
      Alert.alert('Google', `${list.length} Kalender geladen.`);
    } catch (e) {
      Alert.alert('Google', String(e));
    } finally {
      setBusy(false);
    }
  };

  const onSync = async () => {
    if (!calendarId) {
      Alert.alert('Google', 'Bitte zuerst verbinden und Kalender wählen.');
      return;
    }
    try {
      setBusy(true);
      const n = await syncEntriesToGoogle(snap.entries, calendarId, {
        richDetails: snap.richDetails,
      });
      Alert.alert('Sync', `${n} Events geschrieben.`);
    } catch (e) {
      Alert.alert('Sync', String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.h1}>{t('tabExport')}</Text>
      <Text style={styles.meta}>{snap.entries.length} Einträge bereit</Text>

      <View style={styles.gap}>
        <Button title={t('exportIcs')} onPress={onShareIcs} disabled={busy || !snap.entries.length} />
        <Button title={t('googleConnect')} onPress={onGoogleConnect} disabled={busy} />
        <Button
          title={t('googleSync')}
          onPress={onSync}
          disabled={busy || !snap.entries.length || !calendarId}
        />
      </View>

      {primaryWarn && <Text style={styles.warn}>{t('primaryWarn')}</Text>}

      {calendars.length > 0 && (
        <View style={styles.list}>
          <Text style={styles.h2}>Kalender</Text>
          {calendars.map((c) => (
            <Button
              key={c.id}
              title={`${c.summary}${c.primary ? ' (primary)' : ''}${calendarId === c.id ? ' ✓' : ''}`}
              onPress={() => {
                setCalendarId(c.id);
                setPrimaryWarn(isPrimaryCalendar(c));
              }}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 10 },
  h1: { fontSize: 22, fontWeight: '700' },
  h2: { fontSize: 16, fontWeight: '600', marginTop: 8 },
  meta: { color: '#64748b' },
  gap: { gap: 10, marginTop: 12 },
  warn: {
    marginTop: 10,
    color: '#b45309',
    backgroundColor: '#fffbeb',
    padding: 10,
    borderRadius: 8,
  },
  list: { gap: 6, marginTop: 12 },
});
