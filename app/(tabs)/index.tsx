import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useFocusEffect, type Href } from 'expo-router';

import { t } from '@/src/i18n';
import { loadCredentials } from '@/src/loga3/credentials';
import { Loga3WebView } from '@/src/loga3/Loga3WebView';
import type { AutomationCommand, AutomationMessage } from '@/src/loga3/automation';
import { AutomationBridge } from '@/src/loga3/bridge';
import { runFetchJob } from '@/src/loga3/fetchJob';
import { convertPdfText } from '@/src/convert/pipeline';
import { getMappingForScope } from '@/src/packs';
import { getSnapshot, setEntries, subscribe } from '@/src/state/store';
import { getSetupStatus, type SetupStatus } from '@/src/setup/status';
import { loadQuickPrefs, type QuickUpdatePrefs } from '@/src/state/quickPrefs';
import { buildMonthWindow, formatMonthWindow } from '@/src/sync/monthWindow';
import { runQuickUpdate } from '@/src/sync/quickUpdate';
import { AppButton } from '@/src/ui/AppButton';
import { AppCard, Meta, ScreenTitle, SectionTitle } from '@/src/ui/AppCard';
import { theme } from '@/src/ui/theme';

const SETUP_HREF = '/setup' as Href;
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
  const [setup, setSetup] = useState<SetupStatus | null>(null);
  const [creds, setCreds] = useState<{ username: string; password: string } | null>(null);
  const [showWeb, setShowWeb] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [status, setStatus] = useState(t('statusReady'));
  const [busy, setBusy] = useState(false);
  const [webReady, setWebReady] = useState(false);
  const [selectedMonths, setSelectedMonths] = useState<number[]>([new Date().getMonth() + 1]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [quickPrefs, setQuickPrefs] = useState<QuickUpdatePrefs | null>(null);
  const webRef = useRef<{ run: (cmd: AutomationCommand) => void; reload: () => void }>(null);
  const bridgeRef = useRef(new AutomationBridge());
  const readyRef = useRef(false);
  const snap = getSnapshot();

  useEffect(() => subscribe(() => setTick((n) => n + 1)), []);
  useEffect(() => {
    readyRef.current = webReady;
  }, [webReady]);

  const refreshSetup = useCallback(async () => {
    const st = await getSetupStatus();
    setSetup(st);
    setQuickPrefs(await loadQuickPrefs());
    if (st.complete) {
      const c = await loadCredentials();
      setCreds(c);
    } else {
      setCreds(null);
      router.push(SETUP_HREF);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshSetup();
    }, [refreshSetup])
  );

  const packMapping = useMemo(() => {
    if (!snap.hospitalId || !snap.groupId || !snap.areaId) return null;
    return getMappingForScope(snap.hospitalId, snap.groupId, snap.areaId);
  }, [snap.hospitalId, snap.groupId, snap.areaId]);

  const quickWindowLabel = useMemo(() => {
    const p = quickPrefs || { prevMonths: 0, nextMonths: 2, syncGoogle: true };
    return formatMonthWindow(buildMonthWindow(p.prevMonths, p.nextMonths));
  }, [quickPrefs]);

  const onConvertFixture = async () => {
    if (!setup?.complete || !packMapping || !snap.preset) {
      Alert.alert(t('setupTitle'), t('setupIncomplete'));
      return;
    }
    try {
      const result = convertPdfText(FIXTURE_TEXT, {
        preset: snap.preset,
        mapping: packMapping,
        userMappings: snap.userMappings,
      });
      await setEntries(result.entries, {
        rawText: FIXTURE_TEXT,
        summary: result.summary,
        summaries: result.summaries,
      });
      setStatus(`Offline-Fixture: ${result.entries.length} Schichten`);
      Alert.alert('Fixture', t('fixtureLoaded', { count: result.entries.length }));
    } catch (e) {
      Alert.alert(t('alertError'), String(e));
    }
  };

  const onAutomationMessage = useCallback((msg: AutomationMessage) => {
    bridgeRef.current.handleMessage(msg);
    if (msg.type === 'pdfBlob') {
      setStatus(
        msg.ok
          ? t('pdfCaptured', {
              size: msg.size || '?',
              note: msg.note ? `, ${msg.note}` : '',
            })
          : t('pdfCaptureFailed', { error: msg.error || '?' })
      );
      return;
    }
    const detail = [msg.error, msg.code, msg.note].filter(Boolean).join(' · ');
    if (msg.type) setStatus(`${msg.type}${detail ? `: ${detail}` : ''}`);
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
          reject(new Error(t('webViewNotReady')));
        }
      }, 200);
    });

  const onQuickUpdate = async () => {
    if (!setup?.complete || !creds) {
      Alert.alert(t('setupTitle'), t('setupIncomplete'));
      router.push(SETUP_HREF);
      return;
    }
    setBusy(true);
    setShowWeb(true);
    setStatus(t('quickUpdateRunning'));
    try {
      await waitUntilReady();
      const prefs = quickPrefs || (await loadQuickPrefs());
      const result = await runQuickUpdate({
        username: creds.username,
        password: creds.password,
        bridge: bridgeRef.current,
        inject: (cmd) => webRef.current?.run(cmd),
        onStatus: setStatus,
        prefs,
      });
      const parts = [
        result.windowLabel,
        `${result.fetch.entries.length} Schichten`,
        result.fetch.savedPdfs.length ? `${result.fetch.savedPdfs.length} PDF(s)` : null,
        result.fetch.skippedNoPlan.length
          ? `NO_PLAN: ${result.fetch.skippedNoPlan.join(', ')}`
          : null,
        result.fetch.errors.length ? `Fehler: ${result.fetch.errors.length}` : null,
        result.google.skipped
          ? `Google: ${result.google.reason || '—'}`
          : `Google: +${result.google.created || 0}/−${result.google.deleted || 0}`,
      ].filter(Boolean);
      setStatus(parts.join(' · '));
      Alert.alert(t('quickUpdateDone'), parts.join('\n'));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(`Fehler: ${msg}`);
      Alert.alert(t('quickUpdate'), msg);
    } finally {
      setBusy(false);
    }
  };

  const onFetchSelected = async () => {
    if (!setup?.complete || !creds) {
      Alert.alert(t('setupTitle'), t('setupIncomplete'));
      router.push(SETUP_HREF);
      return;
    }
    if (!selectedMonths.length) {
      Alert.alert(t('selectMonths'), t('setupPickMonth'));
      return;
    }

    setBusy(true);
    setShowWeb(true);
    setStatus(t('webViewStarting'));
    try {
      await waitUntilReady();
      const result = await runFetchJob({
        username: creds.username,
        password: creds.password,
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
      Alert.alert(t('alertDone'), parts.join('\n'));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(`Fehler: ${msg}`);
      Alert.alert(t('alertFetchFailed'), msg);
    } finally {
      setBusy(false);
    }
  };

  if (!setup) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.color.primary} />
      </View>
    );
  }

  if (!setup.complete) {
    return (
      <View style={styles.center}>
        <ScreenTitle>{t('setupRequired')}</ScreenTitle>
        <Meta>{t('setupRequiredHint')}</Meta>
        <AppButton title={t('openSetup')} onPress={() => router.push(SETUP_HREF)} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled">
      <View style={styles.headerRow}>
        <View style={{ flex: 1, gap: 4 }}>
          <ScreenTitle>{t('tabFetch')}</ScreenTitle>
          <Text style={styles.summary} numberOfLines={2}>
            {setup.summary || t('setupWorkplace')}
          </Text>
        </View>
        <AppButton
          title={t('editSetup')}
          variant="secondary"
          compact
          onPress={() => router.push(SETUP_HREF)}
        />
      </View>

      <AppCard accent>
        <SectionTitle>{t('quickUpdate')}</SectionTitle>
        <Meta>{t('quickUpdateHint')}</Meta>
        <Text style={styles.windowLine}>
          {t('quickUpdateWindow')}: {quickWindowLabel}
          {' · '}
          {quickPrefs?.syncGoogle ? t('quickUpdateGoogleOn') : t('quickUpdateGoogleOff')}
        </Text>
        <AppButton
          title={busy ? t('quickUpdateRunning') : t('quickUpdateGo')}
          onPress={() => void onQuickUpdate()}
          disabled={busy}
          busy={busy}
        />
      </AppCard>

      <AppCard>
        <SectionTitle>{t('selectMonths')}</SectionTitle>
        <Meta>{t('fetchHint')}</Meta>
        <View style={styles.monthGrid}>
          {MONTHS.map((m) => {
            const on = selectedMonths.includes(m);
            return (
              <Pressable
                key={m}
                disabled={busy}
                onPress={() => toggleMonth(m)}
                style={[styles.monthChip, on && styles.monthChipOn]}>
                <Text style={[styles.monthChipText, on && styles.monthChipTextOn]}>
                  {String(m).padStart(2, '0')}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <TextInput
          style={styles.input}
          keyboardType="number-pad"
          editable={!busy}
          value={String(year)}
          onChangeText={(v) => setYear(Number(v) || year)}
        />
        <AppButton
          title={busy ? t('fetchRunning') : t('fetchSelected')}
          variant="secondary"
          onPress={() => void onFetchSelected()}
          disabled={busy}
        />
        <Text style={styles.status}>Status: {status}</Text>
      </AppCard>

      <Pressable onPress={() => setShowAdvanced((v) => !v)} style={styles.advancedToggle}>
        <Text style={styles.advancedToggleText}>
          {showAdvanced ? `▾ ${t('advanced')}` : `▸ ${t('advanced')}`}
        </Text>
      </Pressable>
      {showAdvanced && (
        <AppCard>
          <AppButton
            title={showWeb ? t('hideWebView') : t('openWebView')}
            variant="secondary"
            onPress={() => setShowWeb((v) => !v)}
            disabled={busy}
          />
          <AppButton
            title={t('convertFixture')}
            variant="ghost"
            onPress={() => void onConvertFixture()}
            disabled={busy}
          />
        </AppCard>
      )}

      {(showWeb || busy) && (
        <View style={styles.webWrap}>
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

      <Text style={styles.footerMeta}>
        {snap.entries.length} {t('entriesCount')}
        {selectedMonths.length
          ? ` · ${selectedMonths.map((m) => String(m).padStart(2, '0')).join(',')}/${year}`
          : ''}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: theme.color.canvas },
  container: { padding: theme.space.lg, gap: theme.space.md, paddingBottom: 48 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.space.xl,
    gap: theme.space.md,
    backgroundColor: theme.color.canvas,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.space.sm,
  },
  summary: {
    ...theme.type.meta,
    color: theme.color.inkSecondary,
    fontWeight: '600',
  },
  windowLine: {
    ...theme.type.caption,
    color: theme.color.primary,
    fontWeight: '600',
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  monthChip: {
    width: 48,
    height: 40,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthChipOn: {
    backgroundColor: theme.color.primary,
    borderColor: theme.color.primary,
  },
  monthChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.color.inkSecondary,
  },
  monthChipTextOn: { color: '#fff' },
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
  status: {
    ...theme.type.caption,
    color: theme.color.inkMuted,
    marginTop: 4,
  },
  advancedToggle: { paddingVertical: 4 },
  advancedToggleText: {
    ...theme.type.caption,
    color: theme.color.inkMuted,
  },
  webWrap: {
    height: 360,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  footerMeta: {
    ...theme.type.caption,
    color: theme.color.inkFaint,
  },
});
