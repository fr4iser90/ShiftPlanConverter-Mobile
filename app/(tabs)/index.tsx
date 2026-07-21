import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Button,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { t } from '@/src/i18n';
import {
  clearCredentials,
  loadCredentials,
  saveCredentials,
} from '@/src/loga3/credentials';
import { Loga3WebView } from '@/src/loga3/Loga3WebView';
import type { AutomationCommand, AutomationMessage } from '@/src/loga3/automation';
import { LOGA3_LOGIN_URL } from '@/src/loga3/automation';
import { AutomationBridge } from '@/src/loga3/bridge';
import { runFetchJob } from '@/src/loga3/fetchJob';
import { convertPdfText } from '@/src/convert/pipeline';
import {
  BUILTIN_AREA_ID,
  BUILTIN_GROUP_ID,
  BUILTIN_HOSPITAL_ID,
  BUILTIN_PRESET,
  getBuiltinPackConfig,
  listBuiltinPresets,
} from '@/src/packs';
import { getSnapshot, setEntries, setPreset, subscribe } from '@/src/state/store';

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

const FIXTURE_TEXT = [
  'Abrechnungsmonat 09/2026',
  'Zeitabrechnung',
  'Tag von bis Dauer Pause PEP',
  'Übertrag aus Vormonat 26,14',
  '11 Mo KO* 11:35 GE* 19:50 0,30 7,45 4,24 15,27 11,03 24,05',
  '14 Di KO* 07:35 GE* 15:50 0,30 7,45 4,24 7,45 3,21 27,26',
  '15 Mi KO* 07:35 GE* 15:50 0,30 7,45 4,24 7,45 3,21 30,47',
  '16 Do KO* 07:35 GE* 15:50 0,30 7,45 4,24 7,45 3,21 34,08',
  '17 Fr KO* 08:30 GE* 16:45 0,30 7,45 4,24 7,45 3,21 37,29',
].join('\n');

export default function FetchScreen() {
  const [, setTick] = useState(0);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showWeb, setShowWeb] = useState(false);
  const [status, setStatus] = useState(t('statusReady'));
  const [busy, setBusy] = useState(false);
  const [webReady, setWebReady] = useState(false);
  const [selectedMonths, setSelectedMonths] = useState<number[]>([new Date().getMonth() + 1]);
  const [year, setYear] = useState(new Date().getFullYear());
  const webRef = useRef<{ run: (cmd: AutomationCommand) => void; reload: () => void }>(null);
  const bridgeRef = useRef(new AutomationBridge());
  const readyRef = useRef(false);
  const snap = getSnapshot();

  useEffect(() => subscribe(() => setTick((n) => n + 1)), []);
  useEffect(() => {
    loadCredentials().then((c) => {
      if (c) {
        setUsername(c.username);
        setPassword(c.password);
      }
    });
  }, []);
  useEffect(() => {
    readyRef.current = webReady;
  }, [webReady]);

  const pack = useMemo(() => getBuiltinPackConfig(), []);
  const presets = useMemo(() => listBuiltinPresets(), []);

  const onSaveCreds = async () => {
    await saveCredentials({ username: username.trim(), password });
    Alert.alert('OK', 'Zugangsdaten im Secure Store gespeichert.');
  };

  const onConvertFixture = async () => {
    try {
      const result = convertPdfText(FIXTURE_TEXT, {
        preset: snap.preset || BUILTIN_PRESET,
        userMappings: snap.userMappings,
      });
      await setEntries(result.entries, { rawText: FIXTURE_TEXT, summary: result.summary });
      setStatus(
        `Offline-Fixture 09/2026: ${result.entries.length} Schichten (kein Live-Download)`
      );
      Alert.alert('Fixture (Offline)', `${result.entries.length} Einträge aus Sample 09/2026.`);
    } catch (e) {
      Alert.alert('Fehler', String(e));
    }
  };

  const onAutomationMessage = useCallback((msg: AutomationMessage) => {
    bridgeRef.current.handleMessage(msg);
    if (msg.type === 'pdfBlob') {
      setStatus(
        msg.ok
          ? `PDF erfasst (${msg.size || '?'} B)`
          : `PDF-Capture fehlgeschlagen: ${msg.error || '?'}`
      );
      return;
    }
    if (msg.error) {
      setStatus(`${msg.type || '?'}: ${msg.error}${msg.code ? ` [${msg.code}]` : ''}`);
    } else if (msg.type && msg.type !== 'pdfBlob') {
      setStatus(`${msg.type}: ok`);
    }
  }, []);

  const toggleMonth = (m: number) => {
    setSelectedMonths((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m].sort((a, b) => a - b)
    );
  };

  const waitUntilReady = (): Promise<void> =>
    new Promise((resolve, reject) => {
      if (readyRef.current) {
        resolve();
        return;
      }
      const started = Date.now();
      const id = setInterval(() => {
        if (readyRef.current) {
          clearInterval(id);
          resolve();
        } else if (Date.now() - started > 25000) {
          clearInterval(id);
          reject(new Error('WebView nicht bereit (Timeout). Bitte WebView öffnen / URL prüfen.'));
        }
      }, 200);
    });

  const onFetchSelected = async () => {
    if (!username.trim() || !password) {
      Alert.alert(
        'Keine Zugangsdaten',
        'Bitte Benutzername und Passwort speichern. Ohne Creds wird kein Fixture still geladen.'
      );
      setStatus('Abbruch: keine Zugangsdaten');
      return;
    }
    if (!selectedMonths.length) {
      Alert.alert('Monate', 'Mindestens einen Monat anhaken.');
      return;
    }

    setBusy(true);
    if (!showWeb) {
      readyRef.current = false;
      setWebReady(false);
    }
    setShowWeb(true);
    setStatus('WebView starten…');
    try {
      await waitUntilReady();
      const result = await runFetchJob({
        username: username.trim(),
        password,
        months: selectedMonths,
        year,
        bridge: bridgeRef.current,
        inject: (cmd) => webRef.current?.run(cmd),
        onStatus: setStatus,
        replaceEntries: true,
      });
      const parts = [
        `${result.entries.length} Schichten`,
        result.savedPdfs.length ? `${result.savedPdfs.length} PDF(s)` : null,
        result.skippedNoPlan.length ? `NO_PLAN: ${result.skippedNoPlan.join(', ')}` : null,
        result.errors.length ? `Fehler: ${result.errors.length}` : null,
      ].filter(Boolean);
      setStatus(parts.join(' · '));
      Alert.alert('Fertig', parts.join('\n'));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(`Fehler: ${msg}`);
      Alert.alert('Fetch fehlgeschlagen', msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.h1}>{t('loginTitle')}</Text>
      <Text style={styles.hint}>
        {t('webviewHint')}
        {'\n'}
        URL: {LOGA3_LOGIN_URL || '(EXPO_PUBLIC_LOGA3_URL fehlt — .env setzen)'}
      </Text>

      <TextInput
        style={styles.input}
        placeholder={t('username')}
        autoCapitalize="none"
        value={username}
        onChangeText={setUsername}
      />
      <TextInput
        style={styles.input}
        placeholder={t('password')}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <View style={styles.row}>
        <Button title={t('saveCredentials')} onPress={onSaveCreds} disabled={busy} />
        <Button
          title={t('clearCreds')}
          color="#b91c1c"
          disabled={busy}
          onPress={async () => {
            await clearCredentials();
            setUsername('');
            setPassword('');
          }}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>{t('hospital')}</Text>
        <Text>
          {pack.name} · {BUILTIN_HOSPITAL_ID}
        </Text>
        <Text>
          {t('area')}: {BUILTIN_GROUP_ID} / {BUILTIN_AREA_ID}
        </Text>
        <Text>
          {t('preset')}: {snap.preset}
        </Text>
        <View style={styles.rowWrap}>
          {presets.map((p) => (
            <Button
              key={p}
              title={p}
              disabled={busy}
              onPress={() => setPreset(p)}
              color={snap.preset === p ? '#0f766e' : undefined}
            />
          ))}
        </View>
      </View>

      <Text style={styles.h2}>{t('selectMonths')}</Text>
      <View style={styles.rowWrap}>
        {MONTHS.map((m) => (
          <Button
            key={m}
            title={String(m).padStart(2, '0')}
            disabled={busy}
            onPress={() => toggleMonth(m)}
            color={selectedMonths.includes(m) ? '#0f766e' : '#64748b'}
          />
        ))}
      </View>
      <TextInput
        style={styles.input}
        keyboardType="number-pad"
        editable={!busy}
        value={String(year)}
        onChangeText={(v) => setYear(Number(v) || year)}
      />

      <View style={styles.gap}>
        <Button
          title={busy ? t('fetchRunning') : t('fetchSelected')}
          onPress={onFetchSelected}
          disabled={busy}
          color="#0f766e"
        />
        {busy && (
          <View style={styles.busyRow}>
            <ActivityIndicator />
            <Text style={styles.meta}>{t('fetchRunning')}</Text>
          </View>
        )}
        <Button
          title={showWeb ? 'WebView ausblenden' : t('openWebView')}
          onPress={() => setShowWeb((v) => !v)}
          disabled={busy}
        />
        <Button
          title={t('convertFixture')}
          onPress={onConvertFixture}
          disabled={busy}
          color="#64748b"
        />
        <Button
          title={t('automationStub')}
          disabled={busy}
          onPress={() => {
            setShowWeb(true);
            setTimeout(() => {
              webRef.current?.run({ type: 'stubStatus' });
              if (username && password) {
                webRef.current?.run({
                  type: 'fillLogin',
                  username: username.trim(),
                  password,
                });
              }
              if (selectedMonths[0]) {
                webRef.current?.run({
                  type: 'selectMonth',
                  month: selectedMonths[0],
                  year,
                });
              }
              webRef.current?.run({ type: 'probeReady' });
            }, 800);
          }}
        />
      </View>

      {/* Keep WebView mounted during jobs even if "hidden" — zero height still mounts */}
      {(showWeb || busy) && (
        <View style={{ height: showWeb ? 360 : 1, marginTop: 12, opacity: showWeb ? 1 : 0 }}>
          <Loga3WebView
            ref={webRef}
            onMessage={onAutomationMessage}
            onReady={() => {
              setWebReady(true);
              readyRef.current = true;
            }}
          />
        </View>
      )}

      <Text style={styles.status}>Status: {status}</Text>
      <Text style={styles.meta}>
        Einträge im Store: {snap.entries.length}
        {selectedMonths.length
          ? ` · Auswahl: ${selectedMonths.map((m) => String(m).padStart(2, '0')).join(',')}/${year}`
          : ''}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 8, paddingBottom: 40 },
  h1: { fontSize: 22, fontWeight: '700', marginBottom: 4 },
  h2: { fontSize: 16, fontWeight: '600', marginTop: 12 },
  hint: { color: '#64748b', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginVertical: 8 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 6 },
  card: {
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  gap: { gap: 8, marginTop: 12 },
  busyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  status: { marginTop: 12, fontSize: 12, color: '#334155' },
  meta: { fontSize: 12, color: '#64748b' },
});
