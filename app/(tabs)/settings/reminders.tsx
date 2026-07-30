import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';

import { t } from '@/src/i18n';
import { getSnapshot } from '@/src/state/store';
import { getMappingForScope } from '@/src/packs';
import {
  DEFAULT_SCHEDULE_PREFS,
  formatScheduleSummary,
  getLastSuccessfulFetchAt,
  isSyncOverdue,
  loadSchedulePrefs,
  saveSchedulePrefs,
  type SchedulePrefs,
} from '@/src/schedule/prefs';
import {
  DEFAULT_SHIFT_ALARM_PREFS,
  formatRemindLabel,
  formatRemindsList,
  listMappingShiftOptions,
  loadShiftAlarmPrefs,
  normalizeReminds,
  parseLooseTime,
  remindKey,
  remindsForCode,
  saveShiftAlarmPrefs,
  type MappingShiftOption,
  type ShiftAlarmPrefs,
  type ShiftRemind,
} from '@/src/schedule/shiftAlarmPrefs';
import { openNextWakeInClockApp, rescheduleShiftAlarms } from '@/src/schedule/shiftAlarms';
import { isRemindBeforeShiftStart } from '@/src/schedule/shiftAlarmPlan';
import { refreshHomeWidgets } from '@/src/widget/refresh';
import { AppButton } from '@/src/ui/AppButton';
import { AppCard, Meta, SectionTitle } from '@/src/ui/AppCard';
import { Screen } from '@/src/ui/Screen';
import { SettingsStepper } from '@/src/ui/SettingsStepper';
import { makeSettingsStyles } from '@/src/ui/settingsStyles';
import { useTheme } from '@/src/ui/useTheme';

export default function SettingsRemindersScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeSettingsStyles(theme), [theme]);
  const snap = getSnapshot();
  const [schedule, setSchedule] = useState<SchedulePrefs>(DEFAULT_SCHEDULE_PREFS);
  const [shiftAlarm, setShiftAlarm] = useState<ShiftAlarmPrefs>(DEFAULT_SHIFT_ALARM_PREFS);
  const [syncStatus, setSyncStatus] = useState('');
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [draftTime, setDraftTime] = useState('');

  const mapping =
    snap.packId && snap.groupId && snap.areaId
      ? getMappingForScope(snap.packId, snap.groupId, snap.areaId)
      : null;
  const shifts = useMemo(
    () => listMappingShiftOptions(mapping, snap.preset),
    [mapping, snap.preset]
  );

  const parsedDraft = parseLooseTime(draftTime);

  useEffect(() => {
    void (async () => {
      const prefs = await loadSchedulePrefs();
      setSchedule(prefs);
      const last = await getLastSuccessfulFetchAt();
      setSyncStatus(isSyncOverdue(prefs, last) ? t('scheduleOverdue') : t('scheduleOk'));
      setShiftAlarm(await loadShiftAlarmPrefs());
    })();
  }, []);

  const patchSchedule = async (patch: Partial<SchedulePrefs>) => {
    const next = await saveSchedulePrefs(patch);
    setSchedule(next);
    const last = await getLastSuccessfulFetchAt();
    setSyncStatus(isSyncOverdue(next, last) ? t('scheduleOverdue') : t('scheduleOk'));
    void refreshHomeWidgets(snap.entries);
  };

  const patchShiftAlarm = async (patch: Partial<ShiftAlarmPrefs>) => {
    const next = await saveShiftAlarmPrefs(patch);
    setShiftAlarm(next);
  };

  const setCodeReminds = async (code: string, reminds: ShiftRemind[]) => {
    const nextMap = { ...shiftAlarm.codeTimes, [code]: normalizeReminds(reminds) };
    await patchShiftAlarm({ codeTimes: nextMap });
  };

  const commitRemind = async (code: string, remind: ShiftRemind) => {
    const current = remindsForCode(shiftAlarm, code);
    const base = Object.prototype.hasOwnProperty.call(shiftAlarm.codeTimes, code)
      ? shiftAlarm.codeTimes[code]
      : current;
    if (base.some((r) => remindKey(r) === remindKey(remind))) {
      setDraftTime('');
      return;
    }
    if (base.length >= 7) {
      Alert.alert(t('shiftAlarmSection'), t('shiftAlarmMaxTimes'));
      return;
    }
    await setCodeReminds(code, [...base, remind]);
    setDraftTime('');
  };

  const addTimeToCode = async (code: string, raw: string, shiftStart: string) => {
    const time = parseLooseTime(raw);
    if (!time) {
      Alert.alert(t('shiftAlarmSection'), t('shiftAlarmTimeInvalid'));
      return;
    }
    if (isRemindBeforeShiftStart(time, shiftStart)) {
      await commitRemind(code, { time, eve: false });
      return;
    }
    Alert.alert(
      t('shiftAlarmEveTitle'),
      t('shiftAlarmEveBody', { time, start: shiftStart }),
      [
        { text: t('shiftAlarmEveNo'), style: 'cancel' },
        {
          text: t('shiftAlarmEveYes'),
          onPress: () => {
            void commitRemind(code, { time, eve: true });
          },
        },
      ]
    );
  };

  const removeRemindFromCode = async (code: string, remind: ShiftRemind) => {
    const base = Object.prototype.hasOwnProperty.call(shiftAlarm.codeTimes, code)
      ? shiftAlarm.codeTimes[code]
      : remindsForCode(shiftAlarm, code);
    await setCodeReminds(
      code,
      base.filter((r) => remindKey(r) !== remindKey(remind))
    );
  };

  const selectShift = (opt: MappingShiftOption) => {
    if (selectedCode === opt.code) {
      setSelectedCode(null);
      return;
    }
    setSelectedCode(opt.code);
    setDraftTime('');
  };

  return (
    <Screen>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
        <AppCard>
          <SectionTitle>{t('scheduleSection')}</SectionTitle>
          <Meta>{t('scheduleHint')}</Meta>
          <Text style={styles.window}>
            {formatScheduleSummary(schedule, snap.locale === 'en' ? 'en' : 'de')}
          </Text>
          <Text style={styles.stepperLabel}>{syncStatus}</Text>
          <SettingsStepper
            label={t('scheduleInterval')}
            value={schedule.intervalDays}
            onChange={(n) => void patchSchedule({ intervalDays: n })}
            styles={styles}
            max={30}
          />
          <SettingsStepper
            label={t('scheduleHour')}
            value={schedule.preferredHour}
            onChange={(n) => void patchSchedule({ preferredHour: n })}
            styles={styles}
            max={23}
          />
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>{t('scheduleNotify')}</Text>
            <Switch
              value={schedule.notifyEnabled}
              onValueChange={(v) => void patchSchedule({ notifyEnabled: v })}
              trackColor={{ true: theme.color.primaryPressed, false: theme.color.border }}
              thumbColor="#fff"
            />
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>{t('schedulePrompt')}</Text>
            <Switch
              value={schedule.promptOnOpen}
              onValueChange={(v) => void patchSchedule({ promptOnOpen: v })}
              trackColor={{ true: theme.color.primaryPressed, false: theme.color.border }}
              thumbColor="#fff"
            />
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>{t('scheduleWidgetBadge')}</Text>
            <Switch
              value={schedule.widgetBadge}
              onValueChange={(v) => void patchSchedule({ widgetBadge: v })}
              trackColor={{ true: theme.color.primaryPressed, false: theme.color.border }}
              thumbColor="#fff"
            />
          </View>
        </AppCard>

        <AppCard>
          <SectionTitle>{t('shiftAlarmSection')}</SectionTitle>
          <Meta>{t('shiftAlarmHint')}</Meta>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>{t('shiftAlarmEnable')}</Text>
            <Switch
              value={shiftAlarm.enabled}
              onValueChange={(v) => void patchShiftAlarm({ enabled: v })}
              trackColor={{ true: theme.color.primaryPressed, false: theme.color.border }}
              thumbColor="#fff"
            />
          </View>
          <SettingsStepper
            label={t('shiftAlarmHorizon')}
            value={shiftAlarm.horizonDays}
            onChange={(n) => void patchShiftAlarm({ horizonDays: n })}
            styles={styles}
            max={21}
          />

          {!snap.preset || shifts.length === 0 ? (
            <Meta>{t('shiftAlarmNoMapping')}</Meta>
          ) : (
            <>
              <Text style={[styles.stepperLabel, { marginTop: 12 }]}>
                {t('shiftAlarmPickShift')}
              </Text>
              <View style={styles.dienstList}>
                {shifts.map((opt, i) => {
                  const reminds = remindsForCode(shiftAlarm, opt.code);
                  const open = selectedCode === opt.code;
                  const last = i === shifts.length - 1 && !open;
                  const shiftStart = opt.window.slice(0, 5);
                  const draftNeedsEve =
                    !!parsedDraft && !isRemindBeforeShiftStart(parsedDraft, shiftStart);
                  const eveShort = t('shiftAlarmEveShort');
                  return (
                    <View key={opt.code}>
                      <Pressable
                        onPress={() => selectShift(opt)}
                        style={[styles.dienstRow, last && styles.dienstRowLast]}
                        accessibilityRole="button"
                      >
                        <View
                          style={[
                            styles.dienstDot,
                            { backgroundColor: opt.color || theme.color.primary },
                          ]}
                        />
                        <View style={styles.dienstTextWrap}>
                          <Text style={styles.dienstTitle}>
                            {opt.code}
                            {opt.label && opt.label !== opt.code ? ` · ${opt.label}` : ''}
                          </Text>
                          <Text style={styles.dienstMeta}>{opt.window}</Text>
                        </View>
                        <Text style={styles.dienstTimes}>
                          {formatRemindsList(reminds, eveShort)}
                        </Text>
                      </Pressable>
                      {open ? (
                        <View style={styles.dienstEditor}>
                          <View style={styles.chipRow}>
                            {reminds.length === 0 ? (
                              <Text style={styles.stepperLabel}>{t('shiftAlarmNoTimes')}</Text>
                            ) : (
                              reminds.map((remind) => {
                                const label = formatRemindLabel(remind, eveShort);
                                return (
                                  <Pressable
                                    key={remindKey(remind)}
                                    onPress={() => void removeRemindFromCode(opt.code, remind)}
                                    style={styles.timeChip}
                                    accessibilityRole="button"
                                    accessibilityLabel={t('shiftAlarmRemoveTime', {
                                      time: label,
                                    })}
                                  >
                                    <Text style={styles.timeChipText}>{label}</Text>
                                    <Text style={styles.timeChipX}>×</Text>
                                  </Pressable>
                                );
                              })
                            )}
                          </View>
                          <Text style={styles.stepperLabel}>{t('shiftAlarmTimeInput')}</Text>
                          <View style={styles.row}>
                            <TextInput
                              style={[styles.input, { flex: 1 }]}
                              value={draftTime}
                              onChangeText={setDraftTime}
                              placeholder={t('shiftAlarmTimePlaceholder')}
                              placeholderTextColor={theme.color.inkFaint}
                              keyboardType="number-pad"
                              returnKeyType="done"
                              onSubmitEditing={() =>
                                void addTimeToCode(opt.code, draftTime, shiftStart)
                              }
                              autoCorrect={false}
                            />
                            <AppButton
                              compact
                              title={
                                parsedDraft
                                  ? draftNeedsEve
                                    ? t('shiftAlarmAddEve', { time: parsedDraft })
                                    : t('shiftAlarmAddTime', { time: parsedDraft })
                                  : t('shiftAlarmAdd')
                              }
                              variant="secondary"
                              onPress={() => void addTimeToCode(opt.code, draftTime, shiftStart)}
                            />
                          </View>
                          {draftTime.trim() && parsedDraft && !draftNeedsEve ? (
                            <Text style={styles.window}>→ {parsedDraft}</Text>
                          ) : null}
                          {draftTime.trim() && !parsedDraft ? (
                            <Text style={styles.stepperLabel}>{t('shiftAlarmTimeInvalid')}</Text>
                          ) : null}
                          {draftNeedsEve ? (
                            <Text style={styles.stepperLabel}>
                              {t('shiftAlarmEveHint', {
                                time: parsedDraft!,
                                start: shiftStart,
                              })}
                            </Text>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </>
          )}

          <AppButton
            title={t('shiftAlarmReschedule')}
            variant="secondary"
            onPress={async () => {
              try {
                const n = await rescheduleShiftAlarms(await saveShiftAlarmPrefs({}));
                Alert.alert(t('shiftAlarmSection'), t('shiftAlarmScheduled', { count: n }));
              } catch (e) {
                Alert.alert(t('shiftAlarmSection'), String(e));
              }
            }}
          />
          <AppButton
            title={t('shiftAlarmClock')}
            variant="soft"
            onPress={async () => {
              try {
                const r = await openNextWakeInClockApp();
                const time = `${String(r.hour).padStart(2, '0')}:${String(r.minutes).padStart(2, '0')}`;
                Alert.alert(
                  t('shiftAlarmSection'),
                  t('shiftAlarmClockOk', { time, label: r.label })
                );
              } catch (e) {
                Alert.alert(
                  t('shiftAlarmSection'),
                  t('shiftAlarmClockFail', {
                    msg: e instanceof Error ? e.message : String(e),
                  })
                );
              }
            }}
          />
        </AppCard>
      </ScrollView>
    </Screen>
  );
}
