import React, {useState, useEffect} from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import {listCollections, createOrAssignBoss} from '../api/resources';
import Icon from './Icon';

export default function AddBossModal({
  visible,
  onClose,
  token,
  onSuccess,
  existingUsers = [],
}) {
  const [username, setUsername] = useState('');
  const [mobileNumber, setMobileNumber] = useState('+');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [selectedGroups, setSelectedGroups] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [detectedExistingUser, setDetectedExistingUser] = useState(null);

  useEffect(() => {
    if (visible) {
      setError('');
      setUsername('');
      setMobileNumber('+');
      setPassword('');
      setEmail('');
      setSelectedGroups([]);
      setDetectedExistingUser(null);
      fetchGroups();
    }
  }, [visible]);

  const fetchGroups = async () => {
    setLoadingGroups(true);
    try {
      const response = await listCollections(token, {limit: 100}, {forceRefresh: true});
      const items = response?.collections || response?.data?.collections || [];
      setGroups(items);
    } catch (err) {
      setError('Unable to load available groups.');
    } finally {
      setLoadingGroups(false);
    }
  };

  const handleMobileChange = text => {
    const formatted = text.startsWith('+') ? text : `+${text}`;
    setMobileNumber(formatted);

    // Check if this mobile number belongs to an existing user
    const trimmed = formatted.trim();
    if (trimmed.length > 5) {
      const match = existingUsers.find(
        u => (u.mobileNumber || u.phone) === trimmed
      );
      if (match) {
        setDetectedExistingUser(match);
        if (!username || username === '') {
          setUsername(match.username || match.name || '');
        }
        if (match.email && match.email !== 'No email configured') {
          setEmail(match.email);
        }
      } else {
        setDetectedExistingUser(null);
      }
    } else {
      setDetectedExistingUser(null);
    }
  };

  const toggleGroup = groupId => {
    setSelectedGroups(prev =>
      prev.includes(groupId)
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    );
  };

  const selectAllGroups = () => {
    if (selectedGroups.length === groups.length) {
      setSelectedGroups([]);
    } else {
      setSelectedGroups(groups.map(g => g._id || g.id));
    }
  };

  const handleSubmit = async () => {
    setError('');

    if (!username.trim()) {
      setError('Username is required.');
      return;
    }

    if (!mobileNumber.trim() || !/^\+[0-9]{7,15}$/.test(mobileNumber.trim())) {
      setError('Mobile number must include country code, e.g. +923001234567 or +61400123456.');
      return;
    }

    if (!detectedExistingUser && (!password || password.length < 8)) {
      setError('Password is required for new accounts (at least 8 characters).');
      return;
    }

    if (password && password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (selectedGroups.length === 0) {
      setError('Please assign at least one group to this Boss.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        username: username.trim(),
        mobileNumber: mobileNumber.trim(),
        collectionIds: selectedGroups,
        groupRole: 'boss',
      };
      if (email.trim()) payload.email = email.trim();
      if (password.trim()) payload.password = password.trim();

      const response = await createOrAssignBoss(token, payload);
      const isExisting = response?.isExistingUser || response?.data?.isExistingUser;
      const user = response?.user || response?.data?.user;

      Alert.alert(
        'Success',
        isExisting
          ? `${user?.username || username} has been assigned Boss permissions for the selected groups.`
          : `Boss account "${user?.username || username}" created successfully.`
      );

      onSuccess?.(user);
      onClose();
    } catch (err) {
      setError(err.message || 'Unable to create or assign Boss. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleWrap}>
              <View style={styles.bossBadge}>
                <Text style={styles.bossBadgeText}>ROLE: BOSS</Text>
              </View>
              <Text style={styles.title}>Add Boss Account</Text>
              <Text style={styles.subtitle}>
                Assign group-scoped Boss permissions. Boss accounts do not receive Admin Panel access.
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeIcon}>×</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}>
            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>⚠ {error}</Text>
              </View>
            ) : null}

            {detectedExistingUser ? (
              <View style={styles.noticeBox}>
                <Text style={styles.noticeTitle}>ℹ Existing Account Detected</Text>
                <Text style={styles.noticeText}>
                  User "{detectedExistingUser.username || detectedExistingUser.name}" will be assigned the Boss role for selected groups. Existing memberships will remain preserved.
                </Text>
              </View>
            ) : null}

            {/* Mobile Number */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>
                MOBILE NUMBER <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                value={mobileNumber}
                onChangeText={handleMobileChange}
                placeholder="+923001234567"
                placeholderTextColor="#9CA3AF"
                keyboardType="phone-pad"
                autoCapitalize="none"
              />
              <Text style={styles.helperText}>
                Includes country code. If mobile already exists, user is assigned to groups without duplicate account.
              </Text>
            </View>

            {/* Username */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>
                USERNAME <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                value={username}
                onChangeText={setUsername}
                placeholder="e.g. Ahmed Ali"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="words"
              />
            </View>

            {/* Password */}
            <View style={styles.formGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>
                  PASSWORD {detectedExistingUser ? '(OPTIONAL FOR EXISTING)' : <Text style={styles.required}>*</Text>}
                </Text>
                <TouchableOpacity onPress={() => setShowPassword(prev => !prev)}>
                  <Text style={styles.togglePasswordText}>
                    {showPassword ? 'Hide' : 'Show'}
                  </Text>
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder={detectedExistingUser ? 'Leave blank to keep existing password' : 'Min 8 characters'}
                placeholderTextColor="#9CA3AF"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
            </View>

            {/* Email */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>EMAIL ADDRESS (OPTIONAL)</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="boss@coggsafe.com"
                placeholderTextColor="#9CA3AF"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            {/* Group Assignment Multi-Select */}
            <View style={styles.formGroup}>
              <View style={styles.groupsHeaderRow}>
                <Text style={styles.label}>
                  ASSIGN GROUPS (MULTI-SELECT) <Text style={styles.required}>*</Text>
                </Text>
                {groups.length > 0 && (
                  <TouchableOpacity onPress={selectAllGroups}>
                    <Text style={styles.selectAllText}>
                      {selectedGroups.length === groups.length ? 'Deselect All' : 'Select All'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              <Text style={styles.helperText}>
                Select one or more groups where this user will hold the Boss role.
              </Text>

              {loadingGroups ? (
                <View style={styles.groupsLoading}>
                  <ActivityIndicator size="small" color="#E4002B" />
                  <Text style={styles.loadingText}>Loading groups...</Text>
                </View>
              ) : groups.length === 0 ? (
                <View style={styles.noGroupsBox}>
                  <Text style={styles.noGroupsText}>No groups available. Please create a group first.</Text>
                </View>
              ) : (
                <View style={styles.groupsList}>
                  {groups.map(group => {
                    const groupId = group._id || group.id;
                    const isChecked = selectedGroups.includes(groupId);

                    return (
                      <TouchableOpacity
                        key={groupId}
                        style={[
                          styles.groupCard,
                          isChecked && styles.groupCardSelected,
                        ]}
                        activeOpacity={0.7}
                        onPress={() => toggleGroup(groupId)}>
                        <View
                          style={[
                            styles.checkbox,
                            isChecked && styles.checkboxSelected,
                          ]}>
                          {isChecked && <Text style={styles.checkmark}>✓</Text>}
                        </View>
                        <View style={styles.groupInfo}>
                          <Text style={[styles.groupName, isChecked && styles.groupNameSelected]}>
                            {group.name}
                          </Text>
                          <Text style={styles.groupMeta}>
                            Type: {group.type || 'other'} · Call: {group.emergencyCallNumber || 'None'}
                          </Text>
                        </View>
                        <View style={[styles.roleBadge, isChecked && styles.roleBadgeSelected]}>
                          <Text style={[styles.roleBadgeText, isChecked && styles.roleBadgeTextSelected]}>
                            Boss
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>

            {/* Scope Notice */}
            <View style={styles.securityBox}>
              <Text style={styles.securityTitle}>🔒 Security & Scope Policy</Text>
              <Text style={styles.securityText}>
                • Boss role is strictly scoped to selected groups.
                {'\n'}• Boss will NOT receive global administrative rights or access to the Admin Control Center.
                {'\n'}• Only System Admins can create and assign Boss roles.
              </Text>
            </View>

            {/* Action Buttons */}
            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={[styles.btn, styles.btnCancel]}
                onPress={onClose}
                disabled={submitting}
                activeOpacity={0.7}>
                <Text style={styles.btnCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btn, styles.btnSubmit, submitting && styles.btnDisabled]}
                onPress={handleSubmit}
                disabled={submitting}
                activeOpacity={0.8}>
                {submitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.btnSubmitText}>
                    {detectedExistingUser ? 'Assign Boss Role' : 'Create Boss'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F2',
  },
  headerTitleWrap: {
    flex: 1,
    paddingRight: 10,
  },
  bossBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  bossBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#92400E',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: '#1A1A1A',
  },
  subtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
    lineHeight: 16,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIcon: {
    fontSize: 22,
    lineHeight: 24,
    color: '#4B5563',
    fontWeight: '300',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  errorBox: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 13,
    fontWeight: '600',
  },
  noticeBox: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  noticeTitle: {
    color: '#1D4ED8',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 2,
  },
  noticeText: {
    color: '#1E40AF',
    fontSize: 12,
    lineHeight: 16,
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 11,
    fontWeight: '900',
    color: '#4B5563',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  required: {
    color: '#E4002B',
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  togglePasswordText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#E4002B',
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#1A1A1A',
  },
  helperText: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 4,
    lineHeight: 15,
  },
  groupsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectAllText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#E4002B',
  },
  groupsLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
  },
  loadingText: {
    marginLeft: 8,
    fontSize: 12,
    color: '#6B7280',
  },
  noGroupsBox: {
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginTop: 8,
  },
  noGroupsText: {
    fontSize: 12,
    color: '#6B7280',
  },
  groupsList: {
    marginTop: 8,
    gap: 8,
  },
  groupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  groupCardSelected: {
    backgroundColor: '#FEF2F2',
    borderColor: '#F87171',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    backgroundColor: '#FFFFFF',
  },
  checkboxSelected: {
    backgroundColor: '#E4002B',
    borderColor: '#E4002B',
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    marginTop: -2,
  },
  groupInfo: {
    flex: 1,
  },
  groupName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1F2937',
  },
  groupNameSelected: {
    color: '#991B1B',
  },
  groupMeta: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  roleBadgeSelected: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#6B7280',
  },
  roleBadgeTextSelected: {
    color: '#92400E',
  },
  securityBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
    marginTop: 4,
  },
  securityTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 4,
  },
  securityText: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 16,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  btn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnCancel: {
    backgroundColor: '#F3F4F6',
  },
  btnCancelText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#4B5563',
  },
  btnSubmit: {
    backgroundColor: '#E4002B',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  btnSubmitText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});

