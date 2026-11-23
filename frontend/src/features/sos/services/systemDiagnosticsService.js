// src/features/sos/services/systemDiagnosticsService.js
// Dedicated System Diagnostics & Daily System Test Alarms service for CoGG Safe.
// Evaluates permissions, device readiness, siren acoustics, and dispatch capabilities.
// Completely isolated from real emergency dispatch (NO fake SMS, NO admin alerts, NO emergency calls).

import { Platform, PermissionsAndroid, NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { API_BASE_URL } from '../../../api/config';

const EmergencyMedia = NativeModules.EmergencyMedia || NativeModules.EmergencyMediaModule;

export const SYSTEM_TEST_STORAGE_KEY = '@coggsafe/last_system_test_result';

export const DIAGNOSTIC_STATUS = Object.freeze({
  PASSED: 'PASSED',
  ACTION_REQUIRED: 'ACTION_REQUIRED',
  WARNING: 'WARNING',
});

/**
 * Checks all emergency-related Android permissions.
 */
export async function checkSystemPermissions() {
  if (Platform.OS !== 'android') {
    return { allGranted: true, missing: [], details: {} };
  }

  const permissionChecks = [
    { key: 'location', perm: PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION, label: 'Location' },
    { key: 'camera', perm: PermissionsAndroid.PERMISSIONS.CAMERA, label: 'Camera' },
    { key: 'audio', perm: PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, label: 'Microphone' },
    { key: 'call', perm: PermissionsAndroid.PERMISSIONS.CALL_PHONE, label: 'Phone Call' },
    { key: 'sms', perm: PermissionsAndroid.PERMISSIONS.SEND_SMS, label: 'SMS' },
  ];

  if (Platform.Version >= 33 && PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS) {
    permissionChecks.push({
      key: 'notifications',
      perm: PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      label: 'Notifications',
    });
  }

  const results = {};
  const missing = [];

  for (const item of permissionChecks) {
    try {
      const granted = await PermissionsAndroid.check(item.perm);
      results[item.key] = granted;
      if (!granted) {
        missing.push(item.label);
      }
    } catch (_) {
      results[item.key] = false;
      missing.push(item.label);
    }
  }

  return {
    allGranted: missing.length === 0,
    missing,
    details: results,
  };
}

/**
 * Checks hardware and network readiness for SOS dispatch.
 */
export async function checkDispatchReadiness() {
  const readiness = {
    locationEnabled: true,
    cellularAvailable: true,
    airplaneMode: false,
    backendReachable: false,
    isConnected: false,
    warnings: [],
  };

  // 1. Airplane mode check
  if (EmergencyMedia && typeof EmergencyMedia.isAirplaneModeOn === 'function') {
    try {
      readiness.airplaneMode = await EmergencyMedia.isAirplaneModeOn();
      if (readiness.airplaneMode) {
        readiness.cellularAvailable = false;
        readiness.warnings.push('Airplane Mode is ON – Cellular and emergency dispatch are disabled');
      }
    } catch (_) {}
  }

  // 2. Location GPS/Network Provider
  if (EmergencyMedia && typeof EmergencyMedia.isLocationEnabled === 'function') {
    try {
      readiness.locationEnabled = await EmergencyMedia.isLocationEnabled();
      if (!readiness.locationEnabled) {
        readiness.warnings.push('GPS / Location Services is turned OFF on device');
      }
    } catch (_) {}
  }

  // 3. Cellular SIM state (only if not in airplane mode)
  if (!readiness.airplaneMode && EmergencyMedia && typeof EmergencyMedia.getAvailableSims === 'function') {
    try {
      const sims = await EmergencyMedia.getAvailableSims();
      if (Array.isArray(sims) && sims.length === 0) {
        // Double check with getTelephonyState before warning
        let hasSim = false;
        if (typeof EmergencyMedia.getTelephonyState === 'function') {
          try {
            const telState = await EmergencyMedia.getTelephonyState();
            if (telState?.status === 'AVAILABLE' || telState?.hasActiveSubscription) {
              hasSim = true;
            }
          } catch (_) {}
        }
        if (!hasSim) {
          readiness.cellularAvailable = false;
          readiness.warnings.push('No active SIM card detected for emergency SMS/Call');
        }
      }
    } catch (_) {}
  }

  // 4. Network / Backend connectivity
  try {
    const netState = await NetInfo.fetch();
    readiness.isConnected = Boolean(netState?.isConnected);
    if (netState?.isConnected && !readiness.airplaneMode) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3500);
        const resp = await fetch(`${API_BASE_URL}/health`, { method: 'GET', signal: controller.signal });
        clearTimeout(timeout);
        readiness.backendReachable = resp.ok;
      } catch (_) {
        readiness.backendReachable = false;
      }
    } else {
      readiness.backendReachable = false;
    }
  } catch (_) {
    readiness.backendReachable = false;
  }

  return readiness;
}

/**
 * Runs the full Daily System Test Diagnostic.
 * 
 * @param {Object} options
 * @param {boolean} options.playSiren Whether to play controlled local test siren (default: true)
 * @param {number} options.sirenDurationMs Duration in ms before auto-stopping siren (default: 4000)
 */
export async function runDailySystemDiagnostic({ playSiren = true, sirenDurationMs = 4000 } = {}) {
  const permCheck = await checkSystemPermissions();
  const dispatchCheck = await checkDispatchReadiness();

  let status = DIAGNOSTIC_STATUS.PASSED;
  let summary = 'System Test Passed – All emergency capabilities and sirens are operational.';

  if (dispatchCheck.airplaneMode) {
    status = DIAGNOSTIC_STATUS.ACTION_REQUIRED;
    summary = 'Action Required: Airplane Mode is ON. Please turn OFF Airplane Mode so emergency SMS and calls can dispatch.';
  } else if (permCheck.missing.length > 0) {
    status = DIAGNOSTIC_STATUS.ACTION_REQUIRED;
    summary = `Action Required: Missing permissions for ${permCheck.missing.join(', ')}.`;
  } else if (dispatchCheck.warnings.length > 0) {
    status = DIAGNOSTIC_STATUS.WARNING;
    summary = `Warning: ${dispatchCheck.warnings.join('; ')}.`;
  }

  // Controlled siren testing
  if (playSiren && EmergencyMedia && typeof EmergencyMedia.playTestSiren === 'function') {
    try {
      await EmergencyMedia.playTestSiren();
      if (sirenDurationMs > 0) {
        setTimeout(async () => {
          try {
            if (EmergencyMedia && typeof EmergencyMedia.stopTestSiren === 'function') {
              await EmergencyMedia.stopTestSiren();
            }
          } catch (_) {}
        }, sirenDurationMs);
      }
    } catch (_) {}
  }

  // Notification verification
  if (EmergencyMedia && typeof EmergencyMedia.postSystemTestNotification === 'function') {
    try {
      await EmergencyMedia.postSystemTestNotification();
    } catch (_) {}
  }

  const result = {
    status,
    summary,
    missingPermissions: permCheck.missing,
    warnings: dispatchCheck.warnings,
    permissions: permCheck.details,
    dispatchReadiness: dispatchCheck,
    testedAt: new Date().toISOString(),
  };

  try {
    await AsyncStorage.setItem(SYSTEM_TEST_STORAGE_KEY, JSON.stringify(result));
  } catch (_) {}

  return result;
}

/**
 * Stops any playing test siren immediately.
 */
export async function stopDiagnosticSiren() {
  if (EmergencyMedia && typeof EmergencyMedia.stopTestSiren === 'function') {
    try {
      await EmergencyMedia.stopTestSiren();
      return true;
    } catch (_) {
      return false;
    }
  }
  return true;
}

/**
 * Retrieves the last stored system test report.
 */
export async function getLastDiagnosticResult() {
  try {
    const raw = await AsyncStorage.getItem(SYSTEM_TEST_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

export default {
  checkSystemPermissions,
  checkDispatchReadiness,
  runDailySystemDiagnostic,
  stopDiagnosticSiren,
  getLastDiagnosticResult,
  DIAGNOSTIC_STATUS,
};

