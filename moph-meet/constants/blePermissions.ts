/**
 * BLE runtime permissions — TOR 4.10.6
 * Android requires runtime permission grants before scanning/connecting BLE:
 *   - API >= 31 (Android 12+): BLUETOOTH_SCAN + BLUETOOTH_CONNECT only.
 *                              Manifest declares BLUETOOTH_SCAN with
 *                              neverForLocation, so NO location prompt appears.
 *   - API <  31             : ACCESS_FINE_LOCATION (OS-mandated for BLE scan)
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
      // Android 12+: only BLUETOOTH_SCAN + BLUETOOTH_CONNECT are needed.
      // The manifest declares BLUETOOTH_SCAN with neverForLocation, so no
      // location permission is requested here.
      const result = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ]);
      const scan = result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN];
      const connect = result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT];
      return (
        scan === PermissionsAndroid.RESULTS.GRANTED &&
        connect === PermissionsAndroid.RESULTS.GRANTED
      );
    }

    // Android < 12: BLE scanning still requires location permission (OS mandated).
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch (e) {
    console.warn('[BLE] permission request failed', e);
    return false;
  }
}
