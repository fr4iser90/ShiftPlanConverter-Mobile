/**
 * Capture helpers for camera-OCR: document scan (deskew), camera, gallery.
 *
 * Android: launch the picker in the same turn as the button press — any
 * `await`/`setTimeout` before launch often means the gallery never opens.
 *
 * IMPORTANT: never `require('expo-image-picker')`. That package evaluates
 * `requireNativeModule('ExponentImagePicker')` at load time; a single failure
 * poisons Metro's module cache for the whole Metro session (survives app
 * restarts). Call the native module via `requireOptionalNativeModule` instead.
 */
import { t } from '../../i18n';

export type OcrCaptureMode = 'scan' | 'camera' | 'gallery';

type PickerAsset = { uri?: string };
type PickerResult = {
  canceled?: boolean;
  assets?: PickerAsset[] | null;
};

type NativeImagePicker = {
  getCameraPermissionsAsync: () => Promise<{ granted?: boolean }>;
  requestCameraPermissionsAsync: () => Promise<{ granted?: boolean }>;
  getMediaLibraryPermissionsAsync: (writeOnly?: boolean) => Promise<{ granted?: boolean }>;
  requestMediaLibraryPermissionsAsync: (writeOnly?: boolean) => Promise<{ granted?: boolean }>;
  launchCameraAsync: (opts: Record<string, unknown>) => Promise<PickerResult>;
  launchImageLibraryAsync: (opts: Record<string, unknown>) => Promise<PickerResult>;
  getPendingResultAsync?: () => Promise<PickerResult | null | undefined>;
};

/** Module-level: survives Fetch remount after Android kills MainActivity for the picker. */
let ocrPickerLaunchPending = false;

export function noteOcrPickerLaunch(): void {
  ocrPickerLaunchPending = true;
}

export function consumeOcrPickerLaunchPending(): boolean {
  if (!ocrPickerLaunchPending) return false;
  ocrPickerLaunchPending = false;
  return true;
}

/** Ensure file:// for local paths returned by some native scanners. */
export function normalizeLocalImageUri(uri: string): string {
  const u = String(uri || '').trim();
  if (!u) return u;
  if (u.startsWith('file://') || u.startsWith('content://') || u.startsWith('data:')) return u;
  if (u.startsWith('/')) return `file://${u}`;
  return u;
}

function androidApiLevel(): number {
  try {
    // Lazy require — Jest cannot parse RN's flow entry at import time.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Platform } = require('react-native') as {
      Platform: { OS: string; Version: number | string };
    };
    if (Platform.OS !== 'android') return 0;
    return typeof Platform.Version === 'number'
      ? Platform.Version
      : parseInt(String(Platform.Version), 10) || 0;
  } catch {
    return 0;
  }
}

export function isDocumentScannerAvailable(): boolean {
  try {
    // Lazy require — keeps unit tests free of loading RN's flow entry.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { TurboModuleRegistry } = require('react-native') as {
      TurboModuleRegistry: { get: (name: string) => unknown };
    };
    return !!TurboModuleRegistry.get('DocumentScanner');
  } catch {
    return false;
  }
}

function getNativeImagePicker(): NativeImagePicker | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { requireOptionalNativeModule } = require('expo-modules-core') as {
      requireOptionalNativeModule: (name: string) => NativeImagePicker | null;
    };
    // Prefer registry (never evaluates expo-image-picker JS — avoids Metro poison).
    const fromOptional = requireOptionalNativeModule('ExponentImagePicker');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fromGlobal = (globalThis as any)?.expo?.modules?.ExponentImagePicker as
      | NativeImagePicker
      | undefined;
    const mod = fromOptional || fromGlobal || null;
    if (!mod) return null;
    // Some proxies expose methods only as own/callable later — don't require both up front.
    if (
      typeof mod.launchImageLibraryAsync !== 'function' &&
      typeof mod.launchCameraAsync !== 'function'
    ) {
      return null;
    }
    return mod;
  } catch {
    return null;
  }
}

/**
 * JS wrapper is safe to load only when native is already registered.
 * If Metro previously poisoned `expo-image-picker`, fall back to the native object.
 */
function requireNativeImagePicker(): NativeImagePicker {
  const native = getNativeImagePicker();
  if (!native) throw new Error(t('sourceOcrPickerMissing'));
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const wrapped = require('expo-image-picker') as NativeImagePicker;
    if (typeof wrapped.launchImageLibraryAsync === 'function') return wrapped;
  } catch {
    // poisoned or incomplete JS — use native module directly
  }
  return native;
}

async function captureViaDocumentScanner(): Promise<string | null> {
  if (!isDocumentScannerAvailable()) {
    throw new Error(t('sourceOcrScannerMissing'));
  }
  // Lazy require so Jest / Expo Go without the native module can still load the Source.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const DocumentScanner = require('react-native-document-scanner-plugin').default as {
    scanDocument: (opts?: {
      maxNumDocuments?: number;
      croppedImageQuality?: number;
    }) => Promise<{ scannedImages?: string[]; status?: string }>;
  };
  const result = await DocumentScanner.scanDocument({
    maxNumDocuments: 1,
    croppedImageQuality: 100,
  });
  if (result.status === 'cancel') return null;
  const first = result.scannedImages?.[0];
  if (!first) return null;
  return normalizeLocalImageUri(first);
}

async function ensureCameraPermission(picker: NativeImagePicker): Promise<void> {
  const cur = await picker.getCameraPermissionsAsync();
  if (cur.granted) return;
  const perm = await picker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error(t('sourceOcrCameraDenied'));
}

/**
 * Android 13+ system photo picker needs no READ_MEDIA permission.
 * Do not await permission before launch on API 33+ — that breaks the user-gesture chain.
 */
async function ensureGalleryPermissionIfNeeded(picker: NativeImagePicker): Promise<void> {
  if (androidApiLevel() >= 33) return;
  const cur = await picker.getMediaLibraryPermissionsAsync(false);
  if (cur.granted) return;
  const perm = await picker.requestMediaLibraryPermissionsAsync(false);
  if (!perm.granted) throw new Error(t('sourceOcrGalleryDenied'));
}

const PICK_IMAGE_OPTS = {
  mediaTypes: ['images'],
  allowsEditing: false,
  exif: false,
  // Critical: do NOT set `quality`. A value < 1 forces a second encode of huge JPEGs.
} as const;

async function captureViaCamera(): Promise<string | null> {
  const picker = requireNativeImagePicker();
  await ensureCameraPermission(picker);
  const shot = await picker.launchCameraAsync({ ...PICK_IMAGE_OPTS });
  if (shot.canceled || !shot.assets?.[0]?.uri) return null;
  return normalizeLocalImageUri(shot.assets[0].uri);
}

async function captureViaGallery(): Promise<string | null> {
  const picker = requireNativeImagePicker();
  await ensureGalleryPermissionIfNeeded(picker);
  const picked = await picker.launchImageLibraryAsync({ ...PICK_IMAGE_OPTS });
  if (picked.canceled || !picked.assets?.[0]?.uri) return null;
  return normalizeLocalImageUri(picked.assets[0].uri);
}

/**
 * Android may destroy MainActivity after the picker — recover the chosen URI.
 * Call when AppState becomes active after a gallery/camera launch.
 */
export async function takePendingOcrImageUri(): Promise<string | null> {
  try {
    const picker = getNativeImagePicker();
    if (!picker?.getPendingResultAsync) return null;
    const pending = await picker.getPendingResultAsync();
    if (!pending || !('canceled' in pending)) return null;
    if (pending.canceled || !pending.assets?.[0]?.uri) return null;
    return normalizeLocalImageUri(pending.assets[0].uri);
  } catch {
    return null;
  }
}

/** One capture path — no silent fallback between scan/camera/gallery. */
export async function captureOcrImage(mode: OcrCaptureMode): Promise<string | null> {
  if (mode === 'scan') return captureViaDocumentScanner();
  if (mode === 'camera') return captureViaCamera();
  return captureViaGallery();
}
