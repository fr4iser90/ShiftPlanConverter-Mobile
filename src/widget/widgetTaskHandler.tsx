import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ShiftEntry } from '../convert/types';
import {
  getLastSuccessfulFetchAt,
  isSyncOverdue,
  loadSchedulePrefs,
} from '../schedule/prefs';
import { buildNextShiftData, buildWeekPlanData } from './data';
import { NextShiftWidget, NEXT_SHIFT_WIDGET } from './NextShiftWidget';
import { loadWidgetPrefs, resolveWidgetScheme } from './prefs';
import { WeekPlanWidget, WEEK_PLAN_WIDGET } from './WeekPlanWidget';

const ENTRIES_KEY = 'loga3.entries';

async function loadEntries(): Promise<ShiftEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(ENTRIES_KEY);
    return (raw ? JSON.parse(raw) : []) as ShiftEntry[];
  } catch {
    return [];
  }
}

async function syncBadge(): Promise<string | null> {
  const prefs = await loadSchedulePrefs();
  if (!prefs.widgetBadge) return null;
  const last = await getLastSuccessfulFetchAt();
  if (!isSyncOverdue(prefs, last)) return null;
  return 'Sync fällig — App öffnen';
}

const UPDATE_ACTIONS = new Set([
  'WIDGET_ADDED',
  'WIDGET_UPDATE',
  'WIDGET_RESIZED',
  'WIDGET_CLICK',
]);

export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  const { widgetInfo, widgetAction, renderWidget } = props;
  if (!UPDATE_ACTIONS.has(widgetAction)) return;

  const entries = await loadEntries();
  const scheme = await resolveWidgetScheme();
  const wprefs = await loadWidgetPrefs();
  const badge = await syncBadge();

  if (widgetInfo.widgetName === NEXT_SHIFT_WIDGET) {
    renderWidget(
      <NextShiftWidget
        {...buildNextShiftData(entries, scheme, new Date(), badge, wprefs.density)}
      />
    );
    return;
  }
  if (widgetInfo.widgetName === WEEK_PLAN_WIDGET) {
    renderWidget(
      <WeekPlanWidget
        {...buildWeekPlanData(
          entries,
          scheme,
          new Date(),
          badge,
          wprefs.density,
          wprefs.showTimes
        )}
      />
    );
  }
}
