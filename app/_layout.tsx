import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Platform, StatusBar as RNStatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-reanimated';

import { useColorScheme } from '@/components/useColorScheme';
import { t } from '@/src/i18n';
import { hydrateStore } from '@/src/state/store';
import { hydrateLoga3Env } from '@/src/loga3/env';
import { applySmokeSetupFromUrl, isSmokeSetupUrl } from '@/src/setup/smokeSeed';
import { restoreGoogleSession } from '@/src/sync/google';
import { useTheme } from '@/src/ui/useTheme';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    if (error) {
      console.warn('Font load failed, continuing with system fonts:', error);
    }
  }, [error]);

  useEffect(() => {
    let sub: { remove: () => void } | undefined;
    (async () => {
      await hydrateStore();
      await hydrateLoga3Env();
      try {
        await restoreGoogleSession();
      } catch (e) {
        console.warn('google session restore failed', e);
      }
      try {
        const initial = await Linking.getInitialURL();
        if (isSmokeSetupUrl(initial)) {
          await applySmokeSetupFromUrl(initial!);
          router.replace('/(tabs)');
        }
      } catch (e) {
        console.warn('smoke-setup initial failed', e);
      }
      setBootstrapped(true);
      sub = Linking.addEventListener('url', (e) => {
        if (!isSmokeSetupUrl(e.url)) return;
        void applySmokeSetupFromUrl(e.url)
          .then(() => router.replace('/(tabs)'))
          .catch((err) => console.warn('smoke-setup url failed', err));
      });
    })();
    return () => sub?.remove();
  }, []);

  useEffect(() => {
    if ((loaded || error) && bootstrapped) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error, bootstrapped]);

  if ((!loaded && !error) || !bootstrapped) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const theme = useTheme();

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    RNStatusBar.setBackgroundColor(theme.color.statusBar);
    RNStatusBar.setBarStyle(colorScheme === 'dark' ? 'light-content' : 'dark-content');
  }, [colorScheme, theme.color.statusBar]);

  return (
    <SafeAreaProvider>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="setup"
            options={{
              presentation: 'modal',
              title: t('setupTitle'),
              headerShown: true,
              headerTintColor: theme.color.primary,
              headerStyle: { backgroundColor: theme.color.surface },
              headerTitleStyle: { color: theme.color.ink },
            }}
          />
        </Stack>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
