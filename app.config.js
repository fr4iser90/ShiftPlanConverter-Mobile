/**
 * Expo config — no tenant URL, username, or password in the binary.
 * Setup happens on-device: Settings/Holen → Secure Store + AsyncStorage.
 * Packs (Arbeitgeber) ship as code; selection is per installation.
 */
const appJson = require('./app.json');

function env(name) {
  return String(process.env[name] || '').trim();
}

const plugins = [...(appJson.expo.plugins || [])];
if (!plugins.some((p) => (Array.isArray(p) ? p[0] : p) === '@react-native-google-signin/google-signin')) {
  plugins.push('@react-native-google-signin/google-signin');
}

module.exports = {
  expo: {
    ...appJson.expo,
    plugins,
    extra: {
      ...(appJson.expo.extra || {}),
      // Web client (Desktop parity) — used as webClientId for Google Sign-In tokens.
      googleClientId: env('GOOGLE_CLIENT_ID') || env('LOGA3_GOOGLE_CLIENT_ID'),
      // Android OAuth client id (optional in JS; must exist in GCP with package+SHA-1).
      googleAndroidClientId: env('GOOGLE_ANDROID_CLIENT_ID'),
      googleIosClientId: env('GOOGLE_IOS_CLIENT_ID'),
    },
  },
};
