import { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { t } from '@/src/i18n';
import {
  clearOcrPreferredName,
  loadOcrPreferredName,
  saveOcrPreferredName,
} from '@/src/state/ocrPreferredName';
import { clearOcrNameAliases } from '@/src/state/ocrNameAliases';
import { AppButton } from '@/src/ui/AppButton';
import { AppCard, Meta, SectionTitle } from '@/src/ui/AppCard';
import { Screen } from '@/src/ui/Screen';
import { makeSettingsStyles } from '@/src/ui/settingsStyles';
import { useTheme } from '@/src/ui/useTheme';

export default function SettingsOcrScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeSettingsStyles(theme), [theme]);
  const [name, setName] = useState('');
  const [saved, setSaved] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        const v = await loadOcrPreferredName();
        setSaved(v);
        setName(v || '');
      })();
    }, [])
  );

  const onSave = async () => {
    const v = name.trim();
    if (!v) {
      await clearOcrPreferredName();
      await clearOcrNameAliases();
      setSaved(null);
      Alert.alert(t('settingsOcrName'), t('settingsOcrNameCleared'));
      return;
    }
    await saveOcrPreferredName(v);
    setSaved(v);
    Alert.alert(t('settingsOcrName'), t('settingsOcrNameSaved'));
  };

  return (
    <Screen>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
        <AppCard>
          <SectionTitle>{t('settingsOcrName')}</SectionTitle>
          <Meta>{t('settingsOcrNameHint')}</Meta>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder={t('settingsOcrNamePlaceholder')}
            placeholderTextColor={theme.color.inkMuted}
            autoCapitalize="words"
            autoCorrect={false}
          />
          {saved ? <Meta>{t('settingsOcrNameCurrent', { name: saved })}</Meta> : null}
          <View style={{ marginTop: 12, gap: 8 }}>
            <AppButton title={t('settingsOcrNameSave')} onPress={() => void onSave()} />
            {saved ? (
              <AppButton
                title={t('settingsOcrNameClear')}
                variant="ghost"
                onPress={() => {
                  setName('');
                  void (async () => {
                    await clearOcrPreferredName();
                    await clearOcrNameAliases();
                    setSaved(null);
                    Alert.alert(t('settingsOcrName'), t('settingsOcrNameCleared'));
                  })();
                }}
              />
            ) : null}
          </View>
        </AppCard>
        <AppCard>
          <SectionTitle>{t('settingsHubOcr')}</SectionTitle>
          <Meta>{t('settingsOcrWhere')}</Meta>
        </AppCard>
      </ScrollView>
    </Screen>
  );
}
