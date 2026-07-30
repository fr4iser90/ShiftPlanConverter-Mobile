import { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { t } from '@/src/i18n';
import { getSnapshot, subscribeKeys } from '@/src/state/store';
import { shareIcsFile } from '@/src/sync/shareIcs';
import { resolveStoredEntries } from '@/src/convert/pipeline';
import { getMappingForScope } from '@/src/packs';
import { AppButton } from '@/src/ui/AppButton';
import { AppCard, Meta, ScreenTitle, SectionTitle } from '@/src/ui/AppCard';
import { GoogleSyncCard } from '@/src/ui/GoogleSyncCard';
import { ExportTargetSoonCard } from '@/src/ui/ExportTargetSoonCard';
import { Screen } from '@/src/ui/Screen';
import { useTheme } from '@/src/ui/useTheme';
import type { AppTheme } from '@/src/ui/theme';

function makeExportStyles(theme: AppTheme) {
  return StyleSheet.create({
    scroll: { flex: 1, backgroundColor: theme.color.canvas },
    container: { padding: theme.space.lg, gap: theme.space.md, paddingBottom: 40 },
  });
}

export default function ExportScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeExportStyles(theme), [theme]);
  const [, setTick] = useState(0);
  const snap = getSnapshot();
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const unsub = subscribeKeys(
        [
          'entries',
          'locale',
          'themePref',
          'packId',
          'groupId',
          'areaId',
          'preset',
          'userMappings',
          'eventFormat',
        ],
        () => setTick((n) => n + 1)
      );
      return unsub;
    }, [])
  );

  const resolvedEntries = () => {
    const mapping =
      snap.packId && snap.groupId && snap.areaId
        ? getMappingForScope(snap.packId, snap.groupId, snap.areaId) || undefined
        : undefined;
    return resolveStoredEntries(snap.entries, {
      preset: snap.preset || undefined,
      mapping,
      userMappings: snap.userMappings,
    });
  };

  const onShareIcs = async () => {
    try {
      setBusy(true);
      await shareIcsFile(resolvedEntries(), { eventFormat: snap.eventFormat });
    } catch (e) {
      Alert.alert('ICS', String(e));
    } finally {
      setBusy(false);
    }
  };

  const hasEntries = snap.entries.length > 0;

  return (
    <Screen>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
        <ScreenTitle>{t('tabExport')}</ScreenTitle>
        <Meta>
          {hasEntries
            ? t('exportReady', { count: snap.entries.length })
            : t('exportEmpty')}
        </Meta>

        <AppCard>
          <SectionTitle>{t('exportIcsSection')}</SectionTitle>
          <Meta>{t('exportIcsHint')}</Meta>
          <AppButton
            title={t('exportIcs')}
            variant="secondary"
            onPress={() => void onShareIcs()}
            disabled={busy || !hasEntries}
            busy={busy}
          />
        </AppCard>

        <GoogleSyncCard
          title={t('settingsHubGoogle')}
          hint={t('exportGoogleHint')}
          showSync
        />

        <ExportTargetSoonCard
          title={t('settingsHubOutlook')}
          hint={t('exportOutlookHint')}
          connectLabel={t('outlookConnect')}
          syncLabel={t('outlookSync')}
        />

        <ExportTargetSoonCard
          title={t('settingsHubApple')}
          hint={t('exportAppleHint')}
          connectLabel={t('appleConnect')}
          syncLabel={t('appleSync')}
        />
      </ScrollView>
    </Screen>
  );
}
