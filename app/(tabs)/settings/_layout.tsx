import { Stack } from 'expo-router';

import { t } from '@/src/i18n';
import { useTheme } from '@/src/ui/useTheme';

export default function SettingsStackLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerTintColor: theme.color.primary,
        headerStyle: { backgroundColor: theme.color.surface },
        headerTitleStyle: { color: theme.color.ink },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: theme.color.canvas },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="setup" options={{ title: t('settingsHubSetup') }} />
      <Stack.Screen name="fetch" options={{ title: t('settingsHubFetch') }} />
      <Stack.Screen name="reminders" options={{ title: t('settingsHubReminders') }} />
      <Stack.Screen name="appearance" options={{ title: t('settingsHubAppearance') }} />
      <Stack.Screen name="about" options={{ title: t('settingsHubAbout') }} />
      <Stack.Screen name="handbook" options={{ title: t('legalHandbook') }} />
    </Stack>
  );
}
