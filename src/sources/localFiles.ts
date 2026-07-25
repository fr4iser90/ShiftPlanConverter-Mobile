import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { t } from '../i18n';
import type { Source, SourceArtifact, SourceRunOpts, SourceRunResult } from './types';

async function readUriBytes(uri: string): Promise<Uint8Array> {
  const file = new File(uri);
  const ab = await file.arrayBuffer();
  return new Uint8Array(ab);
}

async function readUriText(uri: string): Promise<string> {
  const bytes = await readUriBytes(uri);
  return new TextDecoder('utf-8').decode(bytes);
}

/**
 * Local PDF / CSV / ICS import (no login, no WebView).
 */
export const localFilesSource: Source = {
  id: 'local-files',
  kind: 'local',
  needsCredentials: false,
  needsWebView: false,
  labelKey: 'sourceLocalFiles',
  async run(opts: SourceRunOpts): Promise<SourceRunResult> {
    opts.onStatus?.({ line: t('sourceLocalRunning') });
    const picked = await DocumentPicker.getDocumentAsync({
      type: [
        'application/pdf',
        'text/csv',
        'text/calendar',
        'text/plain',
        'application/octet-stream',
        '*/*',
      ],
      copyToCacheDirectory: true,
      multiple: true,
    });
    if (picked.canceled || !picked.assets?.length) {
      return { artifacts: [], errors: [] };
    }

    const artifacts: SourceArtifact[] = [];
    const errors: string[] = [];
    const now = new Date();
    const fallbackMonth = opts.period?.months?.[0] || now.getMonth() + 1;
    const fallbackYear = opts.period?.year || now.getFullYear();

    for (const asset of picked.assets) {
      const name = (asset.name || asset.uri || '').toLowerCase();
      const mime = (asset.mimeType || '').toLowerCase();
      try {
        if (mime.includes('pdf') || name.endsWith('.pdf')) {
          const bytes = await readUriBytes(asset.uri);
          artifacts.push({
            kind: 'pdf',
            month: fallbackMonth,
            year: fallbackYear,
            bytes,
          });
          continue;
        }
        if (mime.includes('csv') || name.endsWith('.csv')) {
          artifacts.push({ kind: 'csv', text: await readUriText(asset.uri) });
          continue;
        }
        if (
          mime.includes('calendar') ||
          name.endsWith('.ics') ||
          name.endsWith('.ical')
        ) {
          artifacts.push({ kind: 'ics', text: await readUriText(asset.uri) });
          continue;
        }
        if (mime.includes('text') || name.endsWith('.txt')) {
          artifacts.push({
            kind: 'text',
            month: fallbackMonth,
            year: fallbackYear,
            text: await readUriText(asset.uri),
          });
          continue;
        }
        errors.push(`${asset.name || asset.uri}: unsupported type`);
      } catch (e) {
        errors.push(
          `${asset.name || asset.uri}: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    }

    return { artifacts, errors };
  },
};
