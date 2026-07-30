import { useCallback, useMemo, useRef, useState } from 'react';
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
import { useFocusEffect } from 'expo-router';

import { t } from '@/src/i18n';
import { importPayslipPdfs } from '@/src/payroll/importPayslip';
import { runPayrollCheck } from '@/src/payroll/check';
import { loadTarifPrefs, saveTarifPrefs } from '@/src/payroll/tarifPrefs';
import { mergeTarifPrefs } from '@/src/payroll/tarifDefaults';
import type { PayrollTarifPrefs, PayslipDocument } from '@/src/payroll/types';
import {
  getPayrollProfileForScope,
  isPayrollSupportedForScope,
  isSourceSupportedByPack,
  getPackById,
} from '@/src/packs';
import { getSnapshot, subscribeKeys } from '@/src/state/store';
import { loadCredentials } from '@/src/sources/webview/loga3/credentials';
import { Loga3WebView } from '@/src/sources/webview/loga3/Loga3WebView';
import type { AutomationCommand, AutomationMessage } from '@/src/sources/webview/loga3/automation';
import { AutomationBridge } from '@/src/sources/webview/bridge';
import { runPayslipFetchJob } from '@/src/sources/webview/loga3/fetchPayslipJob';
import { ensureBiometricUnlocked } from '@/src/security/biometric';
import { AppButton } from '@/src/ui/AppButton';
import { AppCard, Meta, ScreenTitle, SectionTitle } from '@/src/ui/AppCard';
import { Screen } from '@/src/ui/Screen';
import { useTheme } from '@/src/ui/useTheme';
import type { AppTheme } from '@/src/ui/theme';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function currentYm(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function shiftYm(ym: string, delta: number): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return ym;
  const d = new Date(Number(m[1]), Number(m[2]) - 1 + delta, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function formatYmDe(ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return ym;
  return new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }).format(
    new Date(Number(m[1]), Number(m[2]) - 1, 1)
  );
}

function eur(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '–';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);
}

function num(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '–';
  return new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function parseNum(s: string): number | undefined {
  const n = Number(String(s).replace(',', '.').trim());
  return Number.isFinite(n) ? n : undefined;
}

export default function PayrollScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [, setTick] = useState(0);
  const [payMonth, setPayMonth] = useState(currentYm);
  const [busy, setBusy] = useState(false);
  const [statusLine, setStatusLine] = useState('');
  const [tarif, setTarif] = useState<PayrollTarifPrefs>({});
  const [showWeb, setShowWeb] = useState(false);
  const bridgeRef = useRef(new AutomationBridge());
  const webRef = useRef<{ run: (cmd: AutomationCommand) => void; reload: () => void } | null>(
    null
  );

  const snap = getSnapshot();
  const supported = isPayrollSupportedForScope(snap.packId, snap.groupId, snap.areaId);
  const profile = getPayrollProfileForScope(snap.packId, snap.groupId, snap.areaId);
  const pack = getPackById(snap.packId);
  const loga3Ok = isSourceSupportedByPack(pack, 'loga3-webview');

  useFocusEffect(
    useCallback(() => {
      const unsub = subscribeKeys(
        ['payslips', 'entries', 'packId', 'groupId', 'areaId', 'activeWorkplaceId'],
        () => setTick((n) => n + 1)
      );
      const snap0 = getSnapshot();
      const wp = snap0.activeWorkplaceId;
      void loadTarifPrefs(wp).then((saved) => {
        const prof = getPayrollProfileForScope(snap0.packId, snap0.groupId, snap0.areaId);
        const latest = [...snap0.payslips]
          .filter((p) => !p.workplaceId || p.workplaceId === wp)
          .sort((a, b) => a.payMonth.localeCompare(b.payMonth))
          .at(-1);
        setTarif(mergeTarifPrefs(prof, saved, latest || null));
      });
      return unsub;
    }, [])
  );

  const payslip: PayslipDocument | undefined = useMemo(() => {
    const wp = snap.activeWorkplaceId;
    return snap.payslips.find(
      (p) => p.payMonth === payMonth && (!p.workplaceId || p.workplaceId === wp)
    );
  }, [snap.payslips, snap.activeWorkplaceId, payMonth]);

  // When the selected payslip changes, fill empty tarif fields from it (saved prefs still win).
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void loadTarifPrefs(snap.activeWorkplaceId).then((saved) => {
        if (cancelled || !profile) return;
        setTarif(mergeTarifPrefs(profile, saved, payslip || null));
      });
      return () => {
        cancelled = true;
      };
    }, [payslip?.payMonth, payslip?.importedAt, profile?.id, snap.activeWorkplaceId])
  );

  const check = useMemo(() => {
    if (!profile || !payslip) return null;
    return runPayrollCheck({
      profile,
      payslip,
      entries: snap.entries,
      workplaceId: snap.activeWorkplaceId || undefined,
      tarif,
    });
  }, [profile, payslip, snap.entries, snap.activeWorkplaceId, tarif]);

  const onImport = async () => {
    setBusy(true);
    try {
      const { imported, errors } = await importPayslipPdfs();
      if (imported.length && !errors.length) {
        setPayMonth(imported[imported.length - 1].payMonth);
        const last = imported[imported.length - 1];
        const saved = await loadTarifPrefs(snap.activeWorkplaceId);
        setTarif(mergeTarifPrefs(profile, saved, last));
        Alert.alert(t('payrollTitle'), t('payrollImportOk', { count: String(imported.length) }));
      } else if (imported.length || errors.length) {
        if (imported.length) {
          setPayMonth(imported[imported.length - 1].payMonth);
          const last = imported[imported.length - 1];
          const saved = await loadTarifPrefs(snap.activeWorkplaceId);
          setTarif(mergeTarifPrefs(profile, saved, last));
        }
        Alert.alert(
          t('payrollTitle'),
          t('payrollImportPartial', {
            ok: String(imported.length),
            fail: String(errors.length),
          }) + (errors.length ? `\n\n${errors.slice(0, 3).join('\n')}` : '')
        );
      }
    } catch (e) {
      Alert.alert(t('payrollTitle'), e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onSaveTarif = async () => {
    await saveTarifPrefs(snap.activeWorkplaceId || 'default', tarif);
    Alert.alert(t('payrollTarifTitle'), t('payrollTarifSaved'));
    setTick((n) => n + 1);
  };

  const onLoga3Fetch = async () => {
    if (!loga3Ok) {
      Alert.alert(t('payrollTitle'), t('payrollLoga3Soon'));
      return;
    }
    const unlocked = await ensureBiometricUnlocked(t('securityBiometricPromptFetch'));
    if (!unlocked) return;
    const creds = await loadCredentials(snap.activeWorkplaceId);
    if (!creds?.username || !creds?.password) {
      Alert.alert(t('payrollTitle'), t('payrollLoga3NeedLogin'));
      return;
    }
    if (!webRef.current?.run) {
      setShowWeb(true);
      Alert.alert(t('payrollTitle'), t('payrollLoga3OpenVerdienst'));
      return;
    }
    const m = /^(\d{4})-(\d{2})$/.exec(payMonth);
    if (!m) return;
    setBusy(true);
    setShowWeb(true);
    setStatusLine('');
    try {
      const { imported, errors } = await runPayslipFetchJob({
        username: creds.username,
        password: creds.password,
        months: [Number(m[2])],
        year: Number(m[1]),
        workplaceId: snap.activeWorkplaceId || undefined,
        bridge: bridgeRef.current,
        inject: (cmd) => webRef.current?.run(cmd),
        onStatus: setStatusLine,
      });
      if (imported.length) setPayMonth(imported[imported.length - 1].payMonth);
      if (imported.length && !errors.length) {
        Alert.alert(t('payrollTitle'), t('payrollImportOk', { count: String(imported.length) }));
      } else {
        Alert.alert(
          t('payrollTitle'),
          t('payrollImportPartial', {
            ok: String(imported.length),
            fail: String(errors.length),
          }) + (errors.length ? `\n\n${errors.slice(0, 3).join('\n')}` : '')
        );
      }
    } catch (e) {
      Alert.alert(t('payrollTitle'), e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onBridgeMessage = (msg: AutomationMessage) => {
    bridgeRef.current.handleMessage(msg);
  };

  if (!supported || !profile) {
    return (
      <Screen>
        <ScrollView contentContainerStyle={styles.pad}>
          <ScreenTitle>{t('payrollTitle')}</ScreenTitle>
          <Meta>{t('payrollUnsupported')}</Meta>
        </ScrollView>
      </Screen>
    );
  }

  const egOptions = profile.egRows || [];
  const stageCount = egOptions.find((r) => r.eg === tarif.eg)?.salary.filter((x) => x != null)
    .length || 6;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.pad}>
        <ScreenTitle>{t('payrollTitle')}</ScreenTitle>
        <Meta>{t('payrollSubtitle')}</Meta>

        <AppCard>
          <SectionTitle>{t('payrollProfileLabel')}</SectionTitle>
          <Text style={styles.body}>{profile.label}</Text>
        </AppCard>

        <AppCard>
          <SectionTitle>{t('payrollTarifTitle')}</SectionTitle>
          {egOptions.length ? (
            <>
              <View style={styles.chipRow}>
                {egOptions.map((r) => (
                  <Pressable
                    key={r.eg}
                    onPress={() => setTarif((p) => ({ ...p, eg: r.eg }))}
                    style={[styles.chip, tarif.eg === r.eg && styles.chipOn]}
                  >
                    <Text style={styles.chipText}>{r.eg}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.chipRow}>
                {Array.from({ length: stageCount }, (_, i) => i + 1).map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => setTarif((p) => ({ ...p, stage: s }))}
                    style={[styles.chip, tarif.stage === s && styles.chipOn]}
                  >
                    <Text style={styles.chipText}>{`${t('payrollTarifStage')} ${s}`}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : (
            <View style={styles.rowFields}>
              <Field
                label={t('payrollTarifEg')}
                value={String(tarif.eg ?? '')}
                onChange={(v) => setTarif((p) => ({ ...p, eg: v.trim() || undefined }))}
                styles={styles}
                flex
              />
              <Field
                label={t('payrollTarifStage')}
                value={String(tarif.stage ?? '')}
                onChange={(v) => setTarif((p) => ({ ...p, stage: parseNum(v) }))}
                styles={styles}
                flex
              />
            </View>
          )}
          {payslip?.tarifLabel ? <Meta>{payslip.tarifLabel}</Meta> : null}
          {profile.tarifFamily === 'avr-c-pflege' ? (
            <Field
              label={t('payrollTarifHoursWeek')}
              value={String(tarif.workHoursPerWeek ?? '')}
              onChange={(v) => setTarif((p) => ({ ...p, workHoursPerWeek: parseNum(v) }))}
              styles={styles}
            />
          ) : (
            <Field
              label={t('payrollTarifWorkPct')}
              value={String(tarif.workPct ?? '')}
              onChange={(v) => setTarif((p) => ({ ...p, workPct: parseNum(v) }))}
              styles={styles}
            />
          )}
          <Pressable
            onPress={() => setTarif((p) => ({ ...p, shiftAllowance: !p.shiftAllowance }))}
            style={styles.toggleRow}
          >
            <Text style={styles.body}>{t('payrollTarifShift')}</Text>
            <Text style={styles.body}>
              {tarif.shiftAllowance ? t('payrollYes') : t('payrollNo')}
            </Text>
          </Pressable>
          {profile.tarifFamily === 'avr-aerzte' ? (
            <Field
              label={t('payrollTarifVl')}
              value={String(tarif.vlAg ?? '')}
              onChange={(v) => setTarif((p) => ({ ...p, vlAg: parseNum(v) }))}
              styles={styles}
            />
          ) : (
            <Field
              label={t('payrollTarifBdRate')}
              value={String(tarif.bdRate ?? '')}
              onChange={(v) => setTarif((p) => ({ ...p, bdRate: parseNum(v) }))}
              styles={styles}
            />
          )}
          <View style={styles.rowFields}>
            <Field
              label={t('payrollTarifUkDays')}
              value={String(tarif.ukDays ?? '')}
              onChange={(v) => setTarif((p) => ({ ...p, ukDays: parseNum(v) }))}
              styles={styles}
              flex
            />
            <Field
              label={t('payrollTarifUkRate')}
              value={String(tarif.ukRate ?? '')}
              onChange={(v) => setTarif((p) => ({ ...p, ukRate: parseNum(v) }))}
              styles={styles}
              flex
            />
          </View>
          <AppButton title={t('payrollTarifSave')} onPress={() => void onSaveTarif()} />
        </AppCard>

        <AppCard>
          <SectionTitle>{t('payrollPickMonth')}</SectionTitle>
          <View style={styles.row}>
            <Pressable
              onPress={() => setPayMonth((m) => shiftYm(m, -1))}
              style={styles.monthBtn}
            >
              <Text style={styles.monthBtnText}>‹</Text>
            </Pressable>
            <Text style={styles.monthLabel}>{formatYmDe(payMonth)}</Text>
            <Pressable
              onPress={() => setPayMonth((m) => shiftYm(m, 1))}
              style={styles.monthBtn}
            >
              <Text style={styles.monthBtnText}>›</Text>
            </Pressable>
          </View>
          <Meta>
            {t('payrollPayMonth')}: {payMonth}
            {check ? ` · ${t('payrollServiceMonth')}: ${check.serviceMonth}` : ''}
          </Meta>
        </AppCard>

        <View style={styles.actions}>
          <AppButton title={t('payrollImportPdf')} onPress={() => void onImport()} disabled={busy} />
          <AppButton
            title={t('payrollLoga3Fetch')}
            onPress={() => void onLoga3Fetch()}
            disabled={busy || !loga3Ok}
            variant="secondary"
          />
        </View>
        {busy ? <ActivityIndicator color={theme.color.primary} /> : null}
        {statusLine ? <Meta>{`${t('payrollStatus')}: ${statusLine}`}</Meta> : null}

        {showWeb && loga3Ok ? (
          <AppCard>
            <Loga3WebView
              ref={webRef}
              onMessage={onBridgeMessage}
              onReady={() => setStatusLine(t('payrollLoga3OpenVerdienst'))}
            />
          </AppCard>
        ) : null}

        {!payslip ? (
          <AppCard>
            <Meta>{t('payrollNoPayslip')}</Meta>
          </AppCard>
        ) : (
          <>
            <AppCard>
              <SectionTitle>{t('payrollGross')}</SectionTitle>
              <Text style={styles.body}>
                {t('payrollActual')}: {eur(check?.actualGross ?? payslip.gross)}
                {check && check.expectedGross
                  ? ` · ${t('payrollExpected')}: ${eur(check.expectedGross)}`
                  : ''}
              </Text>
              {payslip.tarifLabel ? <Meta>{payslip.tarifLabel}</Meta> : null}
            </AppCard>

            {check?.diagnostics?.length ? (
              <AppCard>
                <SectionTitle>{t('payrollDiagnostics')}</SectionTitle>
                {check.diagnostics.map((d) => (
                  <Meta key={d}>{d}</Meta>
                ))}
              </AppCard>
            ) : null}

            <AppCard>
              <SectionTitle>{`${t('payrollExpected')} / ${t('payrollActual')}`}</SectionTitle>
              {!check?.rows.length ? (
                <Meta>{t('payrollNoRows')}</Meta>
              ) : (
                check.rows.map((r) => (
                  <View key={r.la} style={styles.lineRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.la}>
                        {r.la} · {r.text}
                      </Text>
                      <Meta>
                        {t('payrollExpected')}: {eur(r.expectedAmount || null)}
                        {r.expectedQty != null ? ` (${num(r.expectedQty)})` : ''}
                        {' · '}
                        {t('payrollActual')}: {eur(r.actualAmount)}
                        {r.actualQty != null ? ` (${num(r.actualQty)})` : ''}
                      </Meta>
                    </View>
                    <Text
                      style={[
                        styles.delta,
                        r.ok === true ? styles.ok : r.ok === false ? styles.bad : styles.muted,
                      ]}
                    >
                      {r.delta == null ? '–' : eur(r.delta)}
                    </Text>
                  </View>
                ))
              )}
            </AppCard>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function Field({
  label,
  value,
  onChange,
  styles,
  flex,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  styles: ReturnType<typeof makeStyles>;
  flex?: boolean;
}) {
  return (
    <View style={flex ? { flex: 1 } : undefined}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        style={styles.input}
      />
    </View>
  );
}

function makeStyles(theme: AppTheme) {
  return StyleSheet.create({
    pad: {
      padding: theme.space.lg,
      gap: theme.space.md,
      paddingBottom: theme.space.xl * 2,
    },
    body: {
      ...theme.type.body,
      color: theme.color.ink,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.space.sm,
    },
    rowFields: {
      flexDirection: 'row',
      gap: theme.space.sm,
    },
    monthBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.color.primaryTint,
    },
    monthBtnText: {
      fontSize: 22,
      color: theme.color.primary,
      fontWeight: '700',
    },
    monthLabel: {
      ...theme.type.h2,
      color: theme.color.ink,
      textTransform: 'capitalize',
      flex: 1,
      textAlign: 'center',
    },
    actions: {
      gap: theme.space.sm,
    },
    lineRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: theme.space.sm,
      paddingVertical: 6,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.color.border,
    },
    la: {
      ...theme.type.body,
      color: theme.color.ink,
      fontWeight: '600',
    },
    delta: {
      ...theme.type.meta,
      fontVariant: ['tabular-nums'],
      minWidth: 72,
      textAlign: 'right',
    },
    ok: { color: '#087443', fontWeight: '700' },
    bad: { color: theme.color.danger, fontWeight: '700' },
    muted: { color: theme.color.inkMuted },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
    },
    chipOn: {
      borderColor: theme.color.primary,
      backgroundColor: theme.color.primaryTint,
    },
    chipText: {
      ...theme.type.meta,
      color: theme.color.ink,
      fontWeight: '600',
    },
    fieldLabel: {
      ...theme.type.meta,
      color: theme.color.inkMuted,
      marginBottom: 4,
    },
    input: {
      borderWidth: 1,
      borderColor: theme.color.border,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      color: theme.color.ink,
      backgroundColor: theme.color.surface,
      marginBottom: 8,
    },
    toggleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 8,
    },
  });
}
