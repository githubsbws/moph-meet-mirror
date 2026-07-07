/**
 * BLE runtime permissions — TOR 4.10.6
 * Android requires runtime permission grants before scanning/connecting BLE:
 *   - API >= 31 (Android 12+): BLUETOOTH_SCAN + BLUETOOTH_CONNECT
 *                              (+ ACCESS_FINE_LOCATION for some OEMs / neverForLocation not set)
 *   - API <  31             : ACCESS_FINE_LOCATION
 * iOS / web: no runtime request here (iOS handled via Info.plist usage descriptions).
 */
import { Platform, PermissionsAndroid } from 'react-native';

/**
 * Request the BLE permissions required for the current Android API level.
 * Returns true when every required permission is granted (or when not Android).
 */
export async function ensureBlePermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  const apiLevel =
    typeof Platform.Version === 'number' ? Platform.Version : parseInt(String(Platform.Version), 10);

  try {
    if (apiLevel >= 31) {
      const result = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);
      const scan = result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN];
      const connect = result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT];
      // SCAN + CONNECT are mandatory; FINE_LOCATION is best-effort (OEM dependent).
      return (
        scan === PermissionsAndroid.RESULTS.GRANTED &&
        connect === PermissionsAndroid.RESULTS.GRANTED
      );
    }

    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch (e) {
    console.warn('[BLE] permission request failed', e);
    return false;
  }
}
