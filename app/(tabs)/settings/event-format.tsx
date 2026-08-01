import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Switch, Text, View } from 'react-native';

import { buildEventDescription, buildEventSummary } from '@/src/convert/eventDescription';
import { expandEntriesForExport } from '@/src/convert/overnightExport';
import type { ShiftEntry } from '@/src/convert/types';
import { t } from '@/src/i18n';
import {
  getSnapshot,
  setEventFormat,
  subscribeKeys,
  type EventFormatPrefs,
} from '@/src/state/store';
import { AppCard, Meta, SectionTitle } from '@/src/ui/AppCard';
import { Screen } from '@/src/ui/Screen';
import { makeSettingsStyles } from '@/src/ui/settingsStyles';
import { useTheme } from '@/src/ui/useTheme';

const PREVIEW_ENTRY: ShiftEntry = {
  type: 'GE*',
  date: '2026-07-15',
  start: '06:30',
  end: '15:06',
  breakMinutes: '0:30',
  actual: '8:06',
  timeAccountDaily: '0:36',
  onCallPercent: '12.5',
  onCallRated: '1:00',
};

const PREVIEW_OVERNIGHT: ShiftEntry = {
  type: 'MO',
  date: '2026-07-15',
  start: '11:35',
  end: '07:35',
};

export default function SettingsEventFormatScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeSettingsStyles(theme), [theme]);
  const [, setTick] = useState(0);
  const snap = getSnapshot();

  useEffect(
    () => subscribeKeys(['eventFormat', 'locale'], () => setTick((n) => n + 1)),
    []
  );

  const fmt = snap.eventFormat;
  const patchBool = (key: keyof EventFormatPrefs, value: boolean) => {
    void setEventFormat({ [key]: value });
  };

  const previewTitle = buildEventSummary(PREVIEW_ENTRY, fmt);
  const previewBody = buildEventDescription(PREVIEW_ENTRY, fmt);
  const overnightPieces = expandEntriesForExport([PREVIEW_OVERNIGHT], fmt.overnightMode);
  const overnightLines = overnightPieces.map((e) => buildEventSummary(e, fmt));

  return (
    <Screen>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
        <AppCard>
          <SectionTitle>{t('eventFormatTitleSection')}</SectionTitle>
          <Meta>{t('eventFormatTitleHint')}</Meta>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>{t('eventFormatTitleTimes')}</Text>
            <Switch
              value={fmt.titleTimes}
              onValueChange={(v) => patchBool('titleTimes', v)}
              trackColor={{ true: theme.color.primaryPressed, false: theme.color.border }}
              thumbColor="#fff"
            />
          </View>
        </AppCard>

        <AppCard>
          <SectionTitle>{t('eventFormatDescSection')}</SectionTitle>
          <Meta>{t('eventFormatDescHint')}</Meta>
          {(
            [
              ['descPause', 'eventFormatDescPause'],
              ['descIst', 'eventFormatDescIst'],
              ['descAzk', 'eventFormatDescAzk'],
              ['descStandby', 'eventFormatDescStandby'],
            ] as const
          ).map(([key, labelKey]) => (
            <View key={key} style={styles.switchRow}>
              <Text style={styles.switchLabel}>{t(labelKey)}</Text>
              <Switch
                value={fmt[key]}
                onValueChange={(v) => patchBool(key, v)}
                trackColor={{ true: theme.color.primaryPressed, false: theme.color.border }}
                thumbColor="#fff"
              />
            </View>
          ))}
        </AppCard>

        <AppCard>
          <SectionTitle>{t('eventFormatOvernightSection')}</SectionTitle>
          <Meta>{t('eventFormatOvernightHint')}</Meta>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>{t('eventFormatOvernightSplit')}</Text>
            <Switch
              value={fmt.overnightMode === 'split'}
              onValueChange={(v) =>
                void setEventFormat({ overnightMode: v ? 'split' : 'span' })
              }
              trackColor={{ true: theme.color.primaryPressed, false: theme.color.border }}
              thumbColor="#fff"
            />
          </View>
          <Text style={[styles.switchLabel, { marginTop: 12, fontWeight: '600' }]}>
            {t('eventFormatPreviewOvernight')}
          </Text>
          {overnightLines.map((line, i) => (
            <Text
              key={`${line}-${i}`}
              style={{ color: theme.color.inkSecondary, fontSize: 13, marginTop: 4 }}
            >
              {line}
            </Text>
          ))}
        </AppCard>

        <AppCard>
          <SectionTitle>{t('eventFormatPreview')}</SectionTitle>
          <Meta>{t('eventFormatPreviewHint')}</Meta>
          <Text style={styles.switchLabel}>{previewTitle}</Text>
          <Text style={{ color: theme.color.inkSecondary, fontSize: 13, marginTop: 8 }}>
            {previewBody}
          </Text>
        </AppCard>
      </ScrollView>
    </Screen>
  );
}
