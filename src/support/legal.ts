/**
 * Public project / legal contact — same as Desktop converter config.
 * Not secrets; safe to ship in the APK.
 */
export const SUPPORT_EMAIL = 'support@fr4iser.com';
export const PROJECT_WEBSITE = 'https://shift.fr4iser.com';
export const PROJECT_GITHUB = 'https://github.com/fr4iser90/LOGA3-Automation-Mobile';
export const DESKTOP_GITHUB = 'https://github.com/fr4iser90/LOGA3-Automation';
/** GitHub Releases — sideload APKs / manual updates. */
export const PROJECT_RELEASES = `${PROJECT_GITHUB}/releases`;
/** German changelog (default for local testers). */
export const PROJECT_CHANGELOG_DE = `${PROJECT_GITHUB}/blob/main/CHANGELOG.md`;
/** English changelog. */
export const PROJECT_CHANGELOG_EN = `${PROJECT_GITHUB}/blob/main/CHANGELOG.en.md`;
/** @deprecated use PROJECT_CHANGELOG_DE / locale helper */
export const PROJECT_CHANGELOG = PROJECT_CHANGELOG_DE;

export function changelogUrlForLocale(locale: string | null | undefined): string {
  return locale === 'en' ? PROJECT_CHANGELOG_EN : PROJECT_CHANGELOG_DE;
}

/** Soft mailto body budget (URL length limits on Android/iOS). */
export const MAILTO_SAFE_CHARS = 1400;
