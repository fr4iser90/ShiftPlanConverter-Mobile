import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { t } from '@/src/i18n';
import { runPayrollCheck } from '@/src/payroll/check';
import { loadTarifPrefs, saveTarifPrefs } from '@/src/payroll/tarifPrefs';
import { mergeTarifPrefs } from '@/src/payroll/tarifDefaults';
import type { PayrollTarifPrefs, PayslipDocument } from '@/src/payroll/types';
import { setImportMonthIntent } from '@/src/setup/importMonthIntent';
import {
  getPayrollProfileForScope,
  getMappingForScope,
  isPayrollSupportedForScope,
} from '@/src/packs';
import { getSnapshot, subscribeKeys } from '@/src/state/store';
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

export default function PayrollScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [, setTick] = useState(0);
  const [payMonth, setPayMonth] = useState(currentYm);
  const [tarif, setTarif] = useState<PayrollTarifPrefs>({});
  const snap = getSnapshot();
  const supported = isPayrollSupportedForScope(snap.packId, snap.groupId, snap.areaId);
  const profile = getPayrollProfileForScope(snap.packId, snap.groupId, snap.areaId);
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

  const workplacePayslips = useMemo(() => {
    const wp = snap.activeWorkplaceId;
    return [...snap.payslips]
      .filter((p) => !p.workplaceId || p.workplaceId === wp)
      .sort((a, b) => a.payMonth.localeCompare(b.payMonth));
  }, [snap.payslips, snap.activeWorkplaceId]);

  const payslip: PayslipDocument | undefined = useMemo(() => {
    return workplacePayslips.find((p) => p.payMonth === payMonth) || workplacePayslips.at(-1);
  }, [workplacePayslips, payMonth]);

  // Always bind selection to an imported VN month (from PDF), never a free scrubber.
  useFocusEffect(
    useCallback(() => {
      if (!workplacePayslips.length) return;
      if (!workplacePayslips.some((p) => p.payMonth === payMonth)) {
        setPayMonth(workplacePayslips[workplacePayslips.length - 1].payMonth);
      }
    }, [workplacePayslips, payMonth])
  );

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
    const packMapping = getMappingForScope(snap.packId, snap.groupId, snap.areaId);
    const presetMapping = packMapping?.presets?.[snap.preset] || null;
    return runPayrollCheck({
      profile,
      payslip,
      entries: snap.entries,
      workplaceId: snap.activeWorkplaceId || undefined,
      tarif,
      presetMapping,
      codeAliases: packMapping?.codeAliases || null,
    });
  }, [
    profile,
    payslip,
    snap.entries,
    snap.activeWorkplaceId,
    snap.packId,
    snap.groupId,
    snap.areaId,
    snap.preset,
    tarif,
  ]);

  const onOpenImportForServiceMonth = async () => {
    const ym = check?.serviceMonth;
    const m = ym ? /^(\d{4})-(\d{2})$/.exec(ym) : null;
    if (!m) return;
    await setImportMonthIntent({
      year: Number(m[1]),
      months: [Number(m[2])],
      job: 'shift',
    });
    router.push('/(tabs)');
  };

  const onOpenImportForPayslip = async () => {
    const ym = payslip?.payMonth || payMonth || currentYm();
    const m = /^(\d{4})-(\d{2})$/.exec(ym);
    if (!m) return;
    await setImportMonthIntent({
      year: Number(m[1]),
      months: [Number(m[2])],
      job: 'payslip',
    });
    router.push('/(tabs)');
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
          {payslip ? (
            <>
              <Meta>{t('payrollTarifFromPayslip')}</Meta>
              {(payslip.tarifLabel || tarif.eg) ? (
                <Text style={styles.body}>
                  {payslip.tarifLabel ||
                    [
                      tarif.eg ? `${t('payrollTarifEg')} ${tarif.eg}` : null,
                      tarif.stage != null ? `${t('payrollTarifStage')} ${tarif.stage}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                </Text>
              ) : null}
              <Meta>
                {[
                  (payslip.eg || tarif.eg)
                    ? `${t('payrollTarifEg')}: ${payslip.eg || tarif.eg}`
                    : null,
                  (payslip.stage ?? tarif.stage) != null
                    ? `${t('payrollTarifStage')}: ${payslip.stage ?? tarif.stage}`
                    : null,
                  (payslip.workHoursPerWeek ?? tarif.workHoursPerWeek) != null
                    ? `${t('payrollTarifHoursWeek')}: ${num(
                        payslip.workHoursPerWeek ?? tarif.workHoursPerWeek
                      )}`
                    : null,
                  tarif.workPct != null ? `${t('payrollTarifWorkPct')}: ${num(tarif.workPct)}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || t('payrollTarifNeedPayslip')}
              </Meta>
              {/* Fallback only when VN header did not yield EG — needed for Ärzte table lookup. */}
              {egOptions.length > 0 && !(payslip.eg || tarif.eg) ? (
                <>
                  <Meta>{t('payrollTarifEgMissing')}</Meta>
                  <View style={styles.chipRow}>
                    {egOptions.map((r) => (
                      <Pressable
                        key={r.eg}
                        onPress={() => {
                          const next = { ...tarif, eg: r.eg };
                          setTarif(next);
                          void saveTarifPrefs(snap.activeWorkplaceId || 'default', next);
                        }}
                        style={[styles.chip, tarif.eg === r.eg && styles.chipOn]}
                      >
                        <Text style={styles.chipText}>{r.eg}</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : null}
            </>
          ) : (
            <Meta>{t('payrollTarifNeedPayslip')}</Meta>
          )}
        </AppCard>

        <AppCard>
          <SectionTitle>{t('payrollImportedPayslips')}</SectionTitle>
          {workplacePayslips.length ? (
            <View style={styles.chipRow}>
              {workplacePayslips.map((p) => (
                <Pressable
                  key={p.payMonth}
                  onPress={() => setPayMonth(p.payMonth)}
                  style={[styles.chip, payslip?.payMonth === p.payMonth && styles.chipOn]}
                >
                  <Text style={styles.chipText}>{formatYmDe(p.payMonth)}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Meta>{t('payrollNoPayslipHint')}</Meta>
          )}
          <View style={styles.actions}>
            <AppButton
              title={t('payrollReloadPayslip')}
              onPress={() => void onOpenImportForPayslip()}
              variant="secondary"
            />
          </View>
        </AppCard>

        {!payslip ? (
          <AppCard>
            <Meta>{t('payrollNoPayslip')}</Meta>
          </AppCard>
        ) : (
          <>
            <AppCard>
              <SectionTitle>{t('payrollGross')}</SectionTitle>
              <Meta>
                {t('payrollPayMonth')}: {formatYmDe(payslip.payMonth)}
                {check
                  ? ` · ${t('payrollServiceMonth')}: ${formatYmDe(check.serviceMonth)}`
                  : payslip.serviceMonth
                    ? ` · ${t('payrollServiceMonth')}: ${formatYmDe(payslip.serviceMonth)}`
                    : ''}
              </Meta>
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
                {check.diagnostics.map((d) => {
                  const missing = /^missing-shifts:(\d{4}-\d{2})$/.exec(d);
                  if (missing) {
                    const ym = missing[1];
                    return (
                      <View key={d} style={styles.diagBlock}>
                        <Meta>
                          {t('payrollMissingShifts', { month: formatYmDe(ym) })}
                        </Meta>
                        <AppButton
                          title={t('payrollOpenImport', { month: formatYmDe(ym) })}
                          onPress={() => void onOpenImportForServiceMonth()}
                          variant="secondary"
                        />
                      </View>
                    );
                  }
                  return <Meta key={d}>{d}</Meta>;
                })}
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
    actions: {
      gap: theme.space.sm,
    },
    diagBlock: {
      gap: theme.space.sm,
      marginBottom: theme.space.sm,
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
  });
}
