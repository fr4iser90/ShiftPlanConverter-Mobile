import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { buildEventDescription } from '../convert/eventDescription';
import type { ShiftEntry } from '../convert/types';
import { getGoogleCalendarId, setGoogleCalendarId } from '../state/store';

WebBrowser.maybeCompleteAuthSession();

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
];

function clientId(): string | null {
  if (Platform.OS === 'ios') {
    return process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || null;
  }
  if (Platform.OS === 'android') {
    return (
      process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ||
      process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
      null
    );
  }
  return process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || null;
}

export type GoogleCalendar = {
  id: string;
  summary: string;
  primary?: boolean;
};

let accessToken: string | null = null;

export function hasGoogleClientConfig(): boolean {
  return !!clientId();
}

export async function connectGoogle(): Promise<string> {
  const id = clientId();
  if (!id) {
    throw new Error(
      'Google Client ID fehlt. Setze EXPO_PUBLIC_GOOGLE_*_CLIENT_ID in .env (siehe .env.example).'
    );
  }

  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'loga3mobile' });
  const discovery = {
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
  };

  const request = new AuthSession.AuthRequest({
    clientId: id,
    redirectUri,
    scopes: SCOPES,
    responseType: AuthSession.ResponseType.Token,
    usePKCE: false,
    extraParams: { include_granted_scopes: 'true' },
  });

  const result = await request.promptAsync(discovery);
  if (result.type !== 'success' || !result.authentication?.accessToken) {
    throw new Error('Google OAuth abgebrochen oder fehlgeschlagen.');
  }
  accessToken = result.authentication.accessToken;
  return accessToken;
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
  return res.json();
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

export async function syncEntriesToGoogle(
  entries: ShiftEntry[],
  calendarId: string,
  { richDetails = false }: { richDetails?: boolean } = {}
): Promise<number> {
  if (!entries.length) return 0;
  await setGoogleCalendarId(calendarId);
  let count = 0;
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

    await gfetch(`/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    count += 1;
  }
  return count;
}

export async function preferredCalendarId(calendars: GoogleCalendar[]): Promise<string | null> {
  const stored = await getGoogleCalendarId();
  if (stored && calendars.some((c) => c.id === stored)) return stored;
  const nonPrimary = calendars.find((c) => !isPrimaryCalendar(c));
  return nonPrimary?.id || calendars[0]?.id || null;
}
