import { useMemo } from 'react';

import { useColorScheme } from '@/components/useColorScheme';
import { themeFor, type AppTheme } from '@/src/ui/theme';

/** System light/dark → LOGA3 theme tokens. */
export function useTheme(): AppTheme {
  const scheme = useColorScheme();
  return useMemo(() => themeFor(scheme === 'dark' ? 'dark' : 'light'), [scheme]);
}
