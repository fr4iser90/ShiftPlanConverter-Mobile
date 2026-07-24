import React from 'react';
import { Platform } from 'react-native';
import { requestWidgetUpdate } from 'react-native-android-widget';

import type { ShiftEntry } from '../convert/types';
import { formatDeDate } from '../calendar/dates';
import { findNextShift, formatShiftLine } from '../calendar/shifts';
import { NextShiftWidget, NEXT_SHIFT_WIDGET } from './NextShiftWidget';

/** Push next-shift data to any installed home-screen widgets (Android). */
export async function refreshNextShiftWidget(entries: ShiftEntry[]): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    const next = findNextShift(entries);
    const data = next
      ? {
          empty: false,
          title: formatShiftLine(next),
          subtitle: formatDeDate(next.date),
        }
      : {
          empty: true,
          title: 'Keine Schichten',
          subtitle: 'In der App aktualisieren',
        };
    await requestWidgetUpdate({
      widgetName: NEXT_SHIFT_WIDGET,
      renderWidget: () => <NextShiftWidget {...data} />,
    });
  } catch (e) {
    console.warn('widget refresh failed', e);
  }
}
