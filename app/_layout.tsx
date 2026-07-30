import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Platform, StatusBar as RNStatusBar, Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-reanimated';

import { useColorScheme } from '@/components/useColorScheme';
import { t } from '@/src/i18n';
import {
  hydrateStore,
  isPayloadLocked,
  getPayloadError,
  probeEncryptedStorage,
} from '@/src/state/store';
import { hydrateLoga3Env } from '@/src/sources/webview/loga3/env';
import { applySmokeSetupFromUrl, isSmokeSetupUrl } from '@/src/setup/smokeSeed';
import { applyOcrSmokeFromUrl, isOcrSmokeUrl } from '@/src/setup/ocrSmokeIntent';
import {
  applyPayrollSmokeFromUrl,
  isPayrollSmokeUrl,
} from '@/src/setup/payrollSmokeIntent';
import { restoreGoogleSession } from '@/src/sync/google';
import { openErrorReportMail } from '@/src/support/mailto';
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
      if (isPayloadLocked()) {
        const probe = await probeEncryptedStorage();
        const detail = [
          t('storePayloadLocked'),
          '',
          `err=${getPayloadError() || '?'}`,
          `raw=${probe.entriesChars}B enc=${probe.entriesEncrypted} key=${probe.keyPresent}`,
        ].join('\n');
        Alert.alert(t('storePayloadLockedTitle'), detail, [
          { text: 'OK', style: 'cancel' },
          {
            text: t('reportError'),
            onPress: () => {
              void openErrorReportMail({
                error: detail,
                context: 'hydrate / payloadLocked',
              }).catch(() => {});
            },
          },
        ]);
      }
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
        } else if (initial && isOcrSmokeUrl(initial)) {
          await applyOcrSmokeFromUrl(initial, { fromInitialURL: true });
          router.replace('/(tabs)');
        } else if (initial && isPayrollSmokeUrl(initial)) {
          await applyPayrollSmokeFromUrl(initial);
          router.replace('/(tabs)/pruefung');
        }
      } catch (e) {
        // Release: credential smoke deep-links are rejected by design.
        console.warn('smoke-setup initial failed', e);
      }
      setBootstrapped(true);
      // Deep-link listener always registered; applySmokeSetupFromUrl enforces __DEV__ for creds.
      sub = Linking.addEventListener('url', (e) => {
        if (isSmokeSetupUrl(e.url)) {
          void applySmokeSetupFromUrl(e.url)
            .then(() => router.replace('/(tabs)'))
            .catch((err) => console.warn('smoke-setup url failed', err));
          return;
        }
        if (isOcrSmokeUrl(e.url)) {
          void applyOcrSmokeFromUrl(e.url)
            .then(() => router.replace('/(tabs)'))
            .catch((err) => console.warn('ocr-smoke url failed', err));
          return;
        }
        if (isPayrollSmokeUrl(e.url)) {
          void applyPayrollSmokeFromUrl(e.url)
            .then(() => router.replace('/(tabs)/pruefung'))
            .catch((err) => console.warn('payroll-smoke url failed', err));
        }
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
