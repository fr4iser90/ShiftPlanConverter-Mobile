/**
 * How ICS / Google calendar events are titled and described.
 * Defaults: Kürzel + times in title; detail lines when data exists.
 */
export type EventFormatPrefs = {
  /** Append `06:30–15:06` to the title for timed shifts. */
  titleTimes: boolean;
  descPause: boolean;
  descIst: boolean;
  descAzk: boolean;
  descStandby: boolean;
};

export const DEFAULT_EVENT_FORMAT: EventFormatPrefs = {
  titleTimes: true,
  descPause: true,
  descIst: true,
  descAzk: true,
  descStandby: true,
};

export function parseEventFormat(raw: string | null): EventFormatPrefs | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<EventFormatPrefs>;
    return {
      titleTimes: o.titleTimes !== false,
      descPause: o.descPause !== false,
      descIst: o.descIst !== false,
      descAzk: o.descAzk !== false,
      descStandby: o.descStandby !== false,
    };
  } catch {
    return null;
  }
}
