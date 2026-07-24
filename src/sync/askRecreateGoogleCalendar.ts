/**
 * Interactive recovery when the saved Google calendar was deleted.
 */
import { Alert } from 'react-native';

import { t } from '@/src/i18n';
import { createGoogleCalendar } from '@/src/sync/google';
import { setGoogleCalendarId } from '@/src/state/store';

const DEFAULT_NAME = 'Dienstplan';

/** Alert: recreate missing calendar? Resolves to new id or null (cancel / error). */
export function askRecreateGoogleCalendar(_oldId: string): Promise<string | null> {
  return new Promise((resolve) => {
    Alert.alert(t('googleCalendarMissingTitle'), t('googleCalendarMissingBody'), [
      {
        text: t('googleCalendarMissingCancel'),
        style: 'cancel',
        onPress: () => resolve(null),
      },
      {
        text: t('googleCalendarRecreate'),
        onPress: () => {
          void (async () => {
            try {
              const created = await createGoogleCalendar(DEFAULT_NAME);
              await setGoogleCalendarId(created.id);
              resolve(created.id);
            } catch (e) {
              Alert.alert(
                t('googleNewCalendar'),
                e instanceof Error ? e.message : String(e)
              );
              resolve(null);
            }
          })();
        },
      },
    ]);
  });
}
