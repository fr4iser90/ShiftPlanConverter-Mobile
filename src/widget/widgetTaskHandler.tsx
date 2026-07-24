import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ShiftEntry } from '../convert/types';
import { formatDeDate } from '../calendar/dates';
import { findNextShift, formatShiftLine } from '../calendar/shifts';
import { NextShiftWidget, NEXT_SHIFT_WIDGET, type NextShiftWidgetData } from './NextShiftWidget';

const ENTRIES_KEY = 'loga3.entries';

async function loadWidgetData(): Promise<NextShiftWidgetData> {
  try {
    const raw = await AsyncStorage.getItem(ENTRIES_KEY);
    const entries = (raw ? JSON.parse(raw) : []) as ShiftEntry[];
    const next = findNextShift(entries);
    if (!next) {
      return {
        empty: true,
        title: 'Keine Schichten',
        subtitle: 'In der App aktualisieren',
      };
    }
    return {
      empty: false,
      title: formatShiftLine(next),
      subtitle: formatDeDate(next.date),
    };
  } catch {
    return {
      empty: true,
      title: 'LOGA3',
      subtitle: 'App öffnen',
    };
  }
}

export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  const { widgetInfo, widgetAction, renderWidget } = props;
  if (widgetInfo.widgetName !== NEXT_SHIFT_WIDGET) return;

  if (
    widgetAction === 'WIDGET_ADDED' ||
    widgetAction === 'WIDGET_UPDATE' ||
    widgetAction === 'WIDGET_RESIZED' ||
    widgetAction === 'WIDGET_CLICK'
  ) {
    const data = await loadWidgetData();
    renderWidget(<NextShiftWidget {...data} />);
  }
}
