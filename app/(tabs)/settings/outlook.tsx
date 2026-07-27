import { useMemo } from 'react';
import { ScrollView } from 'react-native';

import { t } from '@/src/i18n';
import { ExportTargetSoonCard } from '@/src/ui/ExportTargetSoonCard';
import { Screen } from '@/src/ui/Screen';
import { makeSettingsStyles } from '@/src/ui/settingsStyles';
import { useTheme } from '@/src/ui/useTheme';

export default function SettingsOutlookScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeSettingsStyles(theme), [theme]);

  return (
    <Screen>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
        <ExportTargetSoonCard
          title={t('settingsHubOutlook')}
          hint={t('exportOutlookHint')}
          connectLabel={t('outlookConnect')}
          syncLabel={t('outlookSync')}
        />
      </ScrollView>
    </Screen>
  );
}
