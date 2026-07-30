import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Tabs } from 'expo-router';
import { useEffect, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { getSnapshot, hydrateStore, subscribe } from '@/src/state/store';
import { isPayrollSupportedForScope } from '@/src/packs';
import { t } from '@/src/i18n';

function TabBarIcon(props: { name: React.ComponentProps<typeof FontAwesome>['name']; color: string }) {
  return <FontAwesome size={22} style={{ marginBottom: -2 }} {...props} />;
}

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const [, setTick] = useState(0);
  const dark = colorScheme === 'dark';
  const bottomGap = Math.max(insets.bottom, 8) + 6;

  useEffect(() => {
    hydrateStore();
    let locale = getSnapshot().locale;
    let scopeKey = `${getSnapshot().packId}/${getSnapshot().groupId}/${getSnapshot().areaId}`;
    return subscribe(() => {
      const snap = getSnapshot();
      const nextScope = `${snap.packId}/${snap.groupId}/${snap.areaId}`;
      if (snap.locale !== locale || nextScope !== scopeKey) {
        locale = snap.locale;
        scopeKey = nextScope;
        setTick((n) => n + 1);
      }
    });
  }, []);

  const snap = getSnapshot();
  const payrollTab = isPayrollSupportedForScope(snap.packId, snap.groupId, snap.areaId);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        tabBarInactiveTintColor: Colors[colorScheme ?? 'light'].tabIconDefault,
        tabBarStyle: {
          position: 'absolute',
          left: 12,
          right: 12,
          bottom: bottomGap,
          height: 58,
          paddingBottom: 6,
          paddingTop: 4,
          borderRadius: 16,
          borderTopWidth: 0,
          backgroundColor: dark ? '#0F172A' : '#FFFFFF',
          elevation: 8,
          shadowColor: '#000',
          shadowOpacity: dark ? 0.35 : 0.12,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        headerShown: false,
        freezeOnBlur: true,
        sceneStyle: { paddingBottom: 58 + bottomGap + 8 },
      }}
    >
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
        name="pruefung"
        options={{
          title: t('tabPayroll'),
          href: payrollTab ? undefined : null,
          tabBarIcon: ({ color }) => <TabBarIcon name="balance-scale" color={String(color)} />,
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
