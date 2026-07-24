import { useEffect, useState } from 'react';
import { useColorScheme as useColorSchemeCore } from 'react-native';

import { getSnapshot, subscribe } from '@/src/state/store';

/**
 * Resolved light/dark for the app UI.
 * Honours Settings → themePref (system | light | dark).
 */
export function useColorScheme(): 'light' | 'dark' {
  const system = useColorSchemeCore();
  const [, setTick] = useState(0);
  useEffect(() => subscribe(() => setTick((n) => n + 1)), []);

  const pref = getSnapshot().themePref || 'system';
  if (pref === 'light' || pref === 'dark') return pref;
  return system === 'dark' ? 'dark' : 'light';
}
