import { Platform } from 'react-native';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { buildEventDescription } from '../convert/eventDescription';
import type { ShiftEntry } from '../convert/types';
import { getGoogleCalendarId, setGoogleCalendarId } from '../state/store';

WebBrowser.maybeCompleteAuthSession();

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
];

/** Same built-in web client as Desktop (public — not a secret). */
export const BUILTIN_GOOGLE_WEB_CLIENT_ID =
  '443643010945-l4r4n5t6vaj93tcqs8jlbvccltd06kaf.apps.googleusercontent.com';

/** @deprecated use BUILTIN_GOOGLE_WEB_CLIENT_ID */
export const BUILTIN_GOOGLE_CLIENT_ID = BUILTIN_GOOGLE_WEB_CLIENT_ID;

type GoogleExtra = {
  googleClientId?: string;
  googleAndroidClientId?: string;
  googleIosClientId?: string;
};

function extra(): GoogleExtra {
  return (Constants.expoConfig?.extra || {}) as GoogleExtra;
}

/** Web OAuth client — required by Google Sign-In to mint access tokens. */
export function resolveWebClientId(): string {
  return String(extra().googleClientId || '').trim() || BUILTIN_GOOGLE_WEB_CLIENT_ID;
}

export function resolveAndroidClientId(): string {
  return String(extra().googleAndroidClientId || '').trim();
}

export function resolveIosClientId(): string {
  return String(extra().googleIosClientId || '').trim();
}

export type GoogleCalendar = {
  id: string;
  summary: string;
  primary?: boolean;
};

let accessToken: string | null = null;
let accountEmail: string | null = null;
let nativeConfigured = false;

export function hasGoogleClientConfig(): boolean {
  return !!resolveWebClientId();
}

export function hasGoogleSession(): boolean {
  return !!accessToken;
}

export function getGoogleAccountEmail(): string | null {
  return accountEmail;
}

function configureNativeGoogle(): void {
  if (nativeConfigured) return;
  const webClientId = resolveWebClientId();
  const iosClientId = resolveIosClientId() || undefined;
  GoogleSignin.configure({
    webClientId,
    iosClientId,
    scopes: SCOPES,
    offlineAccess: false,
    forceCodeForRefreshToken: false,
  });
  nativeConfigured = true;
}

function rememberUserFromNative(): void {
  const user = GoogleSignin.getCurrentUser();
  accountEmail = user?.user?.email?.trim() || null;
}

async function takeNativeAccessToken(): Promise<string> {
  const tokens = await GoogleSignin.getTokens();
  if (!tokens.accessToken) {
    throw new Error('Google Sign-In: kein Access-Token (Calendar-Scopes prüfen).');
  }
  accessToken = tokens.accessToken;
  rememberUserFromNative();
  return accessToken;
}

/**
 * Restore a previous Play Services / iOS Google Sign-In without UI.
 * Calendar ID is separate (AsyncStorage); this restores the OAuth session only.
 */
export async function restoreGoogleSession(): Promise<boolean> {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return false;
  if (accessToken) return true;

  configureNativeGoogle();
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: false });
  } catch {
    return false;
  }

  try {
    if (GoogleSignin.hasPreviousSignIn()) {
      const silent = await GoogleSignin.signInSilently();
      if (silent.type === 'success') {
        await takeNativeAccessToken();
        return true;
      }
    }
  } catch {
    // fall through
  }

  // Token may still be available if configure refreshed the current user
  try {
    if (GoogleSignin.getCurrentUser()) {
      await takeNativeAccessToken();
      return true;
    }
  } catch {
    // no session
  }

  accessToken = null;
  accountEmail = null;
  return false;
}

/**
 * Prefer silent restore; only open the account picker when needed.
 */
export async function ensureGoogleSession(): Promise<string> {
  if (accessToken) return accessToken;
  const ok = await restoreGoogleSession();
  if (ok && accessToken) return accessToken;
  return connectGoogle();
}

/**
 * Android (Option A): Play Services Google Sign-In.
 * Requires an Android OAuth client in the same GCP project (package + SHA-1).
 * JS uses the Web client id as webClientId; Android client is matched by Play Services.
 */
async function connectGoogleNative(): Promise<string> {
  configureNativeGoogle();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

  // Fresh scopes / account picker
  try {
    await GoogleSignin.signOut();
  } catch {
    // ignore
  }

  const result = await GoogleSignin.signIn();
  if (result.type !== 'success') {
    throw new Error('Google OAuth abgebrochen oder fehlgeschlagen.');
  }

  // Ensure Calendar scopes (may prompt again)
  try {
    await GoogleSignin.addScopes({ scopes: SCOPES });
  } catch {
    // already granted or unavailable — continue and fail on API if needed
  }

  return takeNativeAccessToken();
}

/** Web / fallback: browser OAuth (needs https redirect on Web client — not custom schemes). */
async function connectGoogleWebBrowser(): Promise<string> {
  const id = resolveWebClientId();
  const redirectUri = AuthSession.makeRedirectUri();
  const discovery = {
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
  };

  const request = new AuthSession.AuthRequest({
    clientId: id,
    redirectUri,
    scopes: SCOPES,
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
    extraParams: { include_granted_scopes: 'true' },
  });

  const result = await request.promptAsync(discovery);
  if (result.type !== 'success' || !result.params.code) {
    throw new Error('Google OAuth abgebrochen oder fehlgeschlagen.');
  }

  const tokenResult = await AuthSession.exchangeCodeAsync(
    {
      clientId: id,
      code: result.params.code,
      redirectUri,
      extraParams: {
        code_verifier: request.codeVerifier || '',
      },
    },
    discovery
  );

  if (!tokenResult.accessToken) {
    throw new Error('Google OAuth: Token-Austausch fehlgeschlagen.');
  }
  accessToken = tokenResult.accessToken;
  return accessToken;
}

export async function connectGoogle(): Promise<string> {
  if (Platform.OS === 'android' || Platform.OS === 'ios') {
    return connectGoogleNative();
  }
  return connectGoogleWebBrowser();
}

export async function disconnectGoogle(): Promise<void> {
  accessToken = null;
  accountEmail = null;
  if (Platform.OS === 'android' || Platform.OS === 'ios') {
    try {
      configureNativeGoogle();
      await GoogleSignin.signOut();
    } catch {
      // ignore
    }
  }
}

async function gfetch(path: string, init?: RequestInit) {
  if (!accessToken) throw new Error('Nicht mit Google verbunden.');
  const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google API ${res.status}: ${body.slice(0, 200)}`);
  }
  if (res.status === 204 || init?.method === 'DELETE') return null;
  const text = await res.text();
  if (!text) return null;
  return JSON.parse(text);
}

export async function listCalendars(): Promise<GoogleCalendar[]> {
  const data = await gfetch('/users/me/calendarList');
  return (data.items || []).map((c: { id: string; summary: string; primary?: boolean }) => ({
    id: c.id,
    summary: c.summary,
    primary: !!c.primary,
  }));
}

export function isPrimaryCalendar(cal: GoogleCalendar): boolean {
  return !!cal.primary || cal.id === 'primary';
}

/** Create a secondary calendar (never the primary) — for shift sync. */
export async function createGoogleCalendar(summary: string): Promise<GoogleCalendar> {
  const name = summary.trim();
  if (!name) throw new Error('Kalendername fehlt.');
  const created = await gfetch('/calendars', {
    method: 'POST',
    body: JSON.stringify({
      summary: name,
      timeZone: 'Europe/Berlin',
    }),
  });
  if (!created?.id) throw new Error('Kalender konnte nicht angelegt werden.');
  return {
    id: String(created.id),
    summary: String(created.summary || name),
    primary: false,
  };
}

/** Wipe events in [timeMin, timeMax) — same strategy as Desktop. */
async function deleteEventsInRange(
  calendarId: string,
  timeMin: string,
  timeMax: string
): Promise<number> {
  const q = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    maxResults: '2500',
  });
  const data = await gfetch(
    `/calendars/${encodeURIComponent(calendarId)}/events?${q.toString()}`
  );
  const items = (data.items || []) as { id: string }[];
  let deleted = 0;
  for (const ev of items) {
    if (!ev.id) continue;
    await gfetch(
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(ev.id)}`,
      { method: 'DELETE' }
    );
    deleted += 1;
  }
  return deleted;
}

function entryRange(entries: ShiftEntry[]): { startDate: string; endDate: string } | null {
  if (!entries.length) return null;
  const dates = entries.map((e) => e.date).filter(Boolean).sort();
  if (!dates.length) return null;
  return { startDate: dates[0], endDate: dates[dates.length - 1] };
}

/**
 * Sync like Desktop: wipe date range, then create events.
 * If `calendarId` was deleted in Google, calls `onCalendarMissing` (when provided).
 */
export async function syncEntriesToGoogle(
  entries: ShiftEntry[],
  calendarId: string,
  {
    richDetails = false,
    onCalendarMissing,
  }: {
    richDetails?: boolean;
    onCalendarMissing?: (oldId: string) => Promise<string | null>;
  } = {}
): Promise<{ created: number; deleted: number }> {
  if (!entries.length) return { created: 0, deleted: 0 };

  let id = calendarId;
  const list = await listCalendars();
  if (!list.some((c) => c.id === id)) {
    if (!onCalendarMissing) {
      throw new Error(
        'Google-Kalender fehlt (gelöscht?). Unter Export neu anlegen oder wählen.'
      );
    }
    const next = await onCalendarMissing(id);
    if (!next) {
      throw new Error('Sync abgebrochen — kein Kalender.');
    }
    id = next;
  }

  await setGoogleCalendarId(id);

  let deleted = 0;
  const range = entryRange(entries);
  if (range) {
    const timeMin = `${range.startDate}T00:00:00+01:00`;
    const timeMax = `${range.endDate}T23:59:59+01:00`;
    deleted = await deleteEventsInRange(id, timeMin, timeMax);
  }

  let created = 0;
  for (const entry of entries) {
    const description = buildEventDescription(entry, { richDetails });
    let endDate = entry.date;
    if (!entry.allDay && entry.start && entry.end && entry.end < entry.start) {
      const d = new Date(entry.date + 'T12:00:00');
      d.setDate(d.getDate() + 1);
      endDate = d.toISOString().split('T')[0];
    }

    const body = entry.allDay
      ? {
          summary: entry.type,
          description,
          start: { date: entry.date },
          end: { date: entry.date },
        }
      : {
          summary: entry.type,
          description,
          start: { dateTime: `${entry.date}T${entry.start}:00`, timeZone: 'Europe/Berlin' },
          end: { dateTime: `${endDate}T${entry.end}:00`, timeZone: 'Europe/Berlin' },
        };

    await gfetch(`/calendars/${encodeURIComponent(id)}/events`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    created += 1;
  }
  return { created, deleted };
}

export async function preferredCalendarId(calendars: GoogleCalendar[]): Promise<string | null> {
  const stored = await getGoogleCalendarId();
  if (stored) {
    const hit = calendars.find((c) => c.id === stored);
    if (hit && !isPrimaryCalendar(hit)) return stored;
  }
  return calendars.find((c) => !isPrimaryCalendar(c))?.id || null;
}
