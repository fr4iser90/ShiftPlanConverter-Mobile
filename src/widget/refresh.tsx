import React from 'react';
import { Platform } from 'react-native';
import { requestWidgetUpdate } from 'react-native-android-widget';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ShiftEntry } from '../convert/types';
import {
  getLastSuccessfulFetchAt,
  isSyncOverdue,
  loadSchedulePrefs,
} from '../schedule/prefs';
import { buildNextShiftData, buildWeekPlanData } from './data';
import { NextShiftWidget, NEXT_SHIFT_WIDGET } from './NextShiftWidget';
import { resolveWidgetScheme } from './prefs';
import { WeekPlanWidget, WEEK_PLAN_WIDGET } from './WeekPlanWidget';

const ENTRIES_KEY = 'loga3.entries';

async function loadEntries(fallback?: ShiftEntry[]): Promise<ShiftEntry[]> {
  if (fallback) return fallback;
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

/** Push shift data to installed NextShift + WeekPlan widgets (Android). */
export async function refreshHomeWidgets(entries?: ShiftEntry[]): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    const list = await loadEntries(entries);
    const scheme = await resolveWidgetScheme();
    const badge = await syncBadge();
    const nextData = buildNextShiftData(list, scheme, new Date(), badge);
    const weekData = buildWeekPlanData(list, scheme, new Date(), badge);

    await requestWidgetUpdate({
      widgetName: NEXT_SHIFT_WIDGET,
      renderWidget: () => <NextShiftWidget {...nextData} />,
    });
    await requestWidgetUpdate({
      widgetName: WEEK_PLAN_WIDGET,
      renderWidget: () => <WeekPlanWidget {...weekData} />,
    });
  } catch (e) {
    console.warn('widget refresh failed', e);
  }
}

/** @deprecated use refreshHomeWidgets */
export async function refreshNextShiftWidget(entries: ShiftEntry[]): Promise<void> {
  return refreshHomeWidgets(entries);
}
