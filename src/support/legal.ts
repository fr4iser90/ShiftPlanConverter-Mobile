/**
 * Public project / legal contact — same as Desktop converter config.
 * Not secrets; safe to ship in the APK.
 */
export const SUPPORT_EMAIL = 'support@fr4iser.com';
export const PROJECT_WEBSITE = 'https://shift.fr4iser.com';
/** Public privacy policy URL for Play Console + About (must be HTTPS, no login). */
export const PROJECT_PRIVACY = 'https://shift.fr4iser.com/privacy';
export const PROJECT_GITHUB = 'https://github.com/fr4iser90/ShiftPlanConverter-Mobile';
export const DESKTOP_GITHUB = 'https://github.com/fr4iser90/LOGA3-Automation';
/** GitHub Releases — sideload APKs / manual updates. */
export const PROJECT_RELEASES = `${PROJECT_GITHUB}/releases`;
/**
 * Play Store listing — set when the listing is live, e.g.
 * `https://play.google.com/store/apps/details?id=com.fr4iser.shiftplan`
 * Empty = in-app update check uses GitHub Releases only.
 */
export const PROJECT_PLAY_STORE = '';
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

/** True once Play listing URL is intentional/live (toggle by clearing PROJECT_PLAY_STORE). */
export function isPlayStoreListed(): boolean {
  return /^https:\/\/play\.google\.com\//i.test(PROJECT_PLAY_STORE.trim());
}
