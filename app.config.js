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
if (!plugins.some((p) => (Array.isArray(p) ? p[0] : p) === 'react-native-android-widget')) {
  plugins.push([
    'react-native-android-widget',
    {
      widgets: [
        {
          name: 'NextShift',
          label: 'LOGA3 nächste Schicht',
          description: 'Zeigt die nächste Schicht aus dem Dienstplan',
          // Android: ~70×cells−30. Old 250dp forced ~4×2 even with target 3.
          minWidth: '110dp',
          minHeight: '40dp',
          targetCellWidth: 2,
          targetCellHeight: 1,
          resizeMode: 'horizontal|vertical',
          previewImage: './assets/images/icon.png',
          updatePeriodMillis: 1800000,
        },
        {
          name: 'WeekPlan',
          label: 'LOGA3 diese Woche',
          description: 'Wochenübersicht der Schichten (Mo–So)',
          // 4×1 default; minHeight 40dp = 1 row (110dp forced 2 rows before).
          minWidth: '180dp',
          minHeight: '40dp',
          targetCellWidth: 4,
          targetCellHeight: 1,
          resizeMode: 'horizontal|vertical',
          previewImage: './assets/images/weekplan_widget_preview.png',
          updatePeriodMillis: 1800000,
        },
      ],
    },
  ]);
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
