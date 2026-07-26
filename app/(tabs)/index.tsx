import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
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
import { loadCredentials } from '@/src/sources/loga3/credentials';
import { Loga3WebView } from '@/src/sources/loga3/Loga3WebView';
import type { AutomationCommand, AutomationMessage } from '@/src/sources/loga3/automation';
import { AutomationBridge } from '@/src/sources/webview/bridge';
import { resolveStoredEntries } from '@/src/convert/pipeline';
import { getMappingForScope, getPackById, isSourceSupportedByPack } from '@/src/packs';
import { ingestArtifacts } from '@/src/ingest/ingestArtifacts';
import { ensureBiometricUnlocked } from '@/src/security/biometric';
import { getGoogleCalendarId, getSnapshot, subscribeKeys } from '@/src/state/store';
import { getSetupStatus, type SetupStatus } from '@/src/setup/status';
import {
  takeSmokeFetchIntent,
  peekSmokeFetchIntent,
  setMatrixStatus,
} from '@/src/setup/smokeFetchIntent';
import { takeOcrSmokeIntent, peekOcrSmokeIntent } from '@/src/setup/ocrSmokeIntent';
import { resolveActiveSourceId, saveActiveSourceId } from '@/src/state/activeSource';
import { loadOcrLayoutId, saveOcrLayoutId } from '@/src/state/ocrLayout';
import { loadQuickPrefs, type QuickUpdatePrefs } from '@/src/state/quickPrefs';
import {
  getLastSuccessfulFetchAt,
  isSyncOverdue,
  loadSchedulePrefs,
} from '@/src/schedule/prefs';
import { buildMonthWindow, formatMonthWindow, ymKey, type YearMonth } from '@/src/sync/monthWindow';
import { runQuickUpdate } from '@/src/sync/quickUpdate';
import { listSourcesForPack } from '@/src/sources';
import { runCameraOcr } from '@/src/sources/cameraOcr';
import {
  captureOcrImage,
  consumeOcrPickerLaunchPending,
  isDocumentScannerAvailable,
  noteOcrPickerLaunch,
  takePendingOcrImageUri,
  type OcrCaptureMode,
} from '@/src/sources/ocr/capture';
import {
  DEFAULT_OCR_LAYOUT_ID,
  listOcrLayouts,
  type OcrLayoutId,
} from '@/src/sources/ocr/layouts';
import type { MonthMatrixGrid } from '@/src/sources/ocr/monthMatrix';
import {
  loadOcrPreferredName,
  saveOcrPreferredName,
} from '@/src/state/ocrPreferredName';
import { rememberOcrNameAlias } from '@/src/state/ocrNameAliases';
import { resolveConfirmedRosterLabel } from '@/src/sources/ocr/names';
import { OcrCompareReview } from '@/src/ui/OcrCompareReview';
import { runSourceAndIngest } from '@/src/sources/runSourceAndIngest';
import { icsExportTarget } from '@/src/sync/targets/icsTarget';
import { askRecreateGoogleCalendar } from '@/src/sync/askRecreateGoogleCalendar';
import { openErrorReportMail } from '@/src/support/mailto';
import { AppButton } from '@/src/ui/AppButton';
import { AppCard, Meta, ScreenTitle, SectionTitle } from '@/src/ui/AppCard';
import { OcrNamePickerModal } from '@/src/ui/OcrNamePickerModal';
import { Screen } from '@/src/ui/Screen';
import { useTheme } from '@/src/ui/useTheme';
import type { AppTheme } from '@/src/ui/theme';

const SETUP_HREF = '/setup' as Href;
const CALENDAR_HREF = '/(tabs)/preview' as Href;
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
/** Persist collapsible LOGA3 WebView (default: open). */
const SHOW_WEB_KEY = 'loga3.showWebView';

function alertErrorWithReport(title: string, msg: string, context: string) {
  Alert.alert(title, msg, [
    { text: 'OK', style: 'cancel' },
    {
      text: t('reportError'),
      onPress: () => {
        void openErrorReportMail({ error: msg, context }).catch((e) => {
          Alert.alert(
            t('reportError'),
            t('reportErrorFailed', { msg: e instanceof Error ? e.message : String(e) })
          );
        });
      },
    },
  ]);
}

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
    sourceChip: {
      paddingHorizontal: 14,
      height: 40,
      borderRadius: theme.radius.sm,
      backgroundColor: theme.color.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.color.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sourceChipOn: {
      backgroundColor: theme.color.primary,
      borderColor: theme.color.primary,
    },
    sourceChipText: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.color.inkSecondary,
    },
    sourceChipTextOn: { color: theme.color.primaryText },
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
    ocrTextArea: {
      minHeight: 160,
      fontFamily: 'monospace',
      fontSize: 13,
      lineHeight: 18,
    },
    statusBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: theme.radius.sm,
      backgroundColor: theme.color.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.color.border,
    },
    statusBarBusy: {
      backgroundColor: theme.color.primaryTint,
      borderColor: theme.color.cardAccentBorder,
    },
    fetchFormBusy: {
      opacity: 0.45,
    },
    statusText: {
      flex: 1,
      fontSize: 11,
      lineHeight: 14,
      color: theme.color.inkMuted,
      fontWeight: '500',
    },
    statusTextBusy: {
      color: theme.color.inkSecondary,
    },
    status: {
      fontSize: 11,
      lineHeight: 14,
      color: theme.color.inkFaint,
      marginTop: 2,
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
  const busyRef = useRef(false);
  busyRef.current = busy;
  const ocrCaptureInFlightRef = useRef(false);
  /** True while gallery/camera picker is open (for Android pending-result recovery). */
  const ocrPickerAwaitingRef = useRef(false);
  /** Survives only while JS lives; set when we open picker so AppState does not probe on cold start. */
  const ocrExpectPendingRef = useRef(false);
  const [webReady, setWebReady] = useState(false);
  const [webLayoutW, setWebLayoutW] = useState(windowWidth);
  const [selected, setSelected] = useState<YearMonth[]>(() =>
    buildMonthWindow(0, 0)
  );
  const [year, setYear] = useState(new Date().getFullYear());
  const [quickPrefs, setQuickPrefs] = useState<QuickUpdatePrefs | null>(null);
  const [activeSourceId, setActiveSourceId] = useState('loga3-webview');
  const [googleConfigured, setGoogleConfigured] = useState(false);
  const isLoga3Source = activeSourceId === 'loga3-webview';
  const isLocalSource = activeSourceId === 'local-files';
  const isCameraOcrSource = activeSourceId === 'camera-ocr';
  const [ocrText, setOcrText] = useState('');
  const [ocrMatrix, setOcrMatrix] = useState<MonthMatrixGrid | null>(null);
  const [ocrImageUri, setOcrImageUri] = useState<string | null>(null);
  const [ocrMatchedName, setOcrMatchedName] = useState<string | null>(null);
  const [ocrSettingsName, setOcrSettingsName] = useState<string | null>(null);
  const [ocrRowCandidates, setOcrRowCandidates] = useState<
    { id: string; label: string; yCenter: number; height: number }[]
  >([]);
  const [ocrLayoutId, setOcrLayoutId] = useState<OcrLayoutId>(DEFAULT_OCR_LAYOUT_ID);
  const ocrLayouts = useMemo(() => listOcrLayouts(), []);
  const [ocrNamePick, setOcrNamePick] = useState<{
    candidates: { id: string; label: string; yCenter: number; height: number }[];
    suggestedId?: string | null;
    preferredLabel?: string | null;
  } | null>(null);
  const ocrNameResolverRef = useRef<((result: { id: string; label: string } | null) => void) | null>(
    null
  );
  const scannerAvailable = useMemo(() => isDocumentScannerAvailable(), []);
  const webRef = useRef<{ run: (cmd: AutomationCommand) => void; reload: () => void }>(null);
  const bridgeRef = useRef(new AutomationBridge());
  const readyRef = useRef(false);
  const schedulePromptedRef = useRef(false);
  const seededWindowRef = useRef(false);
  const snap = getSnapshot();
  const pack = useMemo(
    () => (snap.hospitalId ? getPackById(snap.hospitalId) : null),
    [snap.hospitalId]
  );
  const sources = useMemo(() => listSourcesForPack(pack), [pack]);

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

  useEffect(() => {
    return subscribeKeys(
      ['entries', 'locale', 'themePref', 'hospitalId', 'groupId', 'areaId', 'preset', 'summary'],
      () => setTick((n) => n + 1)
    );
  }, []);
  useEffect(() => {
    if (!isLoga3Source) {
      setWebReady(false);
      readyRef.current = false;
    }
  }, [isLoga3Source]);

  const refreshSetup = useCallback(async () => {
    const st = await getSetupStatus();
    setSetup(st);
    setActiveSourceId(st.preferredSourceId);
    const prefs = await loadQuickPrefs();
    setQuickPrefs(prefs);
    if (!seededWindowRef.current) {
      seededWindowRef.current = true;
      setSelected(buildMonthWindow(prefs.prevMonths, prefs.nextMonths));
      setYear(new Date().getFullYear());
    }
    setGoogleConfigured(!!(await getGoogleCalendarId()));
    setOcrLayoutId(await loadOcrLayoutId());
    setOcrSettingsName(await loadOcrPreferredName());
    if (st.credentialsOk) {
      setCreds(await loadCredentials());
    } else {
      setCreds(null);
    }
    if (st.complete || st.workplaceReady) return;
    // Dev-Smoke: .env → deep-link already seeds Secure Store. Never force Setup UI then.
    if (await peekSmokeFetchIntent()) return;
    router.push(SETUP_HREF);
  }, []);

  const onPickSource = useCallback(
    async (id: string) => {
      if (busy || id === activeSourceId) return;
      if (!isSourceSupportedByPack(pack, id)) return;
      setActiveSourceId(id);
      await saveActiveSourceId(id);
      const st = await getSetupStatus();
      setSetup(st);
      if (st.credentialsOk) setCreds(await loadCredentials());
      else setCreds(null);
    },
    [busy, activeSourceId, pack]
  );

  const onPickOcrLayout = useCallback(
    async (id: OcrLayoutId) => {
      if (busy || id === ocrLayoutId) return;
      setOcrLayoutId(id);
      await saveOcrLayoutId(id);
    },
    [busy, ocrLayoutId]
  );

  const applySettingsWindow = useCallback((prefs?: QuickUpdatePrefs | null) => {
    const p = prefs || quickPrefs;
    if (!p) return;
    setSelected(buildMonthWindow(p.prevMonths, p.nextMonths));
    setYear(new Date().getFullYear());
  }, [quickPrefs]);

  const packMapping = useMemo(() => {
    if (!snap.hospitalId || !snap.groupId || !snap.areaId) return null;
    return getMappingForScope(snap.hospitalId, snap.groupId, snap.areaId);
  }, [snap.hospitalId, snap.groupId, snap.areaId]);

  const quickWillSyncGoogle = !!(
    quickPrefs?.syncGoogle && googleConfigured
  );

  const selectionLabel = useMemo(() => formatMonthWindow(selected), [selected]);

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
    if (!setup?.workplaceReady || !packMapping || !snap.preset) {
      Alert.alert(t('setupTitle'), t('setupIncompleteWorkplace'));
      return;
    }
    try {
      const ingested = await ingestArtifacts(
        [{ kind: 'text', month: 9, year: 2026, text: FIXTURE_TEXT }],
        { replaceEntries: true }
      );
      setStatus(t('fjOfflineFixture', { count: ingested.entries.length }));
      Alert.alert('Fixture', t('fixtureLoaded', { count: ingested.entries.length }));
    } catch (e) {
      Alert.alert(t('alertError'), String(e));
    }
  };

  const onImportFiles = async () => {
    if (!setup?.workplaceReady) {
      Alert.alert(t('setupTitle'), t('setupIncompleteWorkplace'));
      router.push(SETUP_HREF);
      return;
    }
    setBusy(true);
    setStatus(t('sourceLocalRunning'));
    try {
      const result = await runSourceAndIngest({
        sourceId: 'local-files',
        period: selected.length
          ? { months: selected.map((s) => s.month), year }
          : undefined,
        replaceEntries: false,
        preserveOutsideMonths: true,
        onStatus: setStatus,
      });
      if (!result.artifacts.length && !result.errors.length) {
        setStatus(t('sourceLocalCancelled'));
        return;
      }
      const parts = [
        t('fjResultShifts', { count: result.entries.length }),
        result.errors.length
          ? t('fjResultErrors', {
              errors: result.errors.map((e) => `· ${e}`).join('\n'),
            })
          : null,
      ].filter(Boolean);
      setStatus(parts.join(' · '));
      if (result.entries.length > 0) {
        router.replace(CALENDAR_HREF);
      }
      Alert.alert(t('sourceLocalDone'), parts.join('\n'));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(t('fjResultErrorLine', { msg }));
      alertErrorWithReport(t('sourceLocalFiles'), msg, 'Local import');
    } finally {
      setBusy(false);
    }
  };

  /** OCR: capture → name pick (auto if remembered) → text only (never ingest). */
  const requestOcrName = useCallback(
    (req: {
      candidates: { id: string; label: string; yCenter: number; height: number }[];
      suggestedId?: string | null;
      preferredLabel?: string | null;
    }) => {
      return new Promise<{ id: string; label: string } | null>((resolve) => {
        ocrNameResolverRef.current = resolve;
        setOcrNamePick(req);
      });
    },
    []
  );

  const finishOcrName = useCallback((result: { id: string; label: string } | null) => {
    const resolve = ocrNameResolverRef.current;
    ocrNameResolverRef.current = null;
    setOcrNamePick(null);
    resolve?.(result);
  }, []);

  const onCameraOcr = async (captureMode: OcrCaptureMode, imageUri?: string) => {
    // One picker at a time — stacked taps left status stuck on “Galerie öffnen…”.
    if (ocrCaptureInFlightRef.current) return;
    ocrCaptureInFlightRef.current = true;

    let captured = imageUri || null;
    const smokeUri = !!imageUri;
    try {
      if (!captured) {
        // CRITICAL (Android): open the system picker in the same user-gesture turn.
        // Any await/setTimeout before launchImageLibraryAsync often means “nothing happens”.
        ocrPickerAwaitingRef.current = true;
        ocrExpectPendingRef.current = true;
        noteOcrPickerLaunch();
        try {
          captured = await captureOcrImage(captureMode);
          // Got a result in-process — no Activity-destroy recovery needed.
          if (captured) {
            ocrExpectPendingRef.current = false;
            consumeOcrPickerLaunchPending();
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          setStatus(t('fjResultErrorLine', { msg }));
          alertErrorWithReport(t('sourceCameraOcr'), msg, 'Camera OCR');
          ocrExpectPendingRef.current = false;
          consumeOcrPickerLaunchPending();
          return;
        } finally {
          ocrPickerAwaitingRef.current = false;
        }
        if (!captured) {
          setStatus(t('sourceLocalCancelled'));
          return;
        }
        setStatus(
          captureMode === 'gallery'
            ? t('sourceOcrStatusGalleryPicked')
            : t('sourceOcrStatusPreparing')
        );
      }

      // Paint busy/gray UI BEFORE heavy prepare/OCR — otherwise JS work blocks the
      // first frame and it looks like ~5s of “nothing” after picking a photo.
      setBusy(true);
      setStatus(t('sourceOcrStatusPreparing'));
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      try {
        const result = await runCameraOcr({
          captureMode,
          imageUri: captured,
          layoutId: ocrLayoutId,
          pickRosterName: requestOcrName,
          onStatus: (p) => setStatus(p.line),
        });
        if (!result.artifacts.length && !result.errors.length) {
          setStatus(t('sourceLocalCancelled'));
          return;
        }
        if (result.errors.length && !result.artifacts.length) {
          const msg = result.errors.join(' · ');
          setStatus(msg);
          if (!(smokeUri && /EACCES|Permission denied/i.test(msg))) {
            Alert.alert(t('sourceCameraOcr'), msg);
          }
          return;
        }
        const text =
          result.artifacts.find((a) => a.kind === 'text' && 'text' in a)?.text || '';
        setOcrText(text);
        setOcrMatrix(result.matrix ?? null);
        setOcrImageUri(result.imageUri ?? null);
        setOcrMatchedName(result.selectedName ?? null);
        setOcrSettingsName(await loadOcrPreferredName());
        setOcrRowCandidates(
          (result.matrix?.rows || []).map((r) => ({
            id: r.name
              .normalize('NFD')
              .replace(/\p{M}/gu, '')
              .toLowerCase()
              .replace(/[^a-z0-9,]+/g, ' ')
              .trim(),
            label: r.name,
            yCenter: r.yCenter,
            height: 0,
          }))
        );
        if (!text && !result.matrix) setStatus(t('sourceOcrEmpty'));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setStatus(t('fjResultErrorLine', { msg }));
        if (!(smokeUri && /EACCES|Permission denied/i.test(msg))) {
          alertErrorWithReport(t('sourceCameraOcr'), msg, 'Camera OCR');
        }
      } finally {
        setBusy(false);
      }
    } finally {
      ocrCaptureInFlightRef.current = false;
      ocrPickerAwaitingRef.current = false;
    }
  };

  // Android may destroy MainActivity after the photo picker — recover the chosen image once.
  // Never probe ImagePicker on cold start (that crashed when opening from the launcher).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      const fromRef = ocrExpectPendingRef.current;
      ocrExpectPendingRef.current = false;
      const fromMod = consumeOcrPickerLaunchPending();
      if (!fromRef && !fromMod) return;
      if (ocrCaptureInFlightRef.current) return;
      void (async () => {
        const uri = await takePendingOcrImageUri();
        if (!uri || ocrCaptureInFlightRef.current) return;
        void onCameraOcr('gallery', uri);
      })();
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ocrLayoutId]);

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
      setStatus(t('fjLiveSelectorsError', { msg }));
      Alert.alert('Live selectors', msg);
    } finally {
      setBusy(false);
    }
  };

  const onAutomationMessage = useCallback((msg: AutomationMessage) => {
    bridgeRef.current.handleMessage(msg);
    // Fetch status is owned by fetchJob onStatus — probes/pdfBlob must not clobber it
    // (stuck "PDF erfasst" while WebView flapped for ~1min between months).
  }, []);

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

  const toggleMonth = (m: number) => {
    setSelected((prev) => {
      const key = ymKey(m, year);
      if (prev.some((x) => ymKey(x.month, x.year) === key)) {
        return prev.filter((x) => ymKey(x.month, x.year) !== key);
      }
      return [...prev, { month: m, year }].sort(
        (a, b) => a.year - b.year || a.month - b.month
      );
    });
  };

  const monthSelected = (m: number) =>
    selected.some((x) => x.month === m && x.year === year);

  const onFetch = async () => {
    if (!setup?.complete || !creds) {
      Alert.alert(t('setupTitle'), t('setupIncomplete'));
      router.push(SETUP_HREF);
      return;
    }
    if (!selected.length) {
      Alert.alert(t('selectMonths'), t('setupPickMonth'));
      return;
    }
    const unlocked = await ensureBiometricUnlocked(t('securityBiometricPromptFetch'));
    if (!unlocked) {
      Alert.alert(t('securityBiometric'), t('securityBiometricDenied'));
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
        months: selected,
        onCalendarMissing: askRecreateGoogleCalendar,
      });
      const parts = [
        result.windowLabel,
        t('fjResultShifts', { count: result.fetch.entries.length }),
        result.fetch.savedPdfs.length
          ? t('fjResultPdfs', { count: result.fetch.savedPdfs.length })
          : null,
        result.fetch.skippedNoPlan.length
          ? t('fjResultNoPlan', { months: result.fetch.skippedNoPlan.join(', ') })
          : null,
        result.fetch.errors.length
          ? t('fjResultErrors', {
              errors: result.fetch.errors.map((e) => `· ${e}`).join('\n'),
            })
          : null,
        ...result.targets.map((r) =>
          r.skipped
            ? `${r.id}: ${r.reason || '—'}`
            : `${r.id}: +${r.created || 0}/−${r.deleted || 0}`
        ),
      ].filter(Boolean);
      setStatus(parts.join(' · '));
      await setMatrixStatus(`MATRIX_FETCH_PASS ${parts.join(' · ')}`);
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
      setStatus(t('fjResultErrorLine', { msg }));
      await setMatrixStatus(`MATRIX_FETCH_FAIL ${msg}`);
      alertErrorWithReport(t('quickUpdate'), msg, 'Fetch / quickUpdate');
    } finally {
      setBusy(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      void refreshSetup();
      void (async () => {
        if (busyRef.current || schedulePromptedRef.current) return;
        const active = await resolveActiveSourceId(pack);
        if (active !== 'loga3-webview') return;
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
              void onFetch();
            },
          },
        ]);
      })();
      // Only on focus — do NOT re-run when setup/creds change (that re-pushed Setup and made it wobble).
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refreshSetup])
  );

  // Emulator matrix: deep-link smoke sets months + autofetch (poll only while intent exists)
  useEffect(() => {
    let cancelled = false;
    let started = false;
    let iv: ReturnType<typeof setInterval> | null = null;

    const stopPoll = () => {
      if (iv) {
        clearInterval(iv);
        iv = null;
      }
    };

    const tryAutofetch = async () => {
      if (cancelled || started || busyRef.current) return;
      const pending = await peekSmokeFetchIntent();
      if (!pending?.autofetch) {
        stopPoll();
        return;
      }

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
      if (!intent?.autofetch) {
        stopPoll();
        return;
      }
      started = true;
      stopPoll();
      setSelected(intent.months.map((m) => ({ month: m, year: intent.year })));
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
        const result = await runSourceAndIngest({
          sourceId: 'loga3-webview',
          credentials: { username: c.username, password: c.password },
          period: { months, year: y },
          host: {
            bridge: bridgeRef.current,
            inject: (cmd) => webRef.current?.run(cmd),
          },
          onStatus: setStatus,
          replaceEntries: true,
          gateTrace: false,
        });
        const parts = [
          t('fjResultShifts', { count: result.entries.length }),
          result.savedPdfs.length ? t('fjResultPdfs', { count: result.savedPdfs.length }) : null,
          result.skippedNoPlan.length
            ? t('fjResultNoPlan', { months: result.skippedNoPlan.join(', ') })
            : null,
          result.errors.length
            ? t('fjResultErrors', {
                errors: result.errors.map((e) => `· ${e}`).join('\n'),
              })
            : null,
        ].filter(Boolean);
        setStatus(parts.join(' · '));
        await setMatrixStatus(`MATRIX_FETCH_PASS ${parts.join(' · ')}`);
        if (result.entries.length > 0) {
          router.replace(CALENDAR_HREF);
        }
        Alert.alert(t('alertDone'), parts.join('\n'));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setStatus(t('fjResultErrorLine', { msg }));
        await setMatrixStatus(`MATRIX_FETCH_FAIL ${msg}`);
        alertErrorWithReport(t('alertFetchFailed'), msg, 'Autofetch / smoke');
      } finally {
        setBusy(false);
      }
    };

    const armIfNeeded = async () => {
      if (cancelled || started) return;
      const pending = await peekSmokeFetchIntent();
      if (!pending?.autofetch) return;
      void tryAutofetch();
      if (!iv) {
        iv = setInterval(() => {
          void tryAutofetch();
        }, 1500);
      }
    };

    void armIfNeeded();
    // Late deep-link: short discovery window, then idle unless intent appeared
    const discover = setInterval(() => {
      void armIfNeeded();
    }, 2000);
    const discoverStop = setTimeout(() => clearInterval(discover), 12000);
    return () => {
      cancelled = true;
      stopPoll();
      clearInterval(discover);
      clearTimeout(discoverStop);
    };
  }, []);

  // Dev/e2e: shiftplan://ocr-smoke?uri=file://… — poll only while an intent exists
  useEffect(() => {
    let cancelled = false;
    let started = false;
    let iv: ReturnType<typeof setInterval> | null = null;

    const stopPoll = () => {
      if (iv) {
        clearInterval(iv);
        iv = null;
      }
    };

    const tryOcrSmoke = async () => {
      if (cancelled || started || busyRef.current) return;
      const pending = await peekOcrSmokeIntent();
      if (!pending?.uri) {
        stopPoll();
        return;
      }
      const intent = await takeOcrSmokeIntent();
      if (!intent?.uri) {
        stopPoll();
        return;
      }
      started = true;
      stopPoll();
      setActiveSourceId('camera-ocr');
      void saveActiveSourceId('camera-ocr');
      if (intent.layoutId) {
        setOcrLayoutId(intent.layoutId as OcrLayoutId);
        void saveOcrLayoutId(intent.layoutId);
      }
      try {
        await onCameraOcr('gallery', intent.uri);
      } catch (e) {
        // Smoke paths must not spam the user with EACCES alerts on every reload.
        const msg = e instanceof Error ? e.message : String(e);
        // eslint-disable-next-line no-console
        console.warn('[ocr-smoke] failed', msg);
        setStatus(msg);
      }
    };

    const armIfNeeded = async () => {
      if (cancelled || started) return;
      const pending = await peekOcrSmokeIntent();
      if (!pending?.uri) return;
      void tryOcrSmoke();
      if (!iv) {
        iv = setInterval(() => {
          void tryOcrSmoke();
        }, 1000);
      }
    };

    void armIfNeeded();
    const discover = setInterval(() => {
      void armIfNeeded();
    }, 1500);
    const discoverStop = setTimeout(() => clearInterval(discover), 12000);
    return () => {
      cancelled = true;
      stopPoll();
      clearInterval(discover);
      clearTimeout(discoverStop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!setup) {
    return (
      <Screen style={styles.center}>
        <ActivityIndicator color={theme.color.primary} />
      </Screen>
    );
  }

  if (!setup.workplaceReady) {
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
            <ScreenTitle>{`${t('tabFetch')} · WV`}</ScreenTitle>
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

        <View style={[styles.statusBar, busy && styles.statusBarBusy]}>
          {busy ? <ActivityIndicator size="small" color={theme.color.primary} /> : null}
          <Text
            style={[styles.statusText, busy && styles.statusTextBusy]}
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            {status}
          </Text>
        </View>

        <View
          pointerEvents={busy ? 'none' : 'auto'}
          style={busy ? styles.fetchFormBusy : undefined}
          accessibilityElementsHidden={busy}
        >
            <AppCard accent>
              <SectionTitle>{t('sourcePick')}</SectionTitle>
              <View style={styles.monthGrid}>
                {sources.map((s) => {
                  const on = activeSourceId === s.id;
                  const label =
                    s.id === 'loga3-webview'
                      ? t('sourceLoga3')
                      : s.id === 'local-files'
                        ? t('sourceLocalFiles')
                        : s.id === 'camera-ocr'
                          ? t('sourceCameraOcr')
                          : t(s.labelKey as 'sourceLoga3');
                  return (
                    <Pressable
                      key={s.id}
                      disabled={busy}
                      onPress={() => void onPickSource(s.id)}
                      style={[styles.sourceChip, on && styles.sourceChipOn]}
                    >
                      <Text style={[styles.sourceChipText, on && styles.sourceChipTextOn]}>
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {isLoga3Source ? (
                <>
                  <SectionTitle>{t('selectMonths')}</SectionTitle>
                  <Meta>{t('fetchHint')}</Meta>
                  <Text style={styles.windowLine}>
                    {selectionLabel || '—'}
                    {' · '}
                    {quickWillSyncGoogle ? t('quickUpdateGoogleOn') : t('quickUpdateGoogleOff')}
                  </Text>
                  <View style={styles.monthGrid}>
                    {MONTHS.map((m) => {
                      const on = monthSelected(m);
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
                    title={t('fetchApplyWindow')}
                    variant="ghost"
                    compact
                    onPress={() => applySettingsWindow()}
                    disabled={busy}
                  />
                  <AppButton
                    title={
                      quickWillSyncGoogle ? t('quickUpdateGoSync') : t('sourceLoga3Go')
                    }
                    onPress={() => void onFetch()}
                    disabled={busy || !setup.complete}
                    busy={busy}
                  />
                  {!setup.complete ? <Meta>{t('setupLoga3Hint')}</Meta> : null}
                </>
              ) : isLocalSource ? (
                <>
                  <Meta>{t('fetchHintLocal')}</Meta>
                  <AppButton
                    title={t('sourceLocalGo')}
                    onPress={() => void onImportFiles()}
                    disabled={busy || !setup.workplaceReady}
                    busy={busy}
                  />
                  {!setup.workplaceReady ? (
                    <Meta>{t('setupIncompleteWorkplace')}</Meta>
                  ) : null}
                </>
              ) : isCameraOcrSource ? (
                <>
                  <Meta>{t('sourceCameraOcrHint')}</Meta>
                  <SectionTitle>{t('sourceCameraOcrLayout')}</SectionTitle>
                  <View style={styles.monthGrid}>
                    {ocrLayouts.map((layout) => {
                      const on = ocrLayoutId === layout.id;
                      return (
                        <Pressable
                          key={layout.id}
                          disabled={busy}
                          onPress={() => void onPickOcrLayout(layout.id)}
                          style={[styles.sourceChip, on && styles.sourceChipOn]}
                        >
                          <Text style={[styles.sourceChipText, on && styles.sourceChipTextOn]}>
                            {t(layout.labelKey as 'ocrLayoutRaw')}
                            {layout.status === 'stub' ? ' · …' : ''}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Meta>
                    {t(
                      (ocrLayouts.find((l) => l.id === ocrLayoutId)?.hintKey ||
                        'ocrLayoutRawHint') as 'ocrLayoutRawHint'
                    )}
                  </Meta>
                  {ocrLayouts.find((l) => l.id === ocrLayoutId)?.status === 'stub' ? (
                    <Meta>{t('sourceCameraOcrLayoutStub', { layout: ocrLayoutId })}</Meta>
                  ) : null}
                  <AppButton
                    title={t('sourceCameraOcrGo')}
                    onPress={() =>
                      void onCameraOcr(scannerAvailable ? 'scan' : 'camera')
                    }
                    disabled={busy}
                    busy={busy}
                  />
                  <AppButton
                    title={t('sourceCameraOcrGoGallery')}
                    variant="ghost"
                    onPress={() => void onCameraOcr('gallery')}
                    disabled={busy}
                  />
                  {!scannerAvailable ? <Meta>{t('sourceOcrScannerMissing')}</Meta> : null}
                  <Meta>
                    {ocrSettingsName
                      ? t('sourceOcrSettingsName', { name: ocrSettingsName })
                      : t('sourceOcrSettingsNameMissing')}
                  </Meta>
                  <AppButton
                    title={t('sourceOcrOpenSettingsName')}
                    variant="ghost"
                    compact
                    onPress={() => router.push('/(tabs)/settings/ocr' as Href)}
                    disabled={busy}
                  />
                  {ocrMatrix || ocrText || ocrImageUri ? (
                    <>
                      <SectionTitle>{t('sourceCameraOcrResult')}</SectionTitle>
                      {ocrMatrix || ocrImageUri ? (
                        <OcrCompareReview
                          imageUri={ocrImageUri}
                          grid={ocrMatrix}
                          matchedName={ocrMatchedName}
                          presetMapping={
                            packMapping?.presets?.[snap.preset || ''] ?? null
                          }
                          colors={packMapping?.colors ?? null}
                          title={
                            ocrMatchedName && ocrMatrix
                              ? t('sourceOcrMatrixTitleMine', {
                                  name: ocrMatchedName,
                                  people: ocrMatrix.rows.length,
                                })
                              : ocrMatrix
                                ? t('sourceOcrMatrixTitleAll')
                                : undefined
                          }
                        />
                      ) : (
                        <TextInput
                          style={[styles.input, styles.ocrTextArea]}
                          multiline
                          editable={!busy}
                          value={ocrText}
                          onChangeText={setOcrText}
                          textAlignVertical="top"
                        />
                      )}
                      {ocrMatrix && ocrRowCandidates.length ? (
                        <AppButton
                          title={t('sourceOcrPickMyRow')}
                          variant="ghost"
                          compact
                          onPress={() => {
                            void (async () => {
                              const preferred = await loadOcrPreferredName();
                              const picked = await requestOcrName({
                                candidates: ocrRowCandidates,
                                suggestedId: null,
                                preferredLabel: preferred,
                              });
                              if (!picked) return;
                              const orig = ocrRowCandidates.find((c) => c.id === picked.id);
                              const label = resolveConfirmedRosterLabel({
                                preferred,
                                ocrLabel: orig?.label || picked.label,
                                pickedLabel: picked.label,
                              });
                              setOcrMatchedName(label);
                              setOcrMatrix((prev) => {
                                if (!prev || !orig) return prev;
                                if (orig.label === label) return prev;
                                return {
                                  ...prev,
                                  rows: prev.rows.map((r) =>
                                    r.name === orig.label ? { ...r, name: label } : r
                                  ),
                                };
                              });
                              setOcrRowCandidates((prev) =>
                                prev.map((c) => (c.id === picked.id ? { ...c, label } : c))
                              );
                              await saveOcrPreferredName(label);
                              setOcrSettingsName(label);
                              if (orig && orig.label !== label) {
                                await rememberOcrNameAlias(orig.label, label);
                              }
                              setStatus(
                                t('sourceOcrStatusDoneMatrixNamed', {
                                  name: label,
                                  rows: ocrMatrix.rows.length,
                                })
                              );
                            })();
                          }}
                          disabled={busy}
                        />
                      ) : null}
                      {ocrMatchedName ? (
                        <AppButton
                          title={t('sourceOcrClearWrongName')}
                          variant="ghost"
                          compact
                          onPress={() => {
                            setOcrMatchedName(null);
                            setStatus(
                              t('sourceOcrStatusDoneMatrix', {
                                rows: ocrMatrix?.rows.length || 0,
                              })
                            );
                          }}
                          disabled={busy}
                        />
                      ) : null}
                      <AppButton
                        title={t('sourceCameraOcrClear')}
                        variant="ghost"
                        compact
                        onPress={() => {
                          setOcrText('');
                          setOcrMatrix(null);
                          setOcrImageUri(null);
                          setOcrMatchedName(null);
                          setOcrRowCandidates([]);
                        }}
                        disabled={busy}
                      />
                    </>
                  ) : null}
                </>
              ) : null}
            </AppCard>

            {__DEV__ ? (
              <>
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
            ) : null}
        </View>

        {!isLoga3Source ? null : (
          <Pressable style={styles.webToggle} onPress={toggleShowWeb} disabled={busy}>
            <Text style={styles.webToggleText}>
              {webExpanded ? t('webViewToggleOpen') : t('webViewToggleClosed')}
              {busy
                ? ` · ${t('quickUpdateRunning')}`
                : webReady
                  ? ` · ${t('webViewStatusReady')}`
                  : ` · ${t('webViewStatusLoading')}`}
            </Text>
          </Pressable>
        )}
        {isLoga3Source ? (
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
        ) : null}
        <Text style={styles.footerMeta}>
          {snap.entries.length} {t('entriesCount')}
          {selected.length ? ` · ${selectionLabel}` : ''}
        </Text>
      </ScrollView>
      <OcrNamePickerModal
        visible={!!ocrNamePick}
        candidates={ocrNamePick?.candidates || []}
        suggestedId={ocrNamePick?.suggestedId}
        preferredLabel={ocrNamePick?.preferredLabel}
        onCancel={() => finishOcrName(null)}
        onPick={(result) => finishOcrName(result)}
      />
    </Screen>
  );
}
