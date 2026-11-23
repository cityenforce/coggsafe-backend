// UserProfileScreen.js
import React, {useEffect, useState} from 'react';
import {getUserInitials} from '../utils/userInitials';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
  Alert,
  TextInput,
  ActivityIndicator,
  NativeModules,
  AppState,
} from 'react-native';
import Icon from '../components/Icon';
import {updateMyProfile} from '../api/resources';
import {getCurrentUser} from '../api/auth';
import {getUserEmergencyMessage} from '../features/sos/services/emergencyMessage';
import {savePendingProfileUpdate, clearPendingProfileUpdate} from '../features/profile/profileSync';
import {sosLocalStore} from '../features/sos/storage';
import {
  runDailySystemDiagnostic,
  stopDiagnosticSiren,
  getLastDiagnosticResult,
  DIAGNOSTIC_STATUS,
} from '../features/sos/services/systemDiagnosticsService';

const EmergencyMedia = NativeModules.EmergencyMedia || NativeModules.EmergencyMediaModule;

const UserProfileScreen = ({
  user,
  onLogout,
  onBack,
  token,
  onUserUpdated,
}) => {
  const [offlineSmsEnabled, setOfflineSmsEnabled] = useState(true);
  const [isLoadingOfflineSmsSetting, setIsLoadingOfflineSmsSetting] = useState(true);
  const [dailyAlarmEnabled, setDailyAlarmEnabled] = useState(true);
  const [isTestingSiren, setIsTestingSiren] = useState(false);
  const [lastDiagnostic, setLastDiagnostic] = useState(null);
  // Single source of truth: the same helper used to build the actual SOS
  // SMS text, so the profile screen can never show different wording than
  // what actually gets sent.
  const [emergencyMessage, setEmergencyMessage] = useState(getUserEmergencyMessage(user));

  const [isEditingTemplate, setIsEditingTemplate] = useState(false);
  const [tempTemplate, setTempTemplate] = useState(emergencyMessage);
  // Tracks the in-flight backend sync only - the local/offline save this
  // gates is already applied synchronously before this becomes true, so it
  // never blocks the user from seeing their new message.
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);

  useEffect(() => {
    let mounted = true;
    const uid = user?._id || user?.id;
    sosLocalStore.getOfflineSmsEnabled(uid).then(enabled => {
      if (mounted) setOfflineSmsEnabled(enabled);
    }).finally(() => {
      if (mounted) setIsLoadingOfflineSmsSetting(false);
    });

    sosLocalStore.getDailyAlarmEnabled(uid).then(enabled => {
      if (mounted) setDailyAlarmEnabled(enabled);
    });

    if (token) {
      getCurrentUser(token)
        .then(res => {
          if (mounted && res?.user && onUserUpdated) {
            onUserUpdated({...user, ...res.user, collection: res.collection || res.user?.collection || user?.collection});
          }
        })
        .catch(() => {});
    }

    const refreshDiagnosticView = async () => {
      let isAirplane = false;
      if (EmergencyMedia && typeof EmergencyMedia.isAirplaneModeOn === 'function') {
        try {
          isAirplane = await EmergencyMedia.isAirplaneModeOn();
        } catch (_) {}
      }

      if (isAirplane) {
        if (mounted) {
          setLastDiagnostic({
            status: DIAGNOSTIC_STATUS.ACTION_REQUIRED,
            summary: 'Action Required: Airplane Mode is ON. Please turn OFF Airplane Mode so emergency SMS and calls can dispatch.',
            testedAt: new Date().toISOString(),
          });
        }
      } else {
        const diag = await getLastDiagnosticResult();
        if (mounted && diag) {
          setLastDiagnostic(diag);
        }
      }
    };

    refreshDiagnosticView();

    const appStateSub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        refreshDiagnosticView();
      }
    });

    return () => {
      mounted = false;
      appStateSub.remove();
      stopDiagnosticSiren().catch(() => {});
    };
  }, [user?._id, user?.id]);

  const handleToggleDailyAlarm = async (val) => {
    setDailyAlarmEnabled(val);
    const uid = user?._id || user?.id;
    await sosLocalStore.setDailyAlarmEnabled(uid, val);
    if (!val && isTestingSiren) {
      setIsTestingSiren(false);
      await stopDiagnosticSiren();
    }
  };

  const handleRunSirenTest = async () => {
    if (!dailyAlarmEnabled) {
      Alert.alert(
        'System Test Disabled',
        'Daily system test alarms are currently turned off. Switch ON the setting to enable testing.'
      );
      return;
    }

    if (isTestingSiren) {
      setIsTestingSiren(false);
      await stopDiagnosticSiren();
      return;
    }

    setIsTestingSiren(true);

    try {
      const result = await runDailySystemDiagnostic({
        playSiren: true,
        sirenDurationMs: 4000,
      });

      setLastDiagnostic(result);

      setTimeout(() => {
        setIsTestingSiren(false);
      }, 4000);

      if (result.status === DIAGNOSTIC_STATUS.ACTION_REQUIRED) {
        Alert.alert('Action Required', result.summary);
      } else if (result.status === DIAGNOSTIC_STATUS.WARNING) {
        Alert.alert('System Diagnostic Warning', result.summary);
      } else {
        Alert.alert('System Test Passed', 'All system permissions, dispatch readiness, and emergency sirens are functioning properly.');
      }
    } catch (err) {
      setIsTestingSiren(false);
      Alert.alert('Test Error', err.message || 'Unable to complete system test.');
    }
  };

  useEffect(() => {
    const latestMessage = getUserEmergencyMessage(user);
    setEmergencyMessage(latestMessage);
    if (!isEditingTemplate) setTempTemplate(latestMessage);
  }, [user?.username, user?.emergencyMessage]);

  const handleSaveTemplate = async () => {
    if (isSavingTemplate) return; // guard against duplicate taps while a save is already in flight
    const messageToSave = tempTemplate.trim();
    if (!messageToSave) {
      Alert.alert('Message required', 'Please enter an emergency message.');
      return;
    }

    // 1. Apply locally immediately. The user's edit must never be lost or
    // silently reverted just because the network request that follows is
    // slow or fails.
    setEmergencyMessage(messageToSave);
    setTempTemplate(messageToSave);
    onUserUpdated?.({emergencyMessage: messageToSave});
    setIsEditingTemplate(false);
    await savePendingProfileUpdate(user?._id || user?.id, {emergencyMessage: messageToSave});

    // 2. Try to sync with the backend right away. isSavingTemplate only
    // covers this network round-trip (the message the user sees is already
    // updated above), and drives the spinner shown next to EDIT/SAVE below.
    setIsSavingTemplate(true);
    try {
      const result = await updateMyProfile(token, {emergencyMessage: messageToSave});
      const updatedUser = result?.user || result?.data || result;
      await clearPendingProfileUpdate(user?._id || user?.id);
      onUserUpdated?.(updatedUser || {emergencyMessage: messageToSave});
    } catch (error) {
      if (!error?.status || error.status === 0) {
        // Offline / server unreachable - keep the local value and the
        // pending record; it will sync automatically once the network
        // returns (see profileSync.flushPendingProfileUpdate, triggered
        // by App.js's connectivity listener). This is expected, not a
        // failure, so it must never surface as an error to the user.
      } else {
        // A genuine rejection from the server (validation, auth, etc.) -
        // surface the real reason instead of a generic error, and don't
        // keep retrying a payload the server has already rejected. The
        // locally-applied message (step 1) stays in effect either way.
        await clearPendingProfileUpdate(user?._id || user?.id);
        Alert.alert('Unable to sync message', error.message || 'Please try again.');
      }
    } finally {
      setIsSavingTemplate(false);
    }
  };

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}>

      {/* ================= BACK BUTTON ================= */}
      <View style={styles.backButtonRow}>
        <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.7}>
          <Icon name="back" size={22} color="#1A1A1A" />
        </TouchableOpacity>
      </View>

      {/* ================= PROFILE CARD ================= */}
      <View style={styles.profileCard}>
        <View style={styles.profileAccent} />

        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {getUserInitials(user?.username)}
          </Text>
        </View>

        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>{user?.username || 'User'}</Text>
          <View style={styles.profileStatusRow}>
            <Text style={styles.profileRole}>Role:</Text>
            <Text
              style={[
                styles.profileStatus,
                {
                  color: String(user?.status || '').toLowerCase() === 'active'
                    ? '#22A447'
                    : '#B42318',
                },
              ]}>
              {(user?.displayRole || (user?.isBoss ? 'Boss' : (user?.role === 'admin' ? 'Admin' : 'User')))} • {String(user?.status || '').toLowerCase() === 'active' ? 'Active' : 'Deactive'}
            </Text>
          </View>
          <Text style={styles.profileEmail} numberOfLines={2}>
            {user?.email || 'Email not configured'}  {user?.mobileNumber || 'Mobile not configured'}
          </Text>
          {(() => {
            const groupList = Array.isArray(user?.assignedGroups) && user.assignedGroups.length > 0
              ? user.assignedGroups.map(g => g.name ? `${g.name}${g.role === 'boss' ? ' (Boss)' : ''}` : null).filter(Boolean)
              : Array.isArray(user?.groupMemberships) && user.groupMemberships.length > 0
              ? user.groupMemberships.map(m => m.collectionId?.name ? `${m.collectionId.name}${m.role === 'boss' ? ' (Boss)' : ''}` : null).filter(Boolean)
              : user?.collection?.name
              ? [user.collection.name]
              : [];

            const groupsLabel = groupList.length > 0 ? groupList.join(' • ') : 'Group not assigned';

            return (
              <Text style={styles.profileEmail} numberOfLines={3}>
                {groupsLabel}
              </Text>
            );
          })()}
        </View>
      </View>

      {/* ================= SECTION TITLE ================= */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>SYSTEM PREFERENCES</Text>
      </View>

      {/* ================= OFFLINE SMS ================= */}
      <View style={styles.settingCard}>
        <View style={styles.cardAccent} />

        <View style={styles.settingTopRow}>
          <View style={styles.settingIcon}>
            <Icon name="notifications" size={20} color="#E4002B" />
          </View>
          <Switch
            value={offlineSmsEnabled}
            disabled={isLoadingOfflineSmsSetting}
            onValueChange={async value => {
              setOfflineSmsEnabled(value);
              await sosLocalStore.setOfflineSmsEnabled(user?._id || user?.id, value);
            }}
            trackColor={{false: '#D9DCE1', true: '#E4002B'}}
            thumbColor="#FFFFFF"
            style={styles.switch}
          />
        </View>

        <Text style={styles.settingTitle}>Offline SMS Dispatch</Text>
        <Text style={styles.settingDescription}>
          When enabled, SMS can dispatch even when internet is unavailable. Cellular/SIM service is still required.
        </Text>
      </View>

      {/* ================= EMERGENCY MESSAGE ================= */}
      <View style={styles.settingCard}>
        <View style={styles.cardAccent} />

        <View style={styles.settingTopRow}>
          <View style={styles.settingIcon}>
            <Icon name="notifications" size={20} color="#E4002B" />
          </View>

          <TouchableOpacity
            style={styles.editButtonContainer}
            disabled={isSavingTemplate}
            onPress={() => {
              if (isEditingTemplate) {
                handleSaveTemplate();
              } else {
                setTempTemplate(emergencyMessage);
                setIsEditingTemplate(true);
              }
            }}
            activeOpacity={0.75}>
            {isSavingTemplate ? (
              <ActivityIndicator size="small" color="#E4002B" />
            ) : (
              <Text style={styles.editButton}>
                {isEditingTemplate ? 'SAVE' : 'EDIT'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.settingTitle}>Emergency SMS Template</Text>
        <Text style={styles.settingDescription}>
          {isSavingTemplate ? 'Saving your message…' : 'Dynamic payload fields append automatically during transmission.'}
        </Text>

        {isEditingTemplate ? (
          <View style={styles.editContainer}>
            <TextInput
              style={styles.templateInput}
              value={tempTemplate}
              onChangeText={setTempTemplate}
              multiline
              numberOfLines={4}
              placeholder="Enter your emergency message..."
              placeholderTextColor="#9CA3AF"
            />

            <View style={styles.editActions}>
              <TouchableOpacity
                style={styles.cancelButtonContainer}
                onPress={() => setIsEditingTemplate(false)}
                activeOpacity={0.7}>
                <Text style={styles.cancelButton}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSaveTemplate}
                disabled={isSavingTemplate}
                activeOpacity={0.8}>
                {isSavingTemplate ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveButtonText}>Save Changes</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.templatePreview}
            onPress={() => {
              setTempTemplate(emergencyMessage);
              setIsEditingTemplate(true);
            }}
            activeOpacity={0.75}>
            <Text style={styles.templatePreviewText}>
              "{emergencyMessage}"
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ================= DAILY SYSTEM TEST ================= */}
      <View style={styles.settingCard}>
        <View style={styles.cardAccent} />

        <View style={styles.settingTopRow}>
          <View style={styles.settingIcon}>
            <Icon name="notifications" size={20} color="#E4002B" />
          </View>

          <Switch
            value={dailyAlarmEnabled}
            onValueChange={handleToggleDailyAlarm}
            trackColor={{false: '#D9DCE1', true: '#E4002B'}}
            thumbColor="#FFFFFF"
            style={styles.switch}
          />
        </View>

        <Text style={styles.settingTitle}>System Test Alarms</Text>
        <Text style={styles.settingDescription}>
          Test sirens and system dispatch capabilities.
        </Text>

        <View style={styles.systemTestStatusRow}>
          <View
            style={[
              styles.testStatusDot,
              dailyAlarmEnabled ? styles.testStatusDotActive : styles.testStatusDotInactive,
            ]}
          />
          <Text
            style={[
              styles.testStatusText,
              dailyAlarmEnabled ? styles.testStatusTextActive : styles.testStatusTextInactive,
            ]}>
            {dailyAlarmEnabled ? 'System Test Alarms Enabled' : 'System Test Alarms Disabled'}
          </Text>
        </View>

        {dailyAlarmEnabled && (
          <>
            {lastDiagnostic && (
              <View
                style={[
                  styles.diagnosticBox,
                  lastDiagnostic.status === DIAGNOSTIC_STATUS.PASSED
                    ? styles.diagnosticBoxPassed
                    : lastDiagnostic.status === DIAGNOSTIC_STATUS.WARNING
                    ? styles.diagnosticBoxWarning
                    : styles.diagnosticBoxAction,
                ]}>
                <View style={styles.diagnosticHeaderRow}>
                  <Text
                    style={[
                      styles.diagnosticStatusText,
                      lastDiagnostic.status === DIAGNOSTIC_STATUS.PASSED
                        ? styles.diagnosticStatusPassed
                        : lastDiagnostic.status === DIAGNOSTIC_STATUS.WARNING
                        ? styles.diagnosticStatusWarning
                        : styles.diagnosticStatusAction,
                    ]}>
                    {lastDiagnostic.status === DIAGNOSTIC_STATUS.PASSED
                      ? '✓ PASSED'
                      : lastDiagnostic.status === DIAGNOSTIC_STATUS.WARNING
                      ? '⚠ WARNING'
                      : '❗ ACTION REQUIRED'}
                  </Text>
                  <Text style={styles.diagnosticTimeText}>
                    {lastDiagnostic.testedAt ? new Date(lastDiagnostic.testedAt).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}) : ''}
                  </Text>
                </View>
                <Text style={styles.diagnosticSummaryText} numberOfLines={3}>
                  {lastDiagnostic.summary}
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.testSirenButton, isTestingSiren && styles.testSirenButtonStop]}
              onPress={handleRunSirenTest}
              activeOpacity={0.8}>
              <Text style={styles.testSirenButtonIcon}>{isTestingSiren ? '⏹' : '🔔'}</Text>
              <Text style={styles.testSirenButtonText}>
                {isTestingSiren ? 'Stop Siren Test' : 'Test Siren & Alarms Now'}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>

    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 30,
  },

  /* ================= BACK BUTTON ================= */
  backButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },

  backButton: {
    padding: 4,
    alignSelf: 'flex-start',
  },

  /* ================= PROFILE ================= */
  profileCard: {
    minHeight: 125,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E3E6EA',
    borderRadius: 24,
    padding: 20,
    paddingLeft: 24,
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
    marginBottom: 28,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 5},
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },

  profileAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 6,
    backgroundColor: '#E4002B',
  },

  avatar: {
    width: 74,
    height: 74,
    borderRadius: 22,
    backgroundColor: '#E4002B',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    shadowColor: '#E4002B',
    shadowOffset: {width: 0, height: 5},
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },

  avatarText: {
    color: '#FFFFFF',
    fontSize: 29,
    fontWeight: '900',
  },

  profileInfo: {
    flex: 1,
    minWidth: 0,
  },

  profileName: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
    lineHeight: 29,
  },

  profileStatusRow: {flexDirection: 'row', alignItems: 'center', marginTop: 5},
  profileStatus: {fontSize: 14, fontWeight: '900', marginLeft: 4},
  profileRole: {
  fontSize: 14,
  fontWeight: '900',
  color: '#E4002B',
},

  profileEmail: {
    fontSize: 12,
    fontWeight: '700',
    color: '#7B818C',
    marginTop: 7,
    lineHeight: 18,
  },

  /* ================= SECTION ================= */
  sectionHeader: {
    marginBottom: 14,
  },

  sectionTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#7B818C',
    letterSpacing: 1.6,
  },

  /* ================= SETTING CARD ================= */
  settingCard: {
    minHeight: 165,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E3E6EA',
    borderRadius: 24,
    padding: 20,
    paddingLeft: 24,
    marginBottom: 14,
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.045,
    shadowRadius: 10,
    elevation: 2,
  },

  cardAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 5,
    backgroundColor: '#E5E7EB',
  },

  settingTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 17,
  },

  settingIcon: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: '#F5F6F8',
    alignItems: 'center',
    justifyContent: 'center',
  },

  settingIconText: {
    fontSize: 26,
  },

  settingTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
    lineHeight: 24,
  },

  settingDescription: {
    fontSize: 13,
    fontWeight: '700',
    color: '#747B86',
    marginTop: 7,
    lineHeight: 20,
  },

  switch: {
    transform: [{scaleX: 1.05}, {scaleY: 1.05}],
  },

  editButtonContainer: {
    minWidth: 62,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#FFF0F2',
    borderWidth: 1,
    borderColor: '#FFD9DE',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },

  editButton: {
    fontSize: 10,
    fontWeight: '900',
    color: '#E4002B',
    letterSpacing: 1,
  },

  templatePreview: {
    marginTop: 16,
    backgroundColor: '#F7F8FA',
    borderWidth: 1.5,
    borderColor: '#E2E5E9',
    borderRadius: 16,
    padding: 16,
    minHeight: 72,
  },

  templatePreviewText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#5F6672',
    lineHeight: 21,
  },

  editContainer: {
    marginTop: 16,
  },

  templateInput: {
    backgroundColor: '#F7F8FA',
    borderWidth: 1.5,
    borderColor: '#E2E5E9',
    borderRadius: 16,
    paddingHorizontal: 15,
    paddingVertical: 14,
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    minHeight: 110,
    textAlignVertical: 'top',
  },

  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 12,
  },

  cancelButtonContainer: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginRight: 8,
  },

  cancelButton: {
    fontSize: 13,
    fontWeight: '800',
    color: '#747B86',
  },

  saveButton: {
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: '#E4002B',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },

  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },

  /* System Test Alarms */
  systemTestStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  testStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  testStatusDotActive: {
    backgroundColor: '#10B981',
  },
  testStatusDotInactive: {
    backgroundColor: '#9CA3AF',
  },
  testStatusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  testStatusTextActive: {
    color: '#059669',
  },
  testStatusTextInactive: {
    color: '#6B7280',
  },
  testSirenButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF0F2',
    borderWidth: 1.5,
    borderColor: '#FFCCD2',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginTop: 12,
  },
  testSirenButtonStop: {
    backgroundColor: '#E4002B',
    borderColor: '#B91C1C',
  },
  testSirenButtonIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  testSirenButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#E4002B',
  },
  diagnosticBox: {
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
  },
  diagnosticBoxPassed: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  diagnosticBoxWarning: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  diagnosticBoxAction: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  diagnosticHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  diagnosticStatusText: {
    fontSize: 12,
    fontWeight: '800',
  },
  diagnosticStatusPassed: {
    color: '#059669',
  },
  diagnosticStatusWarning: {
    color: '#D97706',
  },
  diagnosticStatusAction: {
    color: '#DC2626',
  },
  diagnosticTimeText: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '600',
  },
  diagnosticSummaryText: {
    fontSize: 12,
    color: '#374151',
    lineHeight: 16,
  },
});

export default UserProfileScreen;