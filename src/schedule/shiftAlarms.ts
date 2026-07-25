/**
 * Schedule loud local notifications before each upcoming shift.
 * Optional: open Android Clock with SET_ALARM for the next wake time.
 */
import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';

import type { ShiftEntry } from '../convert/types';
import { getSnapshot } from '../state/store';
import { resolveStoredEntries } from '../convert/pipeline';
import { getMappingForScope } from '../packs';
import { loadShiftAlarmPrefs, type ShiftAlarmPrefs } from './shiftAlarmPrefs';
import { planShiftAlarms, SHIFT_ALARM_ID_PREFIX } from './shiftAlarmPlan';
import { ensureNotificationPermission } from './reminders';
import { t } from '../i18n';

const CHANNEL_ID = 'loga3-shift-alarm';

export type { PlannedShiftAlarm } from './shiftAlarmPlan';
export { planShiftAlarms } from './shiftAlarmPlan';

async function ensureAlarmChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: t('shiftAlarmChannelName'),
    description: t('shiftAlarmChannelDesc'),
    importance: Notifications.AndroidImportance.MAX,
    bypassDnd: true,
    enableVibrate: true,
    vibrationPattern: [0, 600, 200, 600, 200, 600],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    sound: 'default',
    audioAttributes: {
      usage: Notifications.AndroidAudioUsage.ALARM,
      contentType: Notifications.AndroidAudioContentType.SONIFICATION,
    },
  });
}

export async function cancelAllShiftAlarms(): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((n) => String(n.identifier || '').startsWith(SHIFT_ALARM_ID_PREFIX))
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
    );
  } catch {
    // ignore
  }
}

function resolvedEntriesFromStore(): ShiftEntry[] {
  const snap = getSnapshot();
  const mapping =
    snap.hospitalId && snap.groupId && snap.areaId
      ? getMappingForScope(snap.hospitalId, snap.groupId, snap.areaId) || undefined
      : undefined;
  return resolveStoredEntries(snap.entries, {
    preset: snap.preset || undefined,
    mapping,
    userMappings: snap.userMappings,
  });
}

export async function rescheduleShiftAlarms(
  prefs?: ShiftAlarmPrefs,
  entries?: ShiftEntry[]
): Promise<number> {
  if (Platform.OS === 'web') return 0;
  await cancelAllShiftAlarms();

  const p = prefs || (await loadShiftAlarmPrefs());
  if (!p.enabled) return 0;

  const ok = await ensureNotificationPermission();
  if (!ok) return 0;

  await ensureAlarmChannel();

  const list = entries || resolvedEntriesFromStore();
  const planned = planShiftAlarms(list, p);
  for (const a of planned) {
    await Notifications.scheduleNotificationAsync({
      identifier: a.id,
      content: {
        title: a.eve
          ? t('shiftAlarmTitleEve', { code: a.code })
          : t('shiftAlarmTitleDay', { code: a.code }),
        body: a.eve
          ? t('shiftAlarmBodyEve', {
              code: a.code,
              start: a.shiftStart,
              remindAt: a.remindAt,
            })
          : t('shiftAlarmBodyDay', {
              start: a.shiftStart,
              date: a.shiftDate,
              remindAt: a.remindAt,
            }),
        sound: true,
        priority: Notifications.AndroidNotificationPriority.MAX,
        data: { type: 'shift_alarm', code: a.code, date: a.shiftDate },
        ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: a.fireAt,
        channelId: CHANNEL_ID,
      },
    });
  }
  return planned.length;
}

/** Open Android Clock with a prefilled alarm for the next planned wake time. */
export async function openNextWakeInClockApp(): Promise<{
  hour: number;
  minutes: number;
  label: string;
}> {
  if (Platform.OS !== 'android') {
    throw new Error(t('shiftAlarmClockAndroidOnly'));
  }
  const prefs = await loadShiftAlarmPrefs();
  const planned = planShiftAlarms(resolvedEntriesFromStore(), {
    ...prefs,
    enabled: true,
  });
  if (!planned.length) {
    throw new Error(t('shiftAlarmNoUpcoming'));
  }
  const nextShiftKey = `${planned[0].shiftDate}|${planned[0].shiftStart}`;
  const forShift = planned.filter(
    (p) => `${p.shiftDate}|${p.shiftStart}` === nextShiftKey
  );
  const wake = forShift.reduce((a, b) =>
    a.fireAt.getTime() <= b.fireAt.getTime() ? a : b
  );
  const hour = wake.fireAt.getHours();
  const minutes = wake.fireAt.getMinutes();
  const label = t('shiftAlarmClockLabel', { code: wake.code, start: wake.shiftStart });

  await Linking.sendIntent('android.intent.action.SET_ALARM', [
    { key: 'android.intent.extra.alarm.HOUR', value: hour },
    { key: 'android.intent.extra.alarm.MINUTES', value: minutes },
    { key: 'android.intent.extra.alarm.MESSAGE', value: label },
    { key: 'android.intent.extra.alarm.SKIP_UI', value: false },
  ]);

  return { hour, minutes, label };
}
