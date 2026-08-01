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
import { loadCredentials } from '@/src/sources/webview/loga3/shared/credentials';
import { Loga3WebView } from '@/src/sources/webview/loga3/shared/Loga3WebView';
import type { AutomationCommand, AutomationMessage } from '@/src/sources/webview/loga3/shared/automation';
import { AutomationBridge } from '@/src/sources/webview/bridge';
import { resolveStoredEntries } from '@/src/convert/pipeline';
import {
  getMappingForScope,
  getPackById,
  getOcrConfigForPack,
  getOcrEngineIdForPack,
  getPreferredSourceId,
  isPayrollSupportedForScope,
  isSourceSupportedByPack,
} from '@/src/packs';
import { importLocalWithClassify } from '@/src/ingest/importLocalWithClassify';
import { runPayslipFetchJob } from '@/src/sources/webview/loga3/payslip/fetchPayslipJob';
import type { Loga3WebViewJob } from '@/src/sources/webview/loga3/shared/Loga3WebView';
import { ensureBiometricUnlocked } from '@/src/security/biometric';
import { getSnapshot, subscribeKeys, probeEncryptedStorage, isPayloadLocked } from '@/src/state/store';
import { getSetupStatus, type SetupStatus } from '@/src/setup/status';
import {
  takeSmokeFetchIntent,
  peekSmokeFetchIntent,
  setMatrixStatus,
} from '@/src/setup/smokeFetchIntent';
import { takeImportMonthIntent } from '@/src/setup/importMonthIntent';
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
import { isLocalImportSourceId } from '@/src/sources/ids';
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
  type OcrLayoutId,
} from '@/src/sources/ocr/layouts';
import { listOcrLayoutsForPack, packPreferredLayoutId } from '@/src/sources/ocr/packLayouts';
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
import { runEnabledOauthTargets, anyOauthTargetWillQuickSync } from '@/src/sync/targets';
import { disconnectGoogle } from '@/src/sync/google';
import { askRecreateGoogleCalendar } from '@/src/sync/askRecreateGoogleCalendar';
import { appendDiag } from '@/src/support/diagLog';
import { openErrorReportMail } from '@/src/support/mailto';
import { AppButton } from '@/src/ui/AppButton';
import { AppCard, Meta, ScreenTitle, SectionTitle } from '@/src/ui/AppCard';
import { OcrNamePickerModal } from '@/src/ui/OcrNamePickerModal';
import { OcrLayoutPickerModal } from '@/src/ui/OcrLayoutPickerModal';
import { OcrRegionAssistModal } from '@/src/ui/OcrRegionAssistModal';
import type { OcrLayoutPickRequest, OcrLayoutPickResult } from '@/src/ui/OcrLayoutPickerModal';
import type { OcrRegionAssistRequest, OcrRegionAssistResult } from '@/src/ui/OcrRegionAssistModal';
import type { OcrRegionSnapshot } from '@/src/sources/ocr/regionSnapshots';
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
    ocrActionRow: {
      flexDirection: 'row',
      gap: 8,
      alignItems: 'stretch',
    },
    ocrActionBtn: {
      flex: 1,
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
      position: 'relative',
      overflow: 'visible',
    },
    monthChipHasData: {
      backgroundColor: theme.color.primaryTint,
      borderColor: theme.color.primary,
      borderWidth: 1.5,
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
    monthChipTextHasData: {
      color: theme.color.primary,
    },
    monthChipTextOn: { color: theme.color.primaryText },
    monthDot: {
      position: 'absolute',
      right: 5,
      top: 5,
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: theme.color.primary,
    },
    monthDotOn: {
      backgroundColor: theme.color.primaryText,
    },
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
    sourceChipLocked: {
      opacity: 0.45,
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
  const [status, setStatusState] = useState(t('statusReady'));
  const setStatus = useCallback((line: string) => {
    appendDiag(line);
    setStatusState(line);
  }, []);
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
  /** True when ≥1 connected oauth calendar will sync after fetch. */
  const [oauthWillSync, setOauthWillSync] = useState(false);
  const [activeSourceId, setActiveSourceId] = useState('local-files');
  const [loga3Job, setLoga3Job] = useState<Loga3WebViewJob>('shift');
  const isLoga3Source = activeSourceId === 'loga3-webview';
  const isLocalImport = isLocalImportSourceId(activeSourceId);
  const [ocrText, setOcrText] = useState('');
  const [ocrMatrix, setOcrMatrix] = useState<MonthMatrixGrid | null>(null);
  const [ocrImageUri, setOcrImageUri] = useState<string | null>(null);
  const [ocrMatchedName, setOcrMatchedName] = useState<string | null>(null);
  const [ocrSettingsName, setOcrSettingsName] = useState<string | null>(null);
  const [ocrRowCandidates, setOcrRowCandidates] = useState<
    { id: string; label: string; yCenter: number; height: number }[]
  >([]);
  const [ocrLayoutId, setOcrLayoutId] = useState<OcrLayoutId>(DEFAULT_OCR_LAYOUT_ID);
  const [ocrNamePick, setOcrNamePick] = useState<{
    candidates: { id: string; label: string; yCenter: number; height: number }[];
    suggestedId?: string | null;
    preferredLabel?: string | null;
  } | null>(null);
  const ocrNameResolverRef = useRef<((result: { id: string; label: string } | null) => void) | null>(
    null
  );
  const [ocrLayoutPick, setOcrLayoutPick] = useState<OcrLayoutPickRequest | null>(null);
  const ocrLayoutResolverRef = useRef<((result: OcrLayoutPickResult | null) => void) | null>(
    null
  );
  const [ocrRegionAssist, setOcrRegionAssist] = useState<OcrRegionAssistRequest | null>(null);
  const ocrRegionResolverRef = useRef<((result: OcrRegionAssistResult) => void) | null>(null);
  const [ocrRegionSnapshots, setOcrRegionSnapshots] = useState<OcrRegionSnapshot[] | null>(null);
  const [ocrPageSize, setOcrPageSize] = useState<{ w: number; h: number } | null>(null);
  const scannerAvailable = useMemo(() => isDocumentScannerAvailable(), []);
  const webRef = useRef<{ run: (cmd: AutomationCommand) => void; reload: () => void }>(null);
  const bridgeRef = useRef(new AutomationBridge());
  const readyRef = useRef(false);
  const schedulePromptedRef = useRef(false);
  const seededWindowRef = useRef(false);
  const snap = getSnapshot();
  const pack = useMemo(
    () => (snap.packId ? getPackById(snap.packId) : null),
    [snap.packId]
  );
  const ocrConfig = useMemo(() => getOcrConfigForPack(pack), [pack]);
  const ocrLayouts = useMemo(
    () => listOcrLayoutsForPack(ocrConfig, ocrLayoutId),
    [ocrConfig, ocrLayoutId]
  );
  const sources = useMemo(() => listSourcesForPack(pack), [pack]);
  const payrollSupported = useMemo(
    () => isPayrollSupportedForScope(snap.packId, snap.groupId, snap.areaId),
    [snap.packId, snap.groupId, snap.areaId]
  );

  useEffect(() => {
    if (!payrollSupported && loga3Job === 'payslip') setLoga3Job('shift');
  }, [payrollSupported, loga3Job]);

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
      ['entries', 'locale', 'themePref', 'packId', 'groupId', 'areaId', 'preset', 'summary', 'workplaces', 'activeWorkplaceId'],
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
    const snapNow = getSnapshot();
    try {
      const probe = await probeEncryptedStorage();
      appendDiag(
        t('storeProbeLine', {
          entries: String(probe.loadedEntries),
          chars: String(probe.entriesChars),
          enc: probe.entriesEncrypted ? ' enc' : '',
          key: probe.keyPresent ? 'ok' : 'MISSING',
          locked: probe.locked ? ' LOCKED' : '',
        })
      );
      if (isPayloadLocked()) {
        setStatusState(t('storePayloadLocked'));
      }
    } catch {
      // ignore probe failures
    }
    const packNow = snapNow.packId ? getPackById(snapNow.packId) : null;
    let sourceId = st.preferredSourceId;
    // Never leave LOGA3 selected when portal login/URL is incomplete.
    if (sourceId === 'loga3-webview' && !st.loga3Ready) {
      sourceId = isSourceSupportedByPack(packNow, 'local-files')
        ? 'local-files'
        : getPreferredSourceId(packNow);
      if (sourceId === 'loga3-webview') sourceId = 'local-files';
      await saveActiveSourceId(sourceId);
    }
    setSetup(st);
    setActiveSourceId(sourceId);
    const prefs = await loadQuickPrefs();
    setQuickPrefs(prefs);
    setOauthWillSync(await anyOauthTargetWillQuickSync());
    if (!seededWindowRef.current) {
      seededWindowRef.current = true;
      setSelected(buildMonthWindow(prefs.prevMonths, prefs.nextMonths));
      setYear(new Date().getFullYear());
    }
    const savedLayout = await loadOcrLayoutId();
    const packPref = packPreferredLayoutId(getOcrConfigForPack(packNow));
    if (
      packPref &&
      packPref !== 'auto' &&
      (savedLayout === DEFAULT_OCR_LAYOUT_ID || savedLayout === 'auto')
    ) {
      setOcrLayoutId(packPref);
    } else {
      setOcrLayoutId(savedLayout);
    }
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

  const showLoga3LockedAlert = useCallback((st: SetupStatus) => {
    const detail =
      !st.urlOk && !st.credentialsOk
        ? t('sourceLoga3MissingBoth')
        : !st.urlOk
          ? t('sourceLoga3MissingUrl')
          : t('sourceLoga3MissingCreds');
    Alert.alert(t('sourceLoga3LockedTitle'), detail, [
      { text: t('sourceLoga3LockedCancel'), style: 'cancel' },
      { text: t('openSetup'), onPress: () => router.push(SETUP_HREF) },
    ]);
  }, []);

  const onPickSource = useCallback(
    async (id: string) => {
      if (busy) return;
      if (!isSourceSupportedByPack(pack, id)) return;
      if (id === 'loga3-webview') {
        const st = await getSetupStatus();
        setSetup(st);
        if (!st.loga3Ready) {
          showLoga3LockedAlert(st);
          if (activeSourceId === 'loga3-webview') {
            const fallback = 'local-files';
            setActiveSourceId(fallback);
            await saveActiveSourceId(fallback);
          }
          return;
        }
      }
      if (id === activeSourceId) return;
      setActiveSourceId(id);
      await saveActiveSourceId(id);
      const st = await getSetupStatus();
      setSetup(st);
      if (st.credentialsOk) setCreds(await loadCredentials());
      else setCreds(null);
    },
    [busy, activeSourceId, pack, showLoga3LockedAlert]
  );

  const onPickOcrLayout = useCallback(
    async (id: OcrLayoutId) => {
      if (busy || id === ocrLayoutId) return;
      setOcrLayoutId(id);
      await saveOcrLayoutId(id);
    },
    [busy, ocrLayoutId]
  );

  const packMapping = useMemo(() => {
    if (!snap.packId || !snap.groupId || !snap.areaId) return null;
    return getMappingForScope(snap.packId, snap.groupId, snap.areaId);
  }, [snap.packId, snap.groupId, snap.areaId]);

  // Label/action: any connected oauth target (Google / Outlook / …) enabled in prefs.
  const quickWillSync = oauthWillSync;

  const selectionLabel = useMemo(() => formatMonthWindow(selected), [selected]);

  /** Months in `year` that already have shifts in the store (still selectable to refresh). */
  const monthsWithData = useMemo(() => {
    const wp = snap.activeWorkplaceId;
    const set = new Set<number>();
    for (const e of snap.entries) {
      if (wp && e.workplaceId && e.workplaceId !== wp) continue;
      const m = /^(\d{4})-(\d{2})/.exec(String(e.date || ''));
      if (!m) continue;
      if (Number(m[1]) !== year) continue;
      set.add(Number(m[2]));
    }
    return set;
  }, [snap.entries, snap.activeWorkplaceId, year]);

  const shareIcsNow = () => {
    void (async () => {
      try {
        const mapping =
          snap.packId && snap.groupId && snap.areaId
            ? getMappingForScope(snap.packId, snap.groupId, snap.areaId) || undefined
            : undefined;
        const entries = resolveStoredEntries(snap.entries, {
          preset: snap.preset || undefined,
          mapping,
          userMappings: snap.userMappings,
        });
        const result = await icsExportTarget.sync(entries, {
          interactive: true,
          eventFormat: snap.eventFormat,
        });
        if (result.skipped && result.reason) {
          Alert.alert('ICS', result.reason);
        }
      } catch (e) {
        Alert.alert('ICS', String(e));
      }
    })();
  };

  const askDocumentKind = useCallback((name: string) => {
    return new Promise<'shift' | 'payslip'>((resolve) => {
      Alert.alert(t('sourceClassifyTitle'), t('sourceClassifyBody', { name }), [
        { text: t('sourceClassifyShift'), onPress: () => resolve('shift') },
        { text: t('sourceClassifyPayslip'), onPress: () => resolve('payslip') },
      ], { cancelable: false });
    });
  }, []);

  const onImportFiles = async () => {
    if (!setup?.workplaceReady) {
      Alert.alert(t('setupTitle'), t('setupIncompleteWorkplace'));
      router.push(SETUP_HREF);
      return;
    }
    setBusy(true);
    setStatus(t('sourceLocalRunning'));
    try {
      const result = await importLocalWithClassify({
        period: selected.length
          ? { months: selected.map((s) => s.month), year }
          : undefined,
        onStatus: setStatus,
        allowPayslip: payrollSupported,
        askKind: ({ name }) => askDocumentKind(name),
      });
      if (result.cancelled) {
        setStatus(t('sourceLocalCancelled'));
        return;
      }
      const shiftCount = result.shift?.fetchedCount || 0;
      const payCount = result.payslips.length;
      const parts = [
        shiftCount || payCount
          ? t('sourceImportMixedOk', { shifts: shiftCount, payslips: payCount })
          : null,
        result.shift && result.shift.storeCount !== result.shift.fetchedCount
          ? t('fjResultStoreTotal', { count: result.shift.storeCount })
          : null,
        result.errors.length
          ? t('fjResultErrors', {
              errors: result.errors.map((e) => `· ${e}`).join('\n'),
            })
          : null,
      ].filter(Boolean);
      setStatus(parts.join(' · ') || t('sourceLocalDone'));
      if (payCount > 0 && payrollSupported) {
        router.replace('/(tabs)/pruefung' as Href);
      } else if (shiftCount > 0) {
        router.replace(CALENDAR_HREF);
      }
      Alert.alert(t('sourceLocalDone'), parts.join('\n') || t('sourceLocalDone'));
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

  const requestOcrLayout = useCallback((req: OcrLayoutPickRequest) => {
    return new Promise<OcrLayoutPickResult | null>((resolve) => {
      ocrLayoutResolverRef.current = resolve;
      setOcrLayoutPick(req);
    });
  }, []);

  const finishOcrLayout = useCallback((result: OcrLayoutPickResult | null) => {
    const resolve = ocrLayoutResolverRef.current;
    ocrLayoutResolverRef.current = null;
    setOcrLayoutPick(null);
    resolve?.(result);
  }, []);

  const requestOcrRegion = useCallback((req: OcrRegionAssistRequest) => {
    return new Promise<OcrRegionAssistResult>((resolve) => {
      ocrRegionResolverRef.current = resolve;
      setOcrRegionAssist(req);
    });
  }, []);

  const finishOcrRegion = useCallback((result: OcrRegionAssistResult) => {
    const resolve = ocrRegionResolverRef.current;
    ocrRegionResolverRef.current = null;
    setOcrRegionAssist(null);
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
          pickOcrLayout: requestOcrLayout,
          assistOcrRegion: requestOcrRegion,
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
        setOcrRegionSnapshots(result.regionSnapshots ?? null);
        setOcrPageSize(
          result.pageWidth && result.pageHeight
            ? { w: result.pageWidth, h: result.pageHeight }
            : null
        );
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

  const onPayslipFetch = async () => {
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
    setStatus(t('payrollLoga3OpenVerdienst'));
    try {
      await waitUntilReady();
      await warmBridge();
      const { imported, errors } = await runPayslipFetchJob({
        username: creds.username,
        password: creds.password,
        months: selected.map((s) => s.month),
        year,
        workplaceId: snap.activeWorkplaceId || undefined,
        bridge: bridgeRef.current,
        inject: (cmd) => webRef.current?.run(cmd),
        onStatus: setStatus,
      });
      const parts = [
        imported.length
          ? t('payrollImportOk', { count: String(imported.length) })
          : null,
        errors.length
          ? t('payrollImportPartial', {
              ok: String(imported.length),
              fail: String(errors.length),
            }) + `\n${errors.slice(0, 3).join('\n')}`
          : null,
      ].filter(Boolean) as string[];
      setStatus(parts.join(' · ') || t('payrollLoga3Imported', { month: '—' }));
      if (imported.length) {
        router.replace('/(tabs)/pruefung' as Href);
      }
      Alert.alert(
        t('payrollTitle'),
        parts.join('\n') || t('payrollImportOk', { count: '0' })
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(t('fjResultErrorLine', { msg }));
      alertErrorWithReport(t('payrollLoga3Fetch'), msg, 'Payslip LOGA3 fetch');
    } finally {
      setBusy(false);
    }
  };

  const onFetch = async () => {
    if (loga3Job === 'payslip') {
      await onPayslipFetch();
      return;
    }
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
        t('fjResultShifts', { count: result.fetch.fetchedCount }),
        result.fetch.storeCount !== result.fetch.fetchedCount
          ? t('fjResultStoreTotal', { count: result.fetch.storeCount })
          : null,
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
      ].filter(Boolean) as string[];
      const syncFailures = result.targets.filter((r) => r.failed);
      const syncLines = result.targets.map((r) =>
        r.failed
          ? `${r.id}: ${r.reason || '—'}`
          : r.skipped
            ? `${r.id}: ${r.reason || '—'}`
            : `${r.id}: +${r.created || 0}/−${r.deleted || 0}`
      );
      if (syncLines.length) {
        parts.push(t('fjResultSyncHeader'), ...syncLines);
      }
      setStatus(parts.join(' · '));
      const hasErrors = result.fetch.errors.length > 0 || syncFailures.length > 0;
      await setMatrixStatus(
        `${hasErrors ? 'MATRIX_FETCH_FAIL' : 'MATRIX_FETCH_PASS'} ${parts.join(' · ')}`
      );

      // Fetch ok, only calendar sync failed → friendly prompt (no API dump).
      const onlySyncFailed =
        syncFailures.length > 0 &&
        result.fetch.errors.length === 0 &&
        result.fetch.entries.length > 0;

      if (result.fetch.entries.length > 0) {
        router.replace(CALENDAR_HREF);
      }

      if (onlySyncFailed) {
        const retrySync = async () => {
          try {
            const authFail = syncFailures.some((r) =>
              /401|invalid authentication|UNAUTHENTICATED|login cookie/i.test(r.reason || '')
            );
            if (authFail) {
              await disconnectGoogle();
            }
            setStatus(t('quickUpdateSyncAgain') + '…');
            const snap = getSnapshot();
            const mapping =
              snap.packId && snap.groupId && snap.areaId
                ? getMappingForScope(snap.packId, snap.groupId, snap.areaId) || undefined
                : undefined;
            const entries = resolveStoredEntries(snap.entries, {
              preset: snap.preset || undefined,
              mapping,
              userMappings: snap.userMappings,
            });
            const again = await runEnabledOauthTargets(entries, {
              eventFormat: snap.eventFormat,
              onStatus: setStatus,
              onCalendarMissing: askRecreateGoogleCalendar,
            });
            const fail = again.filter((r) => r.failed);
            if (fail.length) {
              Alert.alert(
                t('quickUpdateFetchedNoSyncTitle'),
                t('quickUpdateSyncRetryFail', {
                  reason: fail.map((r) => r.reason || r.id).join(' · '),
                })
              );
              setStatus(t('quickUpdateSyncRetryFail', { reason: fail[0]?.reason || '—' }));
              return;
            }
            const created = again.reduce((n, r) => n + (r.created || 0), 0);
            const deleted = again.reduce((n, r) => n + (r.deleted || 0), 0);
            Alert.alert(
              t('alertDone'),
              t('quickUpdateSyncRetryOk', { created, deleted })
            );
            setStatus(t('quickUpdateSyncRetryOk', { created, deleted }));
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            Alert.alert(t('quickUpdateFetchedNoSyncTitle'), t('quickUpdateSyncRetryFail', { reason: msg }));
          }
        };

        Alert.alert(t('quickUpdateFetchedNoSyncTitle'), t('quickUpdateFetchedNoSyncBody'), [
          { text: t('quickUpdateSkipSync'), style: 'cancel' },
          { text: t('quickUpdateSyncAgain'), onPress: () => void retrySync() },
        ]);
        return;
      }

      const buttons: {
        text: string;
        style?: 'cancel' | 'default';
        onPress?: () => void;
      }[] = [{ text: 'OK', style: 'cancel' }];
      if (hasErrors) {
        const errText = [
          ...result.fetch.errors,
          ...syncFailures.map((r) => `${r.id}: ${r.reason || '—'}`),
        ].join('\n');
        buttons.push({
          text: t('reportError'),
          onPress: () => {
            void openErrorReportMail({
              error: errText,
              context: 'Fetch / soft-fail result',
            }).catch((e) => {
              Alert.alert(
                t('reportError'),
                t('reportErrorFailed', {
                  msg: e instanceof Error ? e.message : String(e),
                })
              );
            });
          },
        });
      }
      if (result.offerIcs) {
        buttons.push({
          text: t('quickUpdateShareIcs'),
          onPress: () => shareIcsNow(),
        });
      }
      Alert.alert(
        hasErrors ? t('quickUpdateDoneWithErrors') : t('quickUpdateDone'),
        parts.join('\n'),
        buttons
      );
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
        const intent = await takeImportMonthIntent();
        if (intent?.months?.length) {
          setYear(intent.year);
          setSelected(intent.months.map((m) => ({ month: m, year: intent.year })));
          if (intent.job === 'payslip' || intent.job === 'shift') {
            setActiveSourceId('loga3-webview');
            setLoga3Job(intent.job);
            void saveActiveSourceId('loga3-webview');
          }
          setStatus(
            t('payrollImportMonthSelected', {
              month: formatMonthWindow(
                intent.months.map((m) => ({ month: m, year: intent.year }))
              ),
            })
          );
        }
      })();
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
          replaceEntries: false,
          preserveOutsideMonths: true,
          gateTrace: false,
        });
        const parts = [
          t('fjResultShifts', { count: result.fetchedCount }),
          result.storeCount !== result.fetchedCount
            ? t('fjResultStoreTotal', { count: result.storeCount })
            : null,
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
        if (result.fetchedCount > 0 || result.entries.length > 0) {
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
      setActiveSourceId('local-files');
      void saveActiveSourceId('local-files');
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
              {snap.workplaces.length > 1 ? (
                <Meta>
                  {t('workplaceProfiles')}:{' '}
                  {snap.workplaces.find((w) => w.id === snap.activeWorkplaceId)?.label || '—'}
                </Meta>
              ) : null}
              <View style={styles.monthGrid}>
                {sources.map((s) => {
                  const on = isLocalImportSourceId(s.id)
                    ? isLocalImport
                    : activeSourceId === s.id;
                  const loga3Locked = s.id === 'loga3-webview' && !setup.loga3Ready;
                  const label =
                    s.id === 'loga3-webview'
                      ? t('sourceLoga3')
                      : isLocalImportSourceId(s.id)
                        ? t('sourceLocalFiles')
                        : t(s.labelKey as 'sourceLoga3');
                  return (
                    <Pressable
                      key={s.id}
                      disabled={busy}
                      onPress={() => void onPickSource(s.id)}
                      style={[
                        styles.sourceChip,
                        on && styles.sourceChipOn,
                        loga3Locked && styles.sourceChipLocked,
                      ]}
                    >
                      <Text
                        style={[
                          styles.sourceChipText,
                          on && styles.sourceChipTextOn,
                        ]}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {isLoga3Source ? (
                <>
                  {payrollSupported ? (
                    <View style={styles.monthGrid}>
                      {(
                        [
                          { id: 'shift' as const, label: t('sourceLoga3JobShift') },
                          { id: 'payslip' as const, label: t('sourceLoga3JobPayslip') },
                        ] as const
                      ).map((j) => {
                        const on = loga3Job === j.id;
                        return (
                          <Pressable
                            key={j.id}
                            disabled={busy}
                            onPress={() => setLoga3Job(j.id)}
                            style={[styles.sourceChip, on && styles.sourceChipOn]}
                          >
                            <Text
                              style={[styles.sourceChipText, on && styles.sourceChipTextOn]}
                            >
                              {j.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}
                  <SectionTitle>{t('selectMonths')}</SectionTitle>
                  <Meta>
                    {loga3Job === 'payslip' ? t('payrollSubtitle') : t('fetchHint')}
                  </Meta>
                  <Text style={styles.windowLine}>
                    {selectionLabel || '—'}
                    {loga3Job === 'shift'
                      ? ` · ${quickWillSync ? t('quickUpdateGoogleOn') : t('quickUpdateGoogleOff')}`
                      : ''}
                  </Text>
                  <View style={styles.monthGrid}>
                    {MONTHS.map((m) => {
                      const on = monthSelected(m);
                      const hasData = monthsWithData.has(m);
                      return (
                        <Pressable
                          key={m}
                          disabled={busy}
                          onPress={() => toggleMonth(m)}
                          accessibilityState={{ selected: on }}
                          accessibilityLabel={
                            hasData
                              ? `${String(m).padStart(2, '0')} · ${t('fetchMonthHasData')}`
                              : String(m).padStart(2, '0')
                          }
                          style={[
                            styles.monthChip,
                            hasData && !on && styles.monthChipHasData,
                            on && styles.monthChipOn,
                          ]}
                        >
                          <Text
                            style={[
                              styles.monthChipText,
                              hasData && !on && styles.monthChipTextHasData,
                              on && styles.monthChipTextOn,
                            ]}
                          >
                            {String(m).padStart(2, '0')}
                          </Text>
                          {hasData ? <View style={[styles.monthDot, on && styles.monthDotOn]} /> : null}
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
                    title={
                      loga3Job === 'payslip'
                        ? t('sourceLoga3GoPayslip')
                        : quickWillSync
                          ? t('quickUpdateGoSync')
                          : t('sourceLoga3Go')
                    }
                    onPress={() => void onFetch()}
                    disabled={busy || !setup.loga3Ready}
                    busy={busy}
                  />
                  {!setup.loga3Ready ? (
                    <Meta>
                      {!setup.urlOk && !setup.credentialsOk
                        ? t('sourceLoga3MissingBoth')
                        : !setup.urlOk
                          ? t('sourceLoga3MissingUrl')
                          : t('sourceLoga3MissingCreds')}
                    </Meta>
                  ) : null}
                </>
              ) : isLocalImport ? (
                <>
                  <Meta>{t('fetchHintLocal')}</Meta>
                  <AppButton
                    title={t('sourceLocalGo')}
                    onPress={() => void onImportFiles()}
                    disabled={busy || !setup.workplaceReady}
                    busy={busy}
                  />
                  <View style={styles.ocrActionRow}>
                    <AppButton
                      title={
                        scannerAvailable
                          ? t('sourceCameraOcrGoScan')
                          : t('sourceCameraOcrGoCamera')
                      }
                      onPress={() =>
                        void onCameraOcr(scannerAvailable ? 'scan' : 'camera')
                      }
                      disabled={busy || !setup.workplaceReady}
                      busy={busy}
                      style={styles.ocrActionBtn}
                    />
                    <AppButton
                      title={t('sourceCameraOcrGoGallery')}
                      variant="secondary"
                      onPress={() => void onCameraOcr('gallery')}
                      disabled={busy || !setup.workplaceReady}
                      style={styles.ocrActionBtn}
                    />
                  </View>
                  {!setup.workplaceReady ? (
                    <Meta>{t('setupIncompleteWorkplace')}</Meta>
                  ) : null}
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
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
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
                          regionSnapshots={ocrRegionSnapshots}
                          pageWidth={ocrPageSize?.w ?? null}
                          pageHeight={ocrPageSize?.h ?? null}
                          presetMapping={
                            packMapping?.presets?.[snap.preset || ''] ?? null
                          }
                          colors={packMapping?.colors ?? null}
                          ocrEngineId={getOcrEngineIdForPack(pack)}
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
                          setOcrRegionSnapshots(null);
                          setOcrPageSize(null);
                        }}
                        disabled={busy}
                      />
                    </>
                  ) : null}
                </>
              ) : null}
            </AppCard>

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
              job={loga3Job}
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
      <OcrLayoutPickerModal
        visible={!!ocrLayoutPick}
        options={ocrLayoutPick?.options || []}
        suggestedId={ocrLayoutPick?.suggestedId}
        reason={ocrLayoutPick?.reason}
        onCancel={() => finishOcrLayout(null)}
        onPick={(result) => finishOcrLayout(result)}
      />
      <OcrRegionAssistModal
        visible={!!ocrRegionAssist}
        imageUri={ocrRegionAssist?.imageUri || ''}
        reason={ocrRegionAssist?.reason || 'matrix-failed'}
        onDone={finishOcrRegion}
      />
    </Screen>
  );
}
