import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { generateIcs } from '../convert/ics';
import type { ShiftEntry } from '../convert/types';

export async function shareIcsFile(
  entries: ShiftEntry[],
  { richDetails = false, filename = 'dienstplan.ics' }: { richDetails?: boolean; filename?: string } = {}
): Promise<void> {
  if (!entries.length) {
    throw new Error('Keine Einträge zum Exportieren.');
  }
  const ics = generateIcs(entries, { richDetails });
  const base = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!base) throw new Error('Kein App-Dateispeicher verfügbar.');
  const path = `${base}${filename}`;
  await FileSystem.writeAsStringAsync(path, ics, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error('Share Sheet auf dieser Plattform nicht verfügbar.');
  }
  await Sharing.shareAsync(path, {
    mimeType: 'text/calendar',
    dialogTitle: 'Dienstplan ICS',
    UTI: 'public.calendar-event',
  });
}
