import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { generateIcs } from '../convert/ics';
import type { ShiftEntry } from '../convert/types';
import { t } from '../i18n';

export async function shareIcsFile(
  entries: ShiftEntry[],
  { richDetails = false, filename = 'dienstplan.ics' }: { richDetails?: boolean; filename?: string } = {}
): Promise<void> {
  if (!entries.length) {
    throw new Error(t('icsNoEntries'));
  }
  const ics = generateIcs(entries, { richDetails });
  const base = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!base) throw new Error(t('icsNoStorage'));
  const path = `${base}${filename}`;
  await FileSystem.writeAsStringAsync(path, ics, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error(t('icsShareUnavailable'));
  }
  await Sharing.shareAsync(path, {
    mimeType: 'text/calendar',
    dialogTitle: t('icsDialogTitle'),
    UTI: 'public.calendar-event',
  });
}
