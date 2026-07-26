/**
 * Optional biometric / device-credential gate (Fetch + password reveal).
 * Off by default — opt-in in Settings → Security.
 *
 * Native module is loaded lazily so a Dev Client without the package still boots.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREF_KEY = 'loga3.biometricLock';

let sessionUnlocked = false;

type LocalAuthMod = typeof import('expo-local-authentication');

function tryLoadLocalAuth(): LocalAuthMod | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-local-authentication') as LocalAuthMod;
  } catch {
    return null;
  }
}

export async function isBiometricLockEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(PREF_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function setBiometricLockEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(PREF_KEY, enabled ? '1' : '0');
  if (!enabled) sessionUnlocked = false;
}

export function clearBiometricSession(): void {
  sessionUnlocked = false;
}

export async function canUseDeviceAuth(): Promise<boolean> {
  const LocalAuthentication = tryLoadLocalAuth();
  if (!LocalAuthentication) return false;
  try {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    if (!compatible) return false;
    return LocalAuthentication.isEnrolledAsync();
  } catch {
    return false;
  }
}

/**
 * If lock enabled and session not unlocked, prompt once.
 * Returns true when the caller may proceed.
 */
export async function ensureBiometricUnlocked(promptMessage: string): Promise<boolean> {
  if (!(await isBiometricLockEnabled())) return true;
  if (sessionUnlocked) return true;
  const LocalAuthentication = tryLoadLocalAuth();
  if (!LocalAuthentication) {
    // Native module missing (old Dev Client) — do not brick the app.
    return true;
  }
  const enrolled = await canUseDeviceAuth();
  if (!enrolled) {
    // Pref on but no biometrics/PIN enrolled — do not brick the app.
    return true;
  }
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });
    if (result.success) {
      sessionUnlocked = true;
      return true;
    }
    return false;
  } catch {
    return true;
  }
}
