import React, {useEffect, useState, useCallback} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ScrollView,
  TextInput,
  Alert,
} from 'react-native';
import {listUsers, setUserPassword, updateUser, deleteUser} from '../../api/resources';
import {SafeAreaView as ContextSafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import Icon from '../../components/Icon';
import {InlineUserForm} from './AdminCollectionsBackendScreen';
import {getUserInitials} from '../../utils/userInitials';
import AddBossModal from '../../components/AddBossModal';

const AdminUsersScreen = ({
  token,
  onBack,
  onUserDetail,
  onEditUser,
  onProfile,
  currentAdmin,
}) => {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [showAddBossModal, setShowAddBossModal] = useState(false);

  const fetchUsers = useCallback((forceRefresh = true) => {
    setLoading(true);
    listUsers(token, undefined, {forceRefresh})
      .then(result => {
        setUsers((result.users || []).map(item => ({
          ...item,
          name: item.username,
          phone: item.mobileNumber,
          accountStatus: item.status,
          status: item.status === 'active' ? 'Active' : 'Inactive',
          email: item.email || 'No email configured',
          initials: getUserInitials(item.username),
          joined: item.createdAt ? `Joined ${new Date(item.createdAt).toLocaleDateString()}` : 'Join date unavailable',
          color: (item.displayRole === 'Boss' || item.isBoss)
            ? '#D97706'
            : item.displayRole === 'Admin'
            ? '#7C3AED'
            : '#C62828',
          assignedGroups: item.assignedGroups || [],
          displayRole: item.displayRole || (item.role === 'admin' ? 'Admin' : (item.isBoss ? 'Boss' : 'User')),
          isMembershipOnly: Boolean(item.isMembershipOnly),
          canEditDelete: Boolean(item.canEditDelete),
        })));
        setError('');
      })
      .catch(requestError => setError(requestError.message || 'Unable to load users.'))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    fetchUsers(true);
  }, [fetchUsers]);

  const filters = [
    'All',
    'Bosses',
    'Active',
    'Inactive',
  ];

  const filteredUsers = users.filter(user => {
    const searchValue = search.toLowerCase();

    const groupsMatch = (user.assignedGroups || []).some(g =>
      (g.name || '').toLowerCase().includes(searchValue)
    );

    const matchesSearch =
      (user.name || '').toLowerCase().includes(searchValue) ||
      (user.email || '').toLowerCase().includes(searchValue) ||
      (user.phone || '').toLowerCase().includes(searchValue) ||
      (user.displayRole || '').toLowerCase().includes(searchValue) ||
      groupsMatch;

    let matchesFilter = true;
    if (activeFilter === 'All') {
      matchesFilter = true;
    } else if (activeFilter === 'Bosses') {
      matchesFilter = user.displayRole === 'Boss' || user.isBoss;
    } else {
      matchesFilter = user.status === activeFilter;
    }

    return matchesSearch && matchesFilter;
  });

  const getStatusStyle = status => {
    if (status === 'Active') {
      return {
        container: styles.activeStatus,
        dot: styles.activeDot,
        text: styles.activeStatusText,
      };
    }

    if (status === 'Blocked') {
      return {
        container: styles.blockedStatus,
        dot: styles.blockedDot,
        text: styles.blockedStatusText,
      };
    }

    return {
      container: styles.inactiveStatus,
      dot: styles.inactiveDot,
      text: styles.inactiveStatusText,
    };
  };

  const getFilterCount = filter => {
    if (filter === 'All') {
      return users.length;
    }
    if (filter === 'Bosses') {
      return users.filter(user => user.displayRole === 'Boss' || user.isBoss).length;
    }
    return users.filter(user => user.status === filter).length;
  };

  const startUserEdit = user => {
    setEditingUser(user);
    setEditForm({
      username: user.username || user.name || '',
      mobileNumber: String(user.mobileNumber || user.phone || '').startsWith('+')
        ? (user.mobileNumber || user.phone)
        : `+${user.mobileNumber || user.phone || ''}`,
      email: user.email === 'No email configured' ? '' : (user.email || ''),
      password: '',
    });
  };

  const saveUserEdit = async () => {
    const userId = editingUser?._id || editingUser?.id;
    if (!userId || !editForm?.username?.trim() || !editForm?.mobileNumber?.trim()) {
      setError('Username and mobile number are required.');
      return;
    }
    setSubmitting(true);
    try {
      const mobileNumber = editForm.mobileNumber.trim();
      if (!/^\+[0-9]{7,15}$/.test(mobileNumber)) {
        setError('Mobile number must include country code, e.g. +923001234567.');
        setSubmitting(false);
        return;
      }
      if (editForm.password && editForm.password.length < 8) {
        setError('Password must be at least 8 characters.');
        setSubmitting(false);
        return;
      }
      const updated = await updateUser(token, userId, {
        username: editForm.username.trim(),
        mobileNumber,
        ...(editForm.email.trim() ? {email: editForm.email.trim()} : {}),
      });
      if (editForm.password) await setUserPassword(token, userId, editForm.password);
      const next = updated?.user || updated;
      setUsers(current => current.map(item => (item._id || item.id) === userId ? {
        ...item,
        ...next,
        name: next.username,
        phone: next.mobileNumber,
        email: next.email || 'No email configured',
      } : item));
      setEditingUser(null);
      setEditForm(null);
    } catch (requestError) {
      setError(requestError.message || 'Unable to update user.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUser = user => {
    const userId = user._id || user.id;
    Alert.alert(
      'Delete User',
      `Are you sure you want to delete ${user.name}? This will safely remove this admin-created account and revoke associated memberships.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteUser(token, userId);
              setUsers(prev => prev.filter(u => (u._id || u.id) !== userId));
              Alert.alert('User Deleted', `${user.name} has been removed.`);
            } catch (err) {
              Alert.alert('Unable to delete user', err.message || 'Please try again.');
            }
          },
        },
      ]
    );
  };

  return (
    <ContextSafeAreaView style={[styles.safeArea, {paddingTop: insets.top}]}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor="#F7F7F8"
      />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          activeOpacity={0.8}
          onPress={onBack}>
          <Icon name="back" size={22} color="#1A1A1A" />
        </TouchableOpacity>

        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>
            User Management
          </Text>

          <Text style={styles.headerSubtitle}>
            {users.length} REGISTERED USERS
          </Text>
        </View>

        <TouchableOpacity
          style={styles.headerProfile}
          activeOpacity={0.8}
          onPress={onProfile}>
          <Text style={styles.headerProfileText}>
            {getUserInitials(currentAdmin?.username)}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.container}>
        {editingUser ? (
          <InlineUserForm
            editMode
            form={editForm}
            setForm={setEditForm}
            submitting={submitting}
            onCancel={() => {setEditingUser(null); setEditForm(null);}}
            onSubmit={saveUserEdit}
          />
        ) : null}

        {/* ================= PROMINENT ADD BOSS BANNER BUTTON ================= */}
        <View style={styles.addBossBannerRow}>
          <TouchableOpacity
            style={styles.addBossButton}
            activeOpacity={0.85}
            onPress={() => setShowAddBossModal(true)}>
            <View style={styles.addBossIconBox}>
              <Text style={styles.addBossPlus}>+</Text>
            </View>
            <View style={styles.addBossTextContent}>
              <View style={styles.addBossTitleRow}>
                <Text style={styles.addBossTitle}>Add Boss</Text>
                <View style={styles.addBossTag}>
                  <Text style={styles.addBossTagText}>MULTI-GROUP</Text>
                </View>
              </View>
              <Text style={styles.addBossSubtitle}>
                Create or assign group-scoped Boss permissions
              </Text>
            </View>
            <Text style={styles.addBossArrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={styles.searchContainer}>
          <Text style={styles.searchIcon}>⌕</Text>

          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search users by name, phone or group"
            placeholderTextColor="#A1A1A6"
          />

          {search.length > 0 && (
            <TouchableOpacity
              style={styles.clearButton}
              activeOpacity={0.8}
              onPress={() => setSearch('')}>
              <Text style={styles.clearButtonText}>
                ×
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Filter */}
        <View style={styles.filterHeader}>
          <Text style={styles.filterTitle}>
            FILTER USERS
          </Text>

          <Text style={styles.resultCount}>
            {filteredUsers.length} results
          </Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}>
          {filters.map(filter => {
            const isActive = activeFilter === filter;

            return (
              <TouchableOpacity
                key={filter}
                style={[
                  styles.filterButton,
                  isActive && styles.filterButtonActive,
                ]}
                activeOpacity={0.8}
                onPress={() => setActiveFilter(filter)}>
                <Text
                  style={[
                    styles.filterButtonText,
                    isActive && styles.filterButtonTextActive,
                  ]}>
                  {filter}
                </Text>

                <View
                  style={[
                    styles.filterCount,
                    isActive && styles.filterCountActive,
                  ]}>
                  <Text
                    style={[
                      styles.filterCountText,
                      isActive && styles.filterCountTextActive,
                    ]}>
                    {getFilterCount(filter)}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Summary Stats */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <View style={[styles.summaryDot, styles.summaryBossDot]} />
            <Text style={styles.summaryText}>Bosses</Text>
            <Text style={styles.summaryNumber}>{getFilterCount('Bosses')}</Text>
          </View>

          <View style={styles.summaryItem}>
            <View style={[styles.summaryDot, styles.summaryActiveDot]} />
            <Text style={styles.summaryText}>Active</Text>
            <Text style={styles.summaryNumber}>{getFilterCount('Active')}</Text>
          </View>

          <View style={styles.summaryItem}>
            <View style={[styles.summaryDot, styles.summaryInactiveDot]} />
            <Text style={styles.summaryText}>Inactive</Text>
            <Text style={styles.summaryNumber}>{getFilterCount('Inactive')}</Text>
          </View>
        </View>

        {/* Users List */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.usersList}>

          {loading ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Loading users...</Text>
            </View>
          ) : error ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Unable to load users</Text>
              <Text style={styles.emptyDescription}>{error}</Text>
            </View>
          ) : filteredUsers.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconContainer}>
                <Text style={styles.emptyIcon}>⌕</Text>
              </View>

              <Text style={styles.emptyTitle}>
                No Users Found
              </Text>

              <Text style={styles.emptyDescription}>
                Try changing your search or filter.
              </Text>
            </View>
          ) : (
            filteredUsers.map(user => {
              const statusStyle = getStatusStyle(user.status);
              const isBoss = user.displayRole === 'Boss' || user.isBoss;
              const isAdmin = user.displayRole === 'Admin' || user.role === 'admin';

              return (
                <TouchableOpacity
                  key={user.id || user._id}
                  style={[styles.userCard, isBoss && styles.userCardBoss]}
                  activeOpacity={0.85}
                  onPress={() => {
                    if (onUserDetail) {
                      onUserDetail(user);
                    }
                  }}>
                  {/* Top Row */}
                  <View style={styles.userTopRow}>
                    <View style={styles.userLeft}>
                      <View
                        style={[
                          styles.userAvatar,
                          {
                            backgroundColor: user.color,
                          },
                        ]}>
                        <Text style={styles.userAvatarText}>
                          {user.initials}
                        </Text>
                      </View>

                      <View style={styles.userMainInfo}>
                        <View style={styles.userNameRow}>
                          <Text style={styles.userName}>
                            {user.name}
                          </Text>

                          {/* Role Badge */}
                          <View
                            style={[
                              styles.roleBadge,
                              isBoss
                                ? styles.roleBadgeBoss
                                : isAdmin
                                ? styles.roleBadgeAdmin
                                : styles.roleBadgeUser,
                            ]}>
                            <Text
                              style={[
                                styles.roleBadgeText,
                                isBoss
                                  ? styles.roleBadgeBossText
                                  : isAdmin
                                  ? styles.roleBadgeAdminText
                                  : styles.roleBadgeUserText,
                              ]}>
                              {user.displayRole}
                            </Text>
                          </View>
                        </View>

                        <Text style={styles.userEmail}>
                          {user.email}
                        </Text>
                      </View>
                    </View>

                    <View
                      style={[
                        styles.statusBadge,
                        statusStyle.container,
                      ]}>
                      <View
                        style={[
                          styles.statusDot,
                          statusStyle.dot,
                        ]}
                      />

                      <Text
                        style={[
                          styles.statusText,
                          statusStyle.text,
                        ]}>
                        {user.status}
                      </Text>
                    </View>
                  </View>

                  {/* Assigned Groups Section */}
                  <View style={styles.groupsSection}>
                    <Text style={styles.groupsSectionLabel}>Assigned Groups:</Text>
                    <View style={styles.groupsChipsContainer}>
                      {user.assignedGroups && user.assignedGroups.length > 0 ? (
                        user.assignedGroups.map((g, index) => {
                          const isGroupBoss = g.role === 'boss';
                          return (
                            <View
                              key={`${g.id || g._id || index}`}
                              style={[
                                styles.groupChip,
                                isGroupBoss && styles.groupChipBoss,
                              ]}>
                              <Text
                                style={[
                                  styles.groupChipText,
                                  isGroupBoss && styles.groupChipBossText,
                                ]}>
                                {g.name} ({isGroupBoss ? 'Boss' : 'User'})
                              </Text>
                            </View>
                          );
                        })
                      ) : (
                        <Text style={styles.noGroupsText}>No groups assigned</Text>
                      )}
                    </View>
                  </View>

                  {/* Divider */}
                  <View style={styles.cardDivider} />

                  {/* Bottom Row */}
                  <View style={styles.userBottomRow}>
                    <View style={styles.phoneContainer}>
                      <Text style={styles.phoneIcon}>☎</Text>
                      <Text style={styles.phoneText}>
                        {user.phone}
                      </Text>
                    </View>

                    <View style={styles.actionsContainer}>
                      {user.canEditDelete ? (
                        <View style={styles.editDeleteButtons}>
                          <TouchableOpacity
                            accessibilityRole="button"
                            accessibilityLabel={`Edit ${user.name}`}
                            onPress={() => startUserEdit(user)}
                            style={styles.editButton}>
                            <Text style={styles.editButtonText}>Edit</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            accessibilityRole="button"
                            accessibilityLabel={`Delete ${user.name}`}
                            onPress={() => handleDeleteUser(user)}
                            style={styles.deleteButton}>
                            <Text style={styles.deleteButtonText}>Delete</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <View style={styles.membershipOnlyBadge}>
                          <Text style={styles.membershipOnlyText}>Managed in Groups</Text>
                        </View>
                      )}

                      <Text style={styles.userArrow}>›</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })
          )}

          <View style={styles.bottomSpace} />
        </ScrollView>
      </View>

      {/* Add Boss Modal */}
      <AddBossModal
        visible={showAddBossModal}
        onClose={() => setShowAddBossModal(false)}
        token={token}
        onSuccess={() => fetchUsers(true)}
        existingUsers={users}
      />
    </ContextSafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F7F7F8',
  },

  header: {
    height: 74,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8EB',
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
  },

  backButton: {
    width: 42,
    height: 42,
    justifyContent: 'center',
  },

  headerContent: {
    flex: 1,
    alignItems: 'center',
  },

  headerTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#1A1A1A',
  },

  headerSubtitle: {
    fontSize: 9,
    fontWeight: '900',
    color: '#E4002B',
    marginTop: 3,
    letterSpacing: 1.2,
  },

  headerProfile: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FDE7EA',
    borderWidth: 1.5,
    borderColor: '#F8B4BD',
    alignItems: 'center',
    justifyContent: 'center',
  },

  headerProfileText: {
    color: '#E4002B',
    fontSize: 13,
    fontWeight: '900',
  },

  container: {
    flex: 1,
    paddingTop: 12,
  },

  /* Prominent Add Boss Button */
  addBossBannerRow: {
    paddingHorizontal: 18,
    marginBottom: 12,
  },

  addBossButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#F59E0B',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },

  addBossIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  addBossPlus: {
    fontSize: 24,
    fontWeight: '900',
    color: '#B45309',
    marginTop: -2,
  },

  addBossTextContent: {
    flex: 1,
  },

  addBossTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  addBossTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#1A1A1A',
    marginRight: 8,
  },

  addBossTag: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },

  addBossTagText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#92400E',
    letterSpacing: 0.5,
  },

  addBossSubtitle: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },

  addBossArrow: {
    fontSize: 22,
    color: '#D97706',
    fontWeight: '300',
    marginLeft: 6,
  },

  searchContainer: {
    marginHorizontal: 18,
    height: 48,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8E8EB',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    marginBottom: 12,
  },

  searchIcon: {
    fontSize: 16,
    color: '#A1A1A6',
    marginRight: 8,
  },

  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#1A1A1A',
    padding: 0,
  },

  clearButton: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },

  clearButtonText: {
    fontSize: 18,
    color: '#A1A1A6',
    fontWeight: '700',
  },

  filterHeader: {
    marginHorizontal: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },

  filterTitle: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.1,
    color: '#8A8A8E',
  },

  resultCount: {
    fontSize: 12,
    color: '#8A8A8E',
  },

  filterScroll: {
    paddingHorizontal: 18,
    paddingBottom: 10,
    gap: 8,
  },

  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8E8EB',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },

  filterButtonActive: {
    backgroundColor: '#E4002B',
    borderColor: '#E4002B',
  },

  filterButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#4B5563',
    marginRight: 6,
  },

  filterButtonTextActive: {
    color: '#FFFFFF',
  },

  filterCount: {
    backgroundColor: '#F1F2F4',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },

  filterCountActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },

  filterCountText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#6B7280',
  },

  filterCountTextActive: {
    color: '#FFFFFF',
  },

  summaryRow: {
    marginHorizontal: 18,
    marginTop: 4,
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8E8EB',
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },

  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  summaryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },

  summaryBossDot: {
    backgroundColor: '#F59E0B',
  },

  summaryActiveDot: {
    backgroundColor: '#10B981',
  },

  summaryInactiveDot: {
    backgroundColor: '#9CA3AF',
  },

  summaryText: {
    fontSize: 12,
    color: '#6B7280',
    marginRight: 5,
  },

  summaryNumber: {
    fontSize: 13,
    fontWeight: '900',
    color: '#1A1A1A',
  },

  usersList: {
    paddingHorizontal: 18,
    paddingBottom: 24,
  },

  userCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8E8EB',
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },

  userCardBoss: {
    borderColor: '#FDE68A',
    backgroundColor: '#FFFDF9',
  },

  userTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },

  userLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },

  userAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  userAvatarText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },

  userMainInfo: {
    flex: 1,
  },

  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },

  userName: {
    fontSize: 15,
    fontWeight: '900',
    color: '#1A1A1A',
  },

  roleBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },

  roleBadgeBoss: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
  },

  roleBadgeBossText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#92400E',
  },

  roleBadgeAdmin: {
    backgroundColor: '#EDE9FE',
    borderColor: '#DDD6FE',
  },

  roleBadgeAdminText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#6D28D9',
  },

  roleBadgeUser: {
    backgroundColor: '#F3F4F6',
    borderColor: '#E5E7EB',
  },

  roleBadgeUserText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#4B5563',
  },

  userEmail: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },

  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },

  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },

  statusText: {
    fontSize: 11,
    fontWeight: '800',
  },

  activeStatus: {
    backgroundColor: '#ECFDF5',
  },

  activeDot: {
    backgroundColor: '#10B981',
  },

  activeStatusText: {
    color: '#059669',
  },

  blockedStatus: {
    backgroundColor: '#FEF2F2',
  },

  blockedDot: {
    backgroundColor: '#EF4444',
  },

  blockedStatusText: {
    color: '#DC2626',
  },

  inactiveStatus: {
    backgroundColor: '#F3F4F6',
  },

  inactiveDot: {
    backgroundColor: '#9CA3AF',
  },

  inactiveStatusText: {
    color: '#6B7280',
  },

  groupsSection: {
    marginTop: 10,
  },

  groupsSectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6B7280',
    marginBottom: 4,
  },

  groupsChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },

  groupChip: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },

  groupChipBoss: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
  },

  groupChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },

  groupChipBossText: {
    color: '#92400E',
    fontWeight: '800',
  },

  noGroupsText: {
    fontSize: 11,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },

  cardDivider: {
    height: 1,
    backgroundColor: '#F0F0F2',
    marginVertical: 10,
  },

  userBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  phoneContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  phoneIcon: {
    fontSize: 12,
    color: '#6B7280',
    marginRight: 4,
  },

  phoneText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4B5563',
  },

  actionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  editDeleteButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  editButton: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },

  editButtonText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1F2937',
  },

  deleteButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },

  deleteButtonText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#B91C1C',
  },

  membershipOnlyBadge: {
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },

  membershipOnlyText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },

  userArrow: {
    fontSize: 18,
    color: '#9CA3AF',
    marginLeft: 6,
  },

  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },

  emptyIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },

  emptyIcon: {
    fontSize: 20,
    color: '#9CA3AF',
  },

  emptyTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#1A1A1A',
  },

  emptyDescription: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
    textAlign: 'center',
  },

  bottomSpace: {
    height: 60,
  },
});

export default AdminUsersScreen;
