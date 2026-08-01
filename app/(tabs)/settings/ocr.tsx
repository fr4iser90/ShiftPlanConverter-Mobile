import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { t } from '@/src/i18n';
import { getOcrConfigForScope, getPackById } from '@/src/packs';
import {
  listOcrLayoutsForPack,
} from '@/src/sources/ocr/packLayouts';
import type { OcrLayoutId } from '@/src/sources/ocr/layouts';
import { loadOcrLayoutId, saveOcrLayoutId } from '@/src/state/ocrLayout';
import {
  clearOcrPreferredName,
  loadOcrPreferredName,
  saveOcrPreferredName,
} from '@/src/state/ocrPreferredName';
import { clearOcrNameAliases } from '@/src/state/ocrNameAliases';
import { getSnapshot } from '@/src/state/store';
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
  const [layoutId, setLayoutId] = useState<OcrLayoutId>('auto');
  const [layoutOptions, setLayoutOptions] = useState(() => listOcrLayoutsForPack(null));

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        const v = await loadOcrPreferredName();
        setSaved(v);
        setName(v || '');
        const snap = getSnapshot();
        const pack = getPackById(snap.packId);
        const ocr = getOcrConfigForScope(pack, snap.groupId, snap.areaId);
        setLayoutOptions(listOcrLayoutsForPack(ocr, await loadOcrLayoutId()));
        setLayoutId(await loadOcrLayoutId());
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

  const onPickLayout = async (id: OcrLayoutId) => {
    setLayoutId(id);
    await saveOcrLayoutId(id);
  };

  return (
    <Screen>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
        <AppCard>
          <SectionTitle>{t('settingsOcrLayout')}</SectionTitle>
          <Meta>{t('settingsOcrLayoutHint')}</Meta>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            {layoutOptions.map((layout) => {
              const on = layoutId === layout.id;
              return (
                <Pressable
                  key={layout.id}
                  onPress={() => void onPickLayout(layout.id)}
                  style={[
                    {
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: on ? theme.color.primary : theme.color.border,
                      backgroundColor: on ? theme.color.primary : 'transparent',
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: on ? theme.color.primaryText : theme.color.ink,
                      fontSize: 14,
                    }}
                  >
                    {t(layout.labelKey as 'ocrLayoutRaw')}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </AppCard>
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
