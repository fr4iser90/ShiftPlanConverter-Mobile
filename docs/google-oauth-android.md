# Google OAuth — Android (Option A)

The mobile app uses **Google Sign-In (Play Services)** on Android.
Custom-scheme redirects (`loga3mobile://`) on a **Web** OAuth client are **not** accepted by Google Cloud Console.

## What to create in Google Cloud

Use the **same project** as the desktop web client (`443643010945-…`):

### 1. Calendar API

APIs & Services → Library → **Google Calendar API** → Enable.

### 2. Android OAuth client (new)

APIs & Services → Credentials → **Create OAuth client ID** → type **Android**

| Field | Value |
|-------|--------|
| Package name | `com.fr4iser.loga3mobile` |
| SHA-1 | see below |

**No** authorized redirect URIs, **no** JavaScript origins.

### 3. Keep the existing Web client

The built-in web client stays as `webClientId` (token minting).  
Do **not** add `loga3mobile://` there.

### 4. OAuth consent screen

In testing mode: add your Google account as a **test user**.  
Scopes: Calendar + Calendar Events (requested by the app).

## SHA-1 for this repo keystore (debug = current release signing)

```bash
nix-shell --run './scripts/google-sha1.sh'
```

Current local `android/app/debug.keystore` (also used by `assembleRelease`):

```
SHA1: 5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25
```

If you later use a **dedicated release key** or **Play App Signing**, add that SHA-1 to the same Android client (or create another).

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
