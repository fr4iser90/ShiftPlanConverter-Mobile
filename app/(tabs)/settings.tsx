import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';

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

export default function SettingsScreen() {
  const [, setTick] = useState(0);
  const snap = getSnapshot();

  useEffect(() => subscribe(() => setTick((n) => n + 1)), []);

  const supportText = useMemo(() => {
    if (!snap.rawText) return '(kein Rohtext — zuerst Fixture/PDF konvertieren)';
    return buildSupportParserSample(snap.rawText, { maxChars: 900 });
  }, [snap.rawText]);

  const setLang = async (locale: AppLocale) => {
    await setLocale(locale);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.h1}>{t('tabSettings')}</Text>

      <Text style={styles.label}>{t('language')}</Text>
      <View style={styles.row}>
        <Button title="Deutsch" onPress={() => setLang('de')} />
        <Button title="English" onPress={() => setLang('en')} />
        <Text style={styles.meta}>[{snap.locale}]</Text>
      </View>

      <View style={styles.switchRow}>
        <Text>{t('richDetails')}</Text>
        <Switch value={snap.richDetails} onValueChange={(v) => setRichDetails(v)} />
      </View>

      <Text style={styles.label}>{t('supportSample')}</Text>
      <Text style={styles.sample}>{supportText}</Text>
      <Button
        title={t('copySupport')}
        onPress={async () => {
          try {
            await Clipboard.setStringAsync(supportText);
            Alert.alert('OK', 'In Zwischenablage kopiert.');
          } catch (e) {
            Alert.alert('Clipboard', String(e));
          }
        }}
      />

      <View style={{ height: 16 }} />
      <Button
        title={t('clearCreds')}
        color="#b91c1c"
        onPress={async () => {
          await clearCredentials();
          Alert.alert('OK', 'Zugangsdaten gelöscht.');
        }}
      />

      <Text style={styles.meta}>
        Builtin: St. Elisabeth · Pflege · OP · Anästhesie (isValidated)
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 10, paddingBottom: 40 },
  h1: { fontSize: 22, fontWeight: '700' },
  label: { fontWeight: '600', marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 8,
  },
  sample: {
    fontFamily: 'SpaceMono',
    fontSize: 11,
    backgroundColor: '#f1f5f9',
    padding: 10,
    borderRadius: 8,
    color: '#334155',
  },
  meta: { color: '#64748b', marginTop: 12, fontSize: 12 },
});
