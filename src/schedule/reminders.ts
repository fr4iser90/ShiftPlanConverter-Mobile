/**
 * Local notification when Fetch/sync is due.
 * Requires a native rebuild after adding expo-notifications.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import {
  getLastSuccessfulFetchAt,
  nextReminderDate,
  type SchedulePrefs,
} from './prefs';
import { t } from '../i18n';

const SYNC_REMINDER_ID = 'loga3-sync-reminder';

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const type = notification.request.content.data?.type;
    const loud = type === 'shift_alarm';
    return {
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: loud,
      shouldSetBadge: false,
    };
  },
});

export async function ensureNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const req = await Notifications.requestPermissionsAsync();
  return !!req.granted;
}

export async function cancelSyncReminder(): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(SYNC_REMINDER_ID);
  } catch {
    // id may not exist
  }
}

export async function rescheduleSyncReminder(prefs: SchedulePrefs): Promise<void> {
  await cancelSyncReminder();
  if (!prefs.notifyEnabled || prefs.intervalDays <= 0) return;
  if (Platform.OS === 'web') return;

  const ok = await ensureNotificationPermission();
  if (!ok) return;

  const last = await getLastSuccessfulFetchAt();
  const when = nextReminderDate(prefs, last);
  if (!when) return;

  await Notifications.scheduleNotificationAsync({
    identifier: SYNC_REMINDER_ID,
    content: {
      title: t('scheduleReminderTitle'),
      body: t('scheduleReminderBody'),
      data: { type: 'sync_reminder' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: when,
    },
  });
}
