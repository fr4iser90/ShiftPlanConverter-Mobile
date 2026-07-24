/**
 * Compare installed app version to latest GitHub Release.
 * Public API — unauthenticated, rate-limited (~60/h); fine for Settings taps.
 */
import Constants from 'expo-constants';
import { PROJECT_GITHUB } from '@/src/support/legal';
import { compareVersions } from '@/src/update/versionCompare';

export type UpdateCheckResult =
  | { status: 'up_to_date'; installed: string; latest: string }
  | {
      status: 'update_available';
      installed: string;
      latest: string;
      htmlUrl: string;
      name?: string;
    }
  | { status: 'no_release'; installed: string }
  | { status: 'error'; installed: string; message: string };

function githubApiReleasesLatest(): string {
  const m = /github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(PROJECT_GITHUB.trim());
  if (!m) throw new Error('PROJECT_GITHUB is not a github.com URL');
  return `https://api.github.com/repos/${m[1]}/${m[2]}/releases/latest`;
}

export function installedAppVersion(): string {
  return String(Constants.expoConfig?.version || '0.0.0').replace(/^v/i, '').trim();
}

export { compareVersions, parseVersionParts } from '@/src/update/versionCompare';

export async function checkGithubLatestRelease(): Promise<UpdateCheckResult> {
  const installed = installedAppVersion();
  try {
    const res = await fetch(githubApiReleasesLatest(), {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'LOGA3-Automation-Mobile',
      },
    });
    if (res.status === 404) {
      return { status: 'no_release', installed };
    }
    if (!res.ok) {
      return {
        status: 'error',
        installed,
        message: `GitHub HTTP ${res.status}`,
      };
    }
    const json = (await res.json()) as {
      tag_name?: string;
      name?: string;
      html_url?: string;
      draft?: boolean;
      prerelease?: boolean;
    };
    if (json.draft) {
      return { status: 'no_release', installed };
    }
    const latest = String(json.tag_name || '').replace(/^v/i, '').trim();
    if (!latest) {
      return { status: 'no_release', installed };
    }
    if (compareVersions(installed, latest) < 0) {
      return {
        status: 'update_available',
        installed,
        latest,
        htmlUrl: json.html_url || `${PROJECT_GITHUB}/releases`,
        name: json.name,
      };
    }
    return { status: 'up_to_date', installed, latest };
  } catch (e) {
    return {
      status: 'error',
      installed,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}
