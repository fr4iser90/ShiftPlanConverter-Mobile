/**
 * How often the user wants a Holen/sync — reminders + widget badge.
 *
 * Honest limits: LOGA3 Holen needs an in-app WebView. True “3 AM silent fetch while
 * phone sleeps” is unreliable on modern Android. We support:
 * - overdue tracking + widget badge
 * - optional notification reminder (expo-notifications)
 * - optional prompt when opening the app if overdue
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFS_KEY = 'loga3.schedulePrefs';
const LAST_FETCH_KEY = 'loga3.lastSuccessfulFetchAt';

export type SchedulePrefs = {
  /** Days between expected Holen. 0 = tracking off. Default 3. */
  intervalDays: number;
  /** Preferred local hour (0–23) for the next reminder. Default 3. */
  preferredHour: number;
  /** Schedule a local notification when a sync is due. */
  notifyEnabled: boolean;
  /** When opening Holen tab, ask to sync if overdue. */
  promptOnOpen: boolean;
  /** Show “Sync fällig” on home-screen widgets. */
  widgetBadge: boolean;
};

export const DEFAULT_SCHEDULE_PREFS: SchedulePrefs = {
  intervalDays: 3,
  preferredHour: 3,
  notifyEnabled: false,
  promptOnOpen: true,
  widgetBadge: true,
};

const clampDays = (n: number) => Math.max(0, Math.min(30, Math.round(Number(n) || 0)));
const clampHour = (n: number) => Math.max(0, Math.min(23, Math.round(Number(n) || 0)));

export function normalizeSchedulePrefs(
  raw: Partial<SchedulePrefs> | null | undefined
): SchedulePrefs {
  return {
    intervalDays: clampDays(raw?.intervalDays ?? DEFAULT_SCHEDULE_PREFS.intervalDays),
    preferredHour: clampHour(raw?.preferredHour ?? DEFAULT_SCHEDULE_PREFS.preferredHour),
    notifyEnabled: raw?.notifyEnabled === true,
    promptOnOpen: raw?.promptOnOpen !== false,
    widgetBadge: raw?.widgetBadge !== false,
  };
}

export async function loadSchedulePrefs(): Promise<SchedulePrefs> {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_SCHEDULE_PREFS };
    return normalizeSchedulePrefs(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SCHEDULE_PREFS };
  }
}

export async function saveSchedulePrefs(
  patch: Partial<SchedulePrefs>
): Promise<SchedulePrefs> {
  const next = normalizeSchedulePrefs({ ...(await loadSchedulePrefs()), ...patch });
  await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next));
  try {
    const { rescheduleSyncReminder } = await import('./reminders');
    await rescheduleSyncReminder(next);
  } catch {
    // notifications optional until native module present
  }
  return next;
}

export async function markSuccessfulFetch(at = new Date()): Promise<void> {
  await AsyncStorage.setItem(LAST_FETCH_KEY, at.toISOString());
  try {
    const prefs = await loadSchedulePrefs();
    const { rescheduleSyncReminder } = await import('./reminders');
    await rescheduleSyncReminder(prefs);
  } catch {
    // ignore
  }
}

export async function getLastSuccessfulFetchAt(): Promise<Date | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_FETCH_KEY);
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

export function isSyncOverdue(
  prefs: SchedulePrefs,
  lastFetch: Date | null,
  now = new Date()
): boolean {
  if (prefs.intervalDays <= 0) return false;
  if (!lastFetch) return true;
  const dueMs = lastFetch.getTime() + prefs.intervalDays * 24 * 60 * 60 * 1000;
  return now.getTime() >= dueMs;
}

/** Next local Date at preferredHour on/after `from`, at least intervalDays after lastFetch. */
export function nextReminderDate(
  prefs: SchedulePrefs,
  lastFetch: Date | null,
  now = new Date()
): Date | null {
  if (prefs.intervalDays <= 0 || !prefs.notifyEnabled) return null;
  const base = lastFetch
    ? new Date(lastFetch.getTime() + prefs.intervalDays * 24 * 60 * 60 * 1000)
    : now;
  const target = new Date(Math.max(base.getTime(), now.getTime() + 60_000));
  target.setHours(prefs.preferredHour, 0, 0, 0);
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
    target.setHours(prefs.preferredHour, 0, 0, 0);
  }
  return target;
}

export function formatScheduleSummary(prefs: SchedulePrefs, locale: 'de' | 'en' = 'de'): string {
  if (prefs.intervalDays <= 0) {
    return locale === 'de' ? 'Kein Intervall' : 'No interval';
  }
  const hour = String(prefs.preferredHour).padStart(2, '0');
  if (locale === 'de') {
    return `alle ${prefs.intervalDays} Tage · Reminder ~${hour}:00`;
  }
  return `every ${prefs.intervalDays} days · reminder ~${hour}:00`;
}
