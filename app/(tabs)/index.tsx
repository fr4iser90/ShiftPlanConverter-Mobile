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
  useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect, type Href } from 'expo-router';

import { t } from '@/src/i18n';
import { loadCredentials } from '@/src/loga3/credentials';
import { Loga3WebView } from '@/src/loga3/Loga3WebView';
import type { AutomationCommand, AutomationMessage } from '@/src/loga3/automation';
import { AutomationBridge } from '@/src/loga3/bridge';
import { runFetchJob } from '@/src/loga3/fetchJob';
import { convertPdfText, resolveStoredEntries } from '@/src/convert/pipeline';
import { getMappingForScope } from '@/src/packs';
import { getGoogleCalendarId, getSnapshot, setEntries, subscribe } from '@/src/state/store';
import { getSetupStatus, type SetupStatus } from '@/src/setup/status';
import {
  takeSmokeFetchIntent,
  peekSmokeFetchIntent,
  setMatrixStatus,
} from '@/src/setup/smokeFetchIntent';
import { loadQuickPrefs, type QuickUpdatePrefs } from '@/src/state/quickPrefs';
import {
  getLastSuccessfulFetchAt,
  isSyncOverdue,
  loadSchedulePrefs,
} from '@/src/schedule/prefs';
import { buildMonthWindow, formatMonthWindow } from '@/src/sync/monthWindow';
import { runQuickUpdate } from '@/src/sync/quickUpdate';
import { icsExportTarget } from '@/src/sync/targets/icsTarget';
import { AppButton } from '@/src/ui/AppButton';
import { AppCard, Meta, ScreenTitle, SectionTitle } from '@/src/ui/AppCard';
import { Screen } from '@/src/ui/Screen';
import { useTheme } from '@/src/ui/useTheme';
import type { AppTheme } from '@/src/ui/theme';

const SETUP_HREF = '/setup' as Href;
const CALENDAR_HREF = '/(tabs)/preview' as Href;
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
/** Persist collapsible LOGA3 WebView (default: open). */
const SHOW_WEB_KEY = 'loga3.showWebView';

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

function makeFetchStyles(theme: AppTheme) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.color.canvas },
    scrollFlex: { flex: 1, backgroundColor: theme.color.canvas },
    container: { padding: theme.space.lg, gap: theme.space.md, paddingBottom: 24 },
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
    monthChipTextOn: { color: theme.color.primaryText },
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
    webToggle: {
      marginTop: 4,
      paddingHorizontal: theme.space.md,
      paddingVertical: 12,
      backgroundColor: theme.color.primary,
      borderRadius: theme.radius.sm,
    },
    webToggleText: {
      color: theme.color.primaryText,
      fontWeight: '700',
      fontSize: 15,
    },
    webPanel: {
      backgroundColor: theme.color.surface,
      borderWidth: 2,
      borderColor: theme.color.primary,
      borderRadius: theme.radius.sm,
      overflow: 'hidden',
      minHeight: 200,
    },
    webPanelCollapsed: {
      height: 0,
      minHeight: 0,
      borderWidth: 0,
      overflow: 'hidden',
    },
    footerMeta: {
      ...theme.type.caption,
      color: theme.color.inkFaint,
    },
  });
}

export default function FetchScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeFetchStyles(theme), [theme]);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [, setTick] = useState(0);
  const [setup, setSetup] = useState<SetupStatus | null>(null);
  const [creds, setCreds] = useState<{ username: string; password: string } | null>(null);
  const [showWeb, setShowWeb] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [status, setStatus] = useState(t('statusReady'));
  const [busy, setBusy] = useState(false);
  const [webReady, setWebReady] = useState(false);
  const [webLayoutW, setWebLayoutW] = useState(windowWidth);
  const [selectedMonths, setSelectedMonths] = useState<number[]>([new Date().getMonth() + 1]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [quickPrefs, setQuickPrefs] = useState<QuickUpdatePrefs | null>(null);
  const [googleConfigured, setGoogleConfigured] = useState(false);
  const webRef = useRef<{ run: (cmd: AutomationCommand) => void; reload: () => void }>(null);
  const bridgeRef = useRef(new AutomationBridge());
  const readyRef = useRef(false);
  const schedulePromptedRef = useRef(false);
  const snap = getSnapshot();

  useEffect(() => {
    setWebLayoutW(windowWidth);
  }, [windowWidth]);

  useEffect(() => {
    void (async () => {
      const v = await AsyncStorage.getItem(SHOW_WEB_KEY);
      // default open; only collapse if user saved '0'
      if (v === '0') setShowWeb(false);
      else setShowWeb(true);
    })();
  }, []);

  const toggleShowWeb = useCallback(() => {
    if (busy) return;
    setShowWeb((prev) => {
      const next = !prev;
      void AsyncStorage.setItem(SHOW_WEB_KEY, next ? '1' : '0');
      return next;
    });
  }, [busy]);

  const webHostWidth = webLayoutW > 0 ? webLayoutW : windowWidth;

  useEffect(() => subscribe(() => setTick((n) => n + 1)), []);
  useEffect(() => {
    readyRef.current = webReady;
  }, [webReady]);

  const refreshSetup = useCallback(async () => {
    const st = await getSetupStatus();
    setSetup(st);
    setQuickPrefs(await loadQuickPrefs());
    setGoogleConfigured(!!(await getGoogleCalendarId()));
    if (st.complete) {
      const c = await loadCredentials();
      setCreds(c);
      return;
    }
    setCreds(null);
    // Dev-Smoke: .env → deep-link already seeds Secure Store. Never force Setup UI then.
    if (await peekSmokeFetchIntent()) return;
    router.push(SETUP_HREF);
  }, []);

  const packMapping = useMemo(() => {
    if (!snap.hospitalId || !snap.groupId || !snap.areaId) return null;
    return getMappingForScope(snap.hospitalId, snap.groupId, snap.areaId);
  }, [snap.hospitalId, snap.groupId, snap.areaId]);

  const quickWillSyncGoogle = !!(
    quickPrefs?.syncGoogle && googleConfigured
  );

  const quickWindowLabel = useMemo(() => {
    const p = quickPrefs || { prevMonths: 0, nextMonths: 2, syncGoogle: true, offerIcsAfterFetch: true };
    return formatMonthWindow(buildMonthWindow(p.prevMonths, p.nextMonths));
  }, [quickPrefs]);

  const shareIcsNow = () => {
    void (async () => {
      try {
        const mapping =
          snap.hospitalId && snap.groupId && snap.areaId
            ? getMappingForScope(snap.hospitalId, snap.groupId, snap.areaId) || undefined
            : undefined;
        const entries = resolveStoredEntries(snap.entries, {
          preset: snap.preset || undefined,
          mapping,
          userMappings: snap.userMappings,
        });
        const result = await icsExportTarget.sync(entries, {
          interactive: true,
          richDetails: snap.richDetails,
        });
        if (result.skipped && result.reason) {
          Alert.alert('ICS', result.reason);
        }
      } catch (e) {
        Alert.alert('ICS', String(e));
      }
    })();
  };

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

  /** Phone: login only + dump live LOGA3 selectors (no export / no Zeitprotokoll clicks). */
  const onDumpLiveSelectors = async () => {
    if (!setup?.complete || !creds) {
      Alert.alert(t('setupTitle'), t('setupIncomplete'));
      return;
    }
    setShowWeb(true);
    setBusy(true);
    setStatus('Live-Selektoren: WebView + Login…');
    try {
      await waitUntilReady();
      await warmBridge();
      const bridge = bridgeRef.current;
      const inject = (cmd: AutomationCommand) => webRef.current?.run(cmd);
      setStatus('Live-Selektoren: fillLogin…');
      await bridge.run(
        inject,
        { type: 'fillLogin', username: creds.username, password: creds.password },
        25000
      );
      await bridge.run(inject, { type: 'submitLogin' }, 20000);
      setStatus('Live-Selektoren: warte Shell…');
      const started = Date.now();
      while (Date.now() - started < 120000) {
        try {
          const st = await bridge.probe(inject, { type: 'assertShellReady' }, 15000);
          if (st.ok || st.oeffnenFound || st.pickerFound) break;
        } catch {
          // keep waiting
        }
        await bridge.delay(1500);
      }
      setStatus('Live-Selektoren: dump…');
      const dump = await bridge.probe(inject, { type: 'dumpLiveSelectors' }, 30000);
      const json = dump.sample || JSON.stringify({ note: dump.note, error: dump.error });
      const FileSystem = await import('expo-file-system/legacy');
      const base =
        FileSystem.cacheDirectory || FileSystem.documentDirectory || '';
      const path = `${base}loga3-live-selectors.json`;
      await FileSystem.writeAsStringAsync(path, json);
      // App-specific external dir is adb-pullable without run-as on many devices
      try {
        const ext = `${FileSystem.documentDirectory || ''}loga3-live-selectors.json`;
        if (ext !== path) await FileSystem.writeAsStringAsync(ext, json);
      } catch {
        // ignore
      }
      setStatus(`Live-Selektoren ok → ${dump.note || ''} · ${path}`);
      Alert.alert(
        'Live-Selektoren',
        `${dump.note || 'ok'}\n\nGespeichert.\nLogcat: LOGA3_LIVE_SELECTORS / [WebView]`
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(`Live-Selektoren Fehler: ${msg}`);
      Alert.alert('Live-Selektoren', msg);
    } finally {
      setBusy(false);
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
      // Phone WebViews often need >25s on first mount (GWT + 5G).
      const id = setInterval(() => {
        if (readyRef.current) {
          clearInterval(id);
          resolve();
        } else if (Date.now() - started > 90000) {
          clearInterval(id);
          reject(new Error(t('webViewNotReady')));
        }
      }, 200);
    });

  /** Ping the inject bridge once so a cold frame isn't first hit by assertShellReady. */
  const warmBridge = async () => {
    try {
      await bridgeRef.current.probe(
        (cmd) => webRef.current?.run(cmd),
        { type: 'assertLoggedIn' },
        20000
      );
    } catch {
      // silence is fine — fetchJob soft-probes until the outer budget
    }
  };

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
      await warmBridge();
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
        result.fetch.errors.length
          ? `Fehler:\n${result.fetch.errors.map((e) => `· ${e}`).join('\n')}`
          : null,
        ...result.targets.map((r) =>
          r.skipped
            ? `${r.id}: ${r.reason || '—'}`
            : `${r.id}: +${r.created || 0}/−${r.deleted || 0}`
        ),
      ].filter(Boolean);
      setStatus(parts.join(' · '));
      const buttons: {
        text: string;
        style?: 'cancel' | 'default';
        onPress?: () => void;
      }[] = [{ text: 'OK', style: 'cancel' }];
      if (result.offerIcs) {
        buttons.push({
          text: t('quickUpdateShareIcs'),
          onPress: () => shareIcsNow(),
        });
      }
      if (result.fetch.entries.length > 0) {
        router.replace(CALENDAR_HREF);
      }
      Alert.alert(t('quickUpdateDone'), parts.join('\n'), buttons);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(`Fehler: ${msg}`);
      Alert.alert(t('quickUpdate'), msg);
    } finally {
      setBusy(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      void refreshSetup();
      void (async () => {
        if (busy || schedulePromptedRef.current) return;
        const prefs = await loadSchedulePrefs();
        if (!prefs.promptOnOpen || prefs.intervalDays <= 0) return;
        const last = await getLastSuccessfulFetchAt();
        if (!isSyncOverdue(prefs, last)) return;
        schedulePromptedRef.current = true;
        Alert.alert(t('schedulePromptTitle'), t('schedulePromptBody'), [
          { text: t('schedulePromptNo'), style: 'cancel' },
          {
            text: t('schedulePromptYes'),
            onPress: () => {
              void onQuickUpdate();
            },
          },
        ]);
      })();
    }, [refreshSetup, busy, setup, creds, quickPrefs])
  );
;

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
    console.log(
      `MATRIX_FETCH_START months=${selectedMonths.join(',')} year=${year} layoutW=${webHostWidth}`
    );
    try {
      await waitUntilReady();
      await warmBridge();
      const result = await runFetchJob({
        username: creds.username,
        password: creds.password,
        months: selectedMonths,
        year,
        bridge: bridgeRef.current,
        inject: (cmd) => webRef.current?.run(cmd),
        onStatus: setStatus,
        replaceEntries: true,
        gateTrace: true,
      });
      const parts = [
        `${result.entries.length} Schichten`,
        result.savedPdfs.length ? `${result.savedPdfs.length} PDF(s)` : null,
        result.skippedNoPlan.length ? `NO_PLAN: ${result.skippedNoPlan.join(', ')}` : null,
        result.errors.length
          ? `Fehler:\n${result.errors.map((e) => `· ${e}`).join('\n')}`
          : null,
        result.gateTraces?.length ? `Gates: ${result.gateTraces.length}` : null,
      ].filter(Boolean);
      setStatus(parts.join(' · '));
      await setMatrixStatus(`MATRIX_FETCH_PASS ${parts.join(' · ')}`);
      if (result.entries.length > 0) {
        router.replace(CALENDAR_HREF);
      }
      Alert.alert(t('alertDone'), parts.join('\n'));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(`Fehler: ${msg}`);
      await setMatrixStatus(`MATRIX_FETCH_FAIL ${msg}`);
      Alert.alert(t('alertFetchFailed'), msg);
    } finally {
      setBusy(false);
    }
  };

  // Emulator matrix: deep-link smoke sets months + autofetch (AsyncStorage, polled)
  useEffect(() => {
    let cancelled = false;
    let started = false;

    const tryAutofetch = async () => {
      if (cancelled || started || busy) return;
      const pending = await peekSmokeFetchIntent();
      if (!pending?.autofetch) return;

      // Smoke may land before setup hydrate — refresh until complete
      const st = await getSetupStatus();
      if (!st.complete) {
        setSetup(st);
        return;
      }
      const c = await loadCredentials();
      if (!c?.username || !c.password) return;
      setSetup(st);
      setCreds(c);

      const intent = await takeSmokeFetchIntent();
      if (!intent?.autofetch) return;
      started = true;
      setSelectedMonths(intent.months);
      setYear(intent.year);
      const months = intent.months;
      const y = intent.year;
      await setMatrixStatus(`MATRIX_FETCH_START months=${months.join(',')} year=${y}`);
      setBusy(true);
      setShowWeb(true);
      setStatus(t('webViewStarting'));
      try {
        await waitUntilReady();
        await warmBridge();
        const result = await runFetchJob({
          username: c.username,
          password: c.password,
          months,
          year: y,
          bridge: bridgeRef.current,
          inject: (cmd) => webRef.current?.run(cmd),
          onStatus: setStatus,
          replaceEntries: true,
          gateTrace: true,
        });
        const parts = [
          `${result.entries.length} Schichten`,
          result.savedPdfs.length ? `${result.savedPdfs.length} PDF(s)` : null,
          result.skippedNoPlan.length ? `NO_PLAN: ${result.skippedNoPlan.join(', ')}` : null,
          result.errors.length
            ? `Fehler:\n${result.errors.map((e) => `· ${e}`).join('\n')}`
            : null,
          result.gateTraces?.length ? `Gates: ${result.gateTraces.length}` : null,
        ].filter(Boolean);
        setStatus(parts.join(' · '));
        await setMatrixStatus(`MATRIX_FETCH_PASS ${parts.join(' · ')}`);
        if (result.entries.length > 0) {
          router.replace(CALENDAR_HREF);
        }
        Alert.alert(t('alertDone'), parts.join('\n'));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setStatus(`Fehler: ${msg}`);
        await setMatrixStatus(`MATRIX_FETCH_FAIL ${msg}`);
        Alert.alert(t('alertFetchFailed'), msg);
      } finally {
        setBusy(false);
      }
    };

    void tryAutofetch();
    const iv = setInterval(() => {
      void tryAutofetch();
    }, 1500);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, []);

  if (!setup) {
    return (
      <Screen style={styles.center}>
        <ActivityIndicator color={theme.color.primary} />
      </Screen>
    );
  }

  if (!setup.complete) {
    return (
      <Screen style={styles.center}>
        <ScreenTitle>{t('setupRequired')}</ScreenTitle>
        <Meta>{t('setupRequiredHint')}</Meta>
        <AppButton title={t('openSetup')} onPress={() => router.push(SETUP_HREF)} />
      </Screen>
    );
  }

  const webLive = busy || showWeb;
  const webExpanded = busy || showWeb;
  const webPanelHeight = busy
    ? Math.max(320, Math.round(windowHeight * 0.55))
    : Math.max(280, Math.round(windowHeight * 0.42));

  return (
    <Screen style={styles.root}>
      <ScrollView
        style={styles.scrollFlex}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
      >
        <View style={styles.headerRow}>
          <View style={{ flex: 1, gap: 4 }}>
            <ScreenTitle>{t('tabFetch')} · WV</ScreenTitle>
            <Text style={styles.summary} numberOfLines={2}>
              {setup.summary || t('setupWorkplace')}
            </Text>
          </View>
          <AppButton
            title={t('editSetup')}
            variant="secondary"
            compact
            onPress={() => router.push(SETUP_HREF)}
            disabled={busy}
          />
        </View>

        {busy ? (
          <AppCard accent>
            <SectionTitle>{t('fetchRunning')}</SectionTitle>
            <Text style={styles.status}>Status: {status}</Text>
            <ActivityIndicator color={theme.color.primary} style={{ marginTop: 8 }} />
          </AppCard>
        ) : (
          <>
            <AppCard accent>
              <SectionTitle>{t('quickUpdate')}</SectionTitle>
              <Meta>{t('quickUpdateHint')}</Meta>
              <Text style={styles.windowLine}>
                {t('quickUpdateWindow')}: {quickWindowLabel}
                {' · '}
                {quickWillSyncGoogle ? t('quickUpdateGoogleOn') : t('quickUpdateGoogleOff')}
              </Text>
              <AppButton
                title={
                  quickWillSyncGoogle ? t('quickUpdateGoSync') : t('quickUpdateGo')
                }
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
                title={t('fetchSelected')}
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
                  title={t('convertFixture')}
                  variant="ghost"
                  onPress={() => void onConvertFixture()}
                  disabled={busy}
                />
                <AppButton
                  title="Live-Selektoren dump (Login only)"
                  variant="ghost"
                  onPress={() => void onDumpLiveSelectors()}
                  disabled={busy}
                />
              </AppCard>
            )}
          </>
        )}

        {/* Erweitert ↑  ·  WebView-Leiste  ·  0 Schichten ↓ */}
        <Pressable style={styles.webToggle} onPress={toggleShowWeb} disabled={busy}>
          <Text style={styles.webToggleText}>
            {webExpanded ? '▾ LOGA3 WebView' : '▸ LOGA3 WebView — antippen'}
            {busy ? ' · Fetch läuft' : webReady ? ' · bereit' : ' · lädt…'}
          </Text>
        </Pressable>
        <View
          style={[
            styles.webPanel,
            webExpanded ? { height: webPanelHeight } : styles.webPanelCollapsed,
          ]}
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            if (w > 1) setWebLayoutW(w);
          }}
          pointerEvents={webExpanded ? 'auto' : 'none'}
          accessibilityElementsHidden={!webExpanded}
        >
          <Loga3WebView
            ref={webRef}
            layoutWidth={webHostWidth}
            onMessage={onAutomationMessage}
            onReady={() => {
              setWebReady(true);
              readyRef.current = true;
            }}
          />
        </View>

        <Text style={styles.footerMeta}>
          {snap.entries.length} {t('entriesCount')}
          {selectedMonths.length
            ? ` · ${selectedMonths.map((m) => String(m).padStart(2, '0')).join(',')}/${year}`
            : ''}
        </Text>
      </ScrollView>
    </Screen>
  );
}
