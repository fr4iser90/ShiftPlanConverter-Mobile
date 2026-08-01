# Google OAuth — Android (Option A)

The mobile app uses **Google Sign-In (Play Services)** on Android.
Custom-scheme redirects (`shiftplan://`) on a **Web** OAuth client are **not** accepted by Google Cloud Console.

## What to create in Google Cloud

Use the **same project** as the desktop web client (`443643010945-…`):

### 1. Calendar API

APIs & Services → Library → **Google Calendar API** → Enable.

### 2. Android OAuth client (new)

APIs & Services → Credentials → **Create OAuth client ID** → type **Android**

| Field | Value |
|-------|--------|
| Package name | `com.fr4iser.shiftplan` |
| SHA-1 | see below |

**No** authorized redirect URIs, **no** JavaScript origins.

### 3. Keep the existing Web client

The built-in web client stays as `webClientId` (token minting).  
Do **not** add `shiftplan://` there.

### 4. OAuth consent screen

In testing mode: add your Google account as a **test user**.  
Scopes: Calendar + Calendar Events (requested by the app).

## SHA-1 for signing

### Debug / local `assembleRelease` (current default keystore)

```bash
nix-shell --run './scripts/dev/google-sha1.sh'
```

```
SHA1: 5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25
```

### Production / Play Store (required before store)

Play Console → **Mit Google Play geschützt** → **Google Play Store-Schutz** → **Play App-Signatur**.

Android OAuth clients (same package `com.fr4iser.shiftplan`), **one SHA-1 per client**:

| Key | Where | SHA-1 |
|-----|--------|-------|
| **App signing (current)** | App-Signaturschlüssel → Klassischer Schlüssel | `FE:66:7A:65:A0:C8:88:DF:6D:84:CF:18:AF:4E:7B:54:A8:5A:DD:D6` |
| **App signing (previous)** | Bisherige App-Signaturschlüssel — keep until devices update | `B9:DD:88:C2:67:39:52:46:A9:56:68:EA:8E:34:E9:FA:EC:DC:BB:CE` |
| **Upload** (EAS AAB) | Zertifikat des Uploadschlüssels | `A3:3F:B7:3C:25:45:58:8D:6D:99:BA:61:FE:A3:E3:BA:D3:B1:29:D4` |

Do **not** rotate Play app signing keys casually — Google Sign-In breaks until Cloud SHA-1s match. Register current **and** previous app-signing fingerprints while old installs remain.

Also keep debug SHA-1 for local Dev Client builds (below).

**App-Inhaberschaft bestätigen** in Cloud Console: optional / not required for Android OAuth clients.

## Build the app

After creating the Android client:

```bash
cd android && ./gradlew assembleRelease
adb install -r app/build/outputs/apk/release/app-release.apk
```

In the app: Setup / Export → **Connect Google** (system account picker — no `redirect_uri` error).

## Optional `.env`

```bash
# Override Web client (otherwise built-in desktop ID)
# GOOGLE_CLIENT_ID=….apps.googleusercontent.com

# Android client ID is usually not needed in JS (matched via package + SHA-1)
# GOOGLE_ANDROID_CLIENT_ID=….apps.googleusercontent.com
# GOOGLE_IOS_CLIENT_ID=….apps.googleusercontent.com
```

## iOS (TestFlight / App Store)

Android OAuth clients do **not** cover iPhone. For Calendar sync on iOS:

1. Google Cloud → Credentials → **OAuth client ID** → type **iOS**
2. Bundle ID: `com.fr4iser.shiftplan`
3. Put the client ID in `.env` as `GOOGLE_IOS_CLIENT_ID` (or wire via app config) if the app reads it

Device / TestFlight steps: [`ios-testflight.md`](./ios-testflight.md).
