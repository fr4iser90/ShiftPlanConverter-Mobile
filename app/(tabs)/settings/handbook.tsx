import { useMemo } from 'react';
import { ScrollView } from 'react-native';

import { getSnapshot } from '@/src/state/store';
import { HANDBOOK_DE, HANDBOOK_EN } from '@/src/docs/handbookMarkdown';
import { MarkdownView } from '@/src/ui/MarkdownView';
import { Screen } from '@/src/ui/Screen';
import { makeSettingsStyles } from '@/src/ui/settingsStyles';
import { useTheme } from '@/src/ui/useTheme';

export default function SettingsHandbookScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeSettingsStyles(theme), [theme]);
  const locale = getSnapshot().locale;
  const source = locale === 'en' ? HANDBOOK_EN : HANDBOOK_DE;

  return (
    <Screen bottom>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.container, { paddingBottom: 96 }]}
      >
        <MarkdownView source={source} theme={theme} />
      </ScrollView>
    </Screen>
  );
}
