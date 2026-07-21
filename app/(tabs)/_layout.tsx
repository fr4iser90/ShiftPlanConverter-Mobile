import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Tabs } from 'expo-router';
import { useEffect, useState } from 'react';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { hydrateStore, subscribe } from '@/src/state/store';
import { t } from '@/src/i18n';

function TabBarIcon(props: { name: React.ComponentProps<typeof FontAwesome>['name']; color: string }) {
  return <FontAwesome size={22} style={{ marginBottom: -2 }} {...props} />;
}

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const [, setTick] = useState(0);

  useEffect(() => {
    hydrateStore();
    return subscribe(() => setTick((n) => n + 1));
  }, []);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: useClientOnlyValue(false, true),
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabFetch'),
          tabBarIcon: ({ color }) => <TabBarIcon name="download" color={String(color)} />,
        }}
      />
      <Tabs.Screen
        name="preview"
        options={{
          title: t('tabPreview'),
          tabBarIcon: ({ color }) => <TabBarIcon name="calendar" color={String(color)} />,
        }}
      />
      <Tabs.Screen
        name="export"
        options={{
          title: t('tabExport'),
          tabBarIcon: ({ color }) => <TabBarIcon name="share-alt" color={String(color)} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('tabSettings'),
          tabBarIcon: ({ color }) => <TabBarIcon name="cog" color={String(color)} />,
        }}
      />
    </Tabs>
  );
}
