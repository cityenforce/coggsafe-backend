// SosReportModal.js
// Comprehensive SOS Reporting, Date Filtering & PDF Export Modal for Admin and User sides.

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Platform,
  Alert,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getSosReports, listSos, listUsers } from '../api/resources';
import { exportSosReportToPdf, openPdfFile, sharePdfFile } from '../services/pdf/pdfExportService';
import Icon from './Icon';

const PERIODS = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'yearly', label: 'Yearly' },
  { key: 'custom', label: 'Custom' },
];

const STATUS_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'deactivated', label: 'Deactivated' },
];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAYS_SHORT = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function padZero(n) {
  return String(n).padStart(2, '0');
}

function formatDateStr(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${padZero(d.getMonth() + 1)}-${padZero(d.getDate())}`;
}

export default function SosReportModal({
  visible,
  onClose,
  token,
  isAdmin = false,
  currentUser = null,
  onSosDetail = null,
}) {
  const [selectedPeriod, setSelectedPeriod] = useState('daily');
  const [selectedStatus, setSelectedStatus] = useState('all');

  // Dates state
  const [activeDate, setActiveDate] = useState(() => new Date());
  const [calendarYear, setCalendarYear] = useState(() => new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().getMonth()); // 0-11
  const [customStartDate, setCustomStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return formatDateStr(d);
  });
  const [customEndDate, setCustomEndDate] = useState(() => formatDateStr(new Date()));
  const [selectingDateTarget, setSelectingDateTarget] = useState('single'); // 'single', 'start', 'end'

  // User filter state (Admin only)
  const [usersList, setUsersList] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [userSearchText, setUserSearchText] = useState('');

  // Report records state
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [recordsData, setRecordsData] = useState({ reportMeta: {}, records: [] });
  const [fetchError, setFetchError] = useState('');

  // PDF Export state
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [exportSuccessModal, setExportSuccessModal] = useState({
    visible: false,
    filePath: '',
    fileName: '',
    totalPages: 1,
  });

  // Load available users for Admin filter
  useEffect(() => {
    if (!isAdmin || !token) return;

    let isMounted = true;
    async function fetchUsers() {
      try {
        const res = await listUsers(token, { limit: 100 });
        if (isMounted && res?.users) {
          setUsersList(res.users);
        }
      } catch (_) {}
    }
    fetchUsers();

    return () => {
      isMounted = false;
    };
  }, [isAdmin, token]);

  // Build query parameters based on selected period & filters
  const buildQueryParams = useCallback(() => {
    const params = {
      period: selectedPeriod,
      status: selectedStatus,
    };

    if (isAdmin && selectedUserId) {
      params.userId = selectedUserId;
    }

    if (selectedPeriod === 'daily' || selectedPeriod === 'weekly') {
      params.date = formatDateStr(activeDate);
    } else if (selectedPeriod === 'monthly') {
      params.year = calendarYear;
      params.month = calendarMonth + 1;
    } else if (selectedPeriod === 'yearly') {
      params.year = calendarYear;
    } else if (selectedPeriod === 'custom') {
      params.startDate = customStartDate;
      params.endDate = customEndDate;
    }

    return params;
  }, [
    selectedPeriod,
    selectedStatus,
    isAdmin,
    selectedUserId,
    activeDate,
    calendarYear,
    calendarMonth,
    customStartDate,
    customEndDate,
  ]);

  // Calculate week range for weekly period display
  const weekRangeInfo = useMemo(() => {
    const d = new Date(activeDate);
    const day = d.getDay();
    const distToMon = (day + 6) % 7;
    const mon = new Date(d);
    mon.setDate(d.getDate() - distToMon);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    return {
      startStr: formatDateStr(mon),
      endStr: formatDateStr(sun),
    };
  }, [activeDate]);

  // Fetch report data from backend (with graceful fallback to listSos if remote server has not deployed /reports yet)
  const fetchReportData = useCallback(async () => {
    if (!token || !visible) return;

    setLoadingRecords(true);
    setFetchError('');

    try {
      const params = buildQueryParams();
      let resData = null;

      try {
        const response = await getSosReports(token, params, { forceRefresh: true });
        if (response?.data) {
          resData = response.data;
        } else if (response?.reportMeta) {
          resData = response;
        }
      } catch (reportsApiErr) {
        // If the endpoint does not exist yet on the remote production server
        // (e.g. Hostinger server returning 400 "Invalid SOS id" or 404),
        // fallback to querying listSos and filtering in-memory:
        const isUndeployedServer =
          reportsApiErr?.status === 404 ||
          (reportsApiErr?.message && /Invalid SOS id/i.test(reportsApiErr.message));

        if (!isUndeployedServer) {
          throw reportsApiErr;
        }

        const listRes = await listSos(token, { limit: 100 }, { forceRefresh: true });
        const allAlerts = listRes?.sos || [];

        // Apply filters in-memory
        const filtered = allAlerts.filter(s => {
          // User filter
          if (isAdmin && selectedUserId) {
            const uid = s.userId?._id || s.userId?.id || s.userId;
            if (uid !== selectedUserId) return false;
          } else if (!isAdmin && currentUser?.id) {
            const uid = s.userId?._id || s.userId?.id || s.userId;
            if (uid && uid !== currentUser.id) return false;
          }

          // Status filter
          if (selectedStatus !== 'all') {
            const st = (s.status || '').toLowerCase();
            if (st !== selectedStatus.toLowerCase()) return false;
          }

          // Date filter based on period:
          if (!s.createdAt) return false;
          const sDate = new Date(s.createdAt);
          const sDateStr = formatDateStr(sDate);

          if (selectedPeriod === 'daily') {
            const targetDateStr = formatDateStr(activeDate);
            if (sDateStr !== targetDateStr) return false;
          } else if (selectedPeriod === 'weekly') {
            const d = new Date(activeDate);
            const day = d.getDay();
            const distToMon = (day + 6) % 7;
            const mon = new Date(d);
            mon.setDate(d.getDate() - distToMon);
            mon.setHours(0, 0, 0, 0);
            const sun = new Date(mon);
            sun.setDate(mon.getDate() + 6);
            sun.setHours(23, 59, 59, 999);
            if (sDate < mon || sDate > sun) return false;
          } else if (selectedPeriod === 'monthly') {
            if (sDate.getFullYear() !== calendarYear || sDate.getMonth() !== calendarMonth) return false;
          } else if (selectedPeriod === 'yearly') {
            if (sDate.getFullYear() !== calendarYear) return false;
          } else if (selectedPeriod === 'custom') {
            if (sDateStr < customStartDate || sDateStr > customEndDate) return false;
          }

          return true;
        });

        const formattedRecords = filtered.map(s => {
          const hasLocation = s.location?.latitude != null && s.location?.longitude != null;
          const createdAt = s.createdAt || new Date().toISOString();
          const resolvedAt = s.resolvedAt || (s.status === 'deactivated' || s.status === 'cancelled' ? s.updatedAt : null);
          let durationMinutes = null;
          if (resolvedAt && createdAt) {
            durationMinutes = Math.max(1, Math.round((new Date(resolvedAt) - new Date(createdAt)) / 60000));
          }

          return {
            _id: s._id || s.id,
            id: s._id || s.id,
            status: s.status || 'active',
            triggeredAt: createdAt,
            createdAt: createdAt,
            resolvedAt: resolvedAt,
            durationMinutes,
            emergencyMessage: s.emergencyMessage || 'Emergency alert triggered.',
            user: {
              id: s.userId?._id || s.userId?.id || 'N/A',
              name: s.userId?.username || 'CoGG Safe user',
              mobileNumber: s.userId?.mobileNumber || 'Not Available',
              email: s.userId?.email || 'Not Available',
              department: s.userId?.department || s.collectionId?.name || 'Not Available',
            },
            location: {
              latitude: s.location?.latitude ?? null,
              longitude: s.location?.longitude ?? null,
              accuracy: s.location?.accuracy ?? null,
              address: s.location?.address || (hasLocation ? `${s.location.latitude.toFixed(5)}, ${s.location.longitude.toFixed(5)}` : 'Not Available'),
              status: s.location?.status || (hasLocation ? 'captured' : 'pending'),
              capturedAt: s.location?.capturedAt || createdAt,
              source: s.location?.source || 'gps',
            },
            media: {
              hasFrontPhoto: !!s.media?.frontPhoto?.url,
              hasBackPhoto: !!s.media?.backPhoto?.url,
              hasAudio: !!s.media?.audioRecording?.url,
              frontPhoto: s.media?.frontPhoto || null,
              backPhoto: s.media?.backPhoto || null,
              audioRecording: s.media?.audioRecording || null,
            },
            dispatch: s.dispatch || {},
          };
        });

        let startRange = '';
        let endRange = '';
        if (selectedPeriod === 'daily') {
          startRange = formatDateStr(activeDate);
          endRange = startRange;
        } else if (selectedPeriod === 'weekly') {
          startRange = weekRangeInfo.startStr;
          endRange = weekRangeInfo.endStr;
        } else if (selectedPeriod === 'monthly') {
          startRange = `${calendarYear}-${padZero(calendarMonth + 1)}-01`;
          endRange = `${calendarYear}-${padZero(calendarMonth + 1)}-${new Date(calendarYear, calendarMonth + 1, 0).getDate()}`;
        } else if (selectedPeriod === 'yearly') {
          startRange = `${calendarYear}-01-01`;
          endRange = `${calendarYear}-12-31`;
        } else {
          startRange = customStartDate;
          endRange = customEndDate;
        }

        resData = {
          reportMeta: {
            period: selectedPeriod,
            dateRange: { start: startRange, end: endRange },
            statusFilter: selectedStatus,
            userFilter: selectedUserId ? (usersList.find(u => u._id === selectedUserId)?.username || selectedUserId) : 'all',
            totalRecords: formattedRecords.length,
            activeRecords: formattedRecords.filter(r => (r.status || '').toLowerCase() === 'active').length,
            deactivatedRecords: formattedRecords.filter(r => (r.status || '').toLowerCase() !== 'active').length,
            withMediaCount: formattedRecords.filter(r => r.media?.hasFrontPhoto || r.media?.hasBackPhoto || r.media?.hasAudio).length,
            generatedAt: new Date().toISOString(),
          },
          records: formattedRecords,
        };
      }

      if (resData) {
        setRecordsData(resData);
      } else {
        setRecordsData({ reportMeta: {}, records: [] });
      }
    } catch (err) {
      setFetchError(err.message || 'Unable to retrieve SOS reports for selected period.');
    } finally {
      setLoadingRecords(false);
    }
  }, [
    token,
    visible,
    buildQueryParams,
    isAdmin,
    selectedUserId,
    currentUser,
    selectedStatus,
    selectedPeriod,
    activeDate,
    calendarYear,
    calendarMonth,
    customStartDate,
    customEndDate,
    weekRangeInfo,
    usersList,
  ]);

  useEffect(() => {
    if (visible) {
      fetchReportData();
    }
  }, [visible, fetchReportData]);

  // Handle PDF Generation & Export
  const handleDownloadPdf = async () => {
    if (isExportingPdf) return;

    setIsExportingPdf(true);

    try {
      const result = await exportSosReportToPdf(recordsData);
      setExportSuccessModal({
        visible: true,
        filePath: result.filePath,
        fileName: result.fileName,
        totalPages: result.totalPages,
      });
    } catch (err) {
      Alert.alert('PDF Export Error', err.message || 'Failed to generate PDF report.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Handle Native Open
  const handleOpenPdf = async () => {
    try {
      if (exportSuccessModal.filePath) {
        await openPdfFile(exportSuccessModal.filePath);
      }
    } catch (err) {
      Alert.alert('Open Error', err.message || 'Unable to open PDF on this device.');
    }
  };

  // Handle Native Share
  const handleSharePdf = async () => {
    try {
      if (exportSuccessModal.filePath) {
        await sharePdfFile(
          exportSuccessModal.filePath,
          `CoGG Safe ${recordsData?.reportMeta?.formattedPeriodLabel || 'SOS Report'}`
        );
      }
    } catch (err) {
      Alert.alert('Share Error', err.message || 'Unable to share PDF.');
    }
  };

  // Calendar days calculation (Monday-first)
  const calendarDays = useMemo(() => {
    const firstDay = new Date(calendarYear, calendarMonth, 1);
    const lastDay = new Date(calendarYear, calendarMonth + 1, 0);

    const days = [];
    const firstDayIndex = (firstDay.getDay() + 6) % 7; // Monday = 0

    // Leading empty days from prev month
    for (let i = 0; i < firstDayIndex; i++) {
      days.push({ empty: true, key: `empty-${i}` });
    }

    // Days of current month
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const dateObj = new Date(calendarYear, calendarMonth, d);
      const str = formatDateStr(dateObj);
      days.push({
        dayNumber: d,
        dateStr: str,
        dateObj,
        key: str,
      });
    }

    return days;
  }, [calendarYear, calendarMonth]);

  // Check if a day belongs to the selected date or week
  const isDateSelected = (dateStr) => {
    if (!dateStr) return false;

    if (selectedPeriod === 'daily') {
      return dateStr === formatDateStr(activeDate);
    }
    if (selectedPeriod === 'weekly') {
      return dateStr >= weekRangeInfo.startStr && dateStr <= weekRangeInfo.endStr;
    }
    if (selectedPeriod === 'custom') {
      return dateStr >= customStartDate && dateStr <= customEndDate;
    }
    return false;
  };

  const handleDayPress = (dayItem) => {
    if (dayItem.empty) return;

    if (selectedPeriod === 'daily' || selectedPeriod === 'weekly') {
      setActiveDate(dayItem.dateObj);
    } else if (selectedPeriod === 'custom') {
      if (selectingDateTarget === 'start') {
        setCustomStartDate(dayItem.dateStr);
        if (dayItem.dateStr > customEndDate) {
          setCustomEndDate(dayItem.dateStr);
        }
        setSelectingDateTarget('end');
      } else {
        if (dayItem.dateStr < customStartDate) {
          setCustomStartDate(dayItem.dateStr);
        } else {
          setCustomEndDate(dayItem.dateStr);
        }
        setSelectingDateTarget('start');
      }
    }
  };

  const prevMonth = () => {
    if (calendarMonth === 0) {
      setCalendarMonth(11);
      setCalendarYear(y => y - 1);
    } else {
      setCalendarMonth(m => m - 1);
    }
  };

  const nextMonth = () => {
    if (calendarMonth === 11) {
      setCalendarMonth(0);
      setCalendarYear(y => y + 1);
    } else {
      setCalendarMonth(m => m + 1);
    }
  };

  const selectedUserObj = usersList.find(u => (u._id || u.id) === selectedUserId);
  const filteredUsers = usersList.filter(u => {
    const q = userSearchText.toLowerCase();
    return (
      (u.username || '').toLowerCase().includes(q) ||
      (u.mobileNumber || '').includes(q) ||
      (u.email || '').toLowerCase().includes(q)
    );
  });

  const totalRecordsFound = recordsData?.records?.length || 0;

  let insets = { top: 0, bottom: 0, left: 0, right: 0 };
  try {
    insets = useSafeAreaInsets();
  } catch (_) {}
  const topInset = Math.max(insets?.top || 0, Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 0);
  const bottomInset = Math.max(insets?.bottom || 0, Platform.OS === 'android' ? 24 : 12);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      statusBarTranslucent={false}
      onRequestClose={onClose}
    >
      <View style={[styles.safeArea, { paddingTop: topInset, paddingBottom: bottomInset }]}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" translucent={false} />
        {/* ================= MODAL HEADER ================= */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose} activeOpacity={0.7}>
            <Text style={styles.closeIcon}>×</Text>
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>
              {isAdmin ? 'Admin SOS Reports' : 'My SOS Reports'}
            </Text>
            <Text style={styles.headerSubtitle}>
              Date filtering & PDF export system
            </Text>
          </View>
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={fetchReportData}
            activeOpacity={0.7}
          >
            <Icon name="refresh" size={18} color="#E4002B" />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ================= REPORT PERIOD SELECTOR ================= */}
          <Text style={styles.sectionLabel}>Select Reporting Period</Text>
          <View style={styles.periodTabs}>
            {PERIODS.map(item => {
              const isSelected = selectedPeriod === item.key;
              return (
                <TouchableOpacity
                  key={item.key}
                  style={[styles.periodTab, isSelected && styles.periodTabActive]}
                  onPress={() => setSelectedPeriod(item.key)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.periodTabText, isSelected && styles.periodTabTextActive]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ================= INTERACTIVE DATE SELECTION ================= */}
          {(selectedPeriod === 'daily' || selectedPeriod === 'weekly' || selectedPeriod === 'custom') && (
            <View style={styles.calendarCard}>
              <View style={styles.calendarNav}>
                <TouchableOpacity style={styles.navArrow} onPress={prevMonth}>
                  <Text style={styles.navArrowText}>‹</Text>
                </TouchableOpacity>
                <Text style={styles.calendarMonthText}>
                  {MONTH_NAMES[calendarMonth]} {calendarYear}
                </Text>
                <TouchableOpacity style={styles.navArrow} onPress={nextMonth}>
                  <Text style={styles.navArrowText}>›</Text>
                </TouchableOpacity>
              </View>

              {/* Day headers */}
              <View style={styles.calendarGrid}>
                {DAYS_SHORT.map((d, i) => (
                  <View key={`day-${i}`} style={styles.dayColHeader}>
                    <Text style={styles.dayColHeaderText}>{d}</Text>
                  </View>
                ))}

                {/* Day cells */}
                {calendarDays.map((cell) => {
                  if (cell.empty) {
                    return <View key={cell.key} style={styles.dayCellEmpty} />;
                  }

                  const selected = isDateSelected(cell.dateStr);
                  const isToday = cell.dateStr === formatDateStr(new Date());

                  return (
                    <TouchableOpacity
                      key={cell.key}
                      style={[
                        styles.dayCell,
                        selected && styles.dayCellSelected,
                        isToday && !selected && styles.dayCellToday,
                      ]}
                      onPress={() => handleDayPress(cell)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.dayCellText,
                          selected && styles.dayCellTextSelected,
                          isToday && !selected && styles.dayCellTextToday,
                        ]}
                      >
                        {cell.dayNumber}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Selection summary pill */}
              <View style={styles.periodSummaryRow}>
                <Text style={styles.summaryInfoText}>
                  {selectedPeriod === 'daily' && `Selected Date: ${formatDateStr(activeDate)}`}
                  {selectedPeriod === 'weekly' && `Selected Week: ${weekRangeInfo.startStr} to ${weekRangeInfo.endStr}`}
                  {selectedPeriod === 'custom' && `Range: ${customStartDate} to ${customEndDate}`}
                </Text>
              </View>

              {/* Custom Date Pickers toggle */}
              {selectedPeriod === 'custom' && (
                <View style={styles.customDatePickersRow}>
                  <TouchableOpacity
                    style={[
                      styles.customDateBtn,
                      selectingDateTarget === 'start' && styles.customDateBtnActive,
                    ]}
                    onPress={() => setSelectingDateTarget('start')}
                  >
                    <Text style={styles.customDateLabel}>Start Date</Text>
                    <Text style={styles.customDateVal}>{customStartDate}</Text>
                  </TouchableOpacity>
                  <Text style={styles.customDateArrow}>&rarr;</Text>
                  <TouchableOpacity
                    style={[
                      styles.customDateBtn,
                      selectingDateTarget === 'end' && styles.customDateBtnActive,
                    ]}
                    onPress={() => setSelectingDateTarget('end')}
                  >
                    <Text style={styles.customDateLabel}>End Date</Text>
                    <Text style={styles.customDateVal}>{customEndDate}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* ================= MONTHLY PICKER ================= */}
          {selectedPeriod === 'monthly' && (
            <View style={styles.calendarCard}>
              <View style={styles.calendarNav}>
                <TouchableOpacity style={styles.navArrow} onPress={() => setCalendarYear(y => y - 1)}>
                  <Text style={styles.navArrowText}>‹</Text>
                </TouchableOpacity>
                <Text style={styles.calendarMonthText}>{calendarYear}</Text>
                <TouchableOpacity style={styles.navArrow} onPress={() => setCalendarYear(y => y + 1)}>
                  <Text style={styles.navArrowText}>›</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.monthsGrid}>
                {MONTH_NAMES.map((mName, idx) => {
                  const isSelected = calendarMonth === idx;
                  return (
                    <TouchableOpacity
                      key={mName}
                      style={[styles.monthPill, isSelected && styles.monthPillActive]}
                      onPress={() => setCalendarMonth(idx)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.monthPillText, isSelected && styles.monthPillTextActive]}>
                        {mName.slice(0, 3)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* ================= YEARLY PICKER ================= */}
          {selectedPeriod === 'yearly' && (
            <View style={styles.calendarCard}>
              <Text style={styles.calendarMonthText}>Select Year</Text>
              <View style={styles.yearsRow}>
                {[2024, 2025, 2026, 2027].map(yr => {
                  const isSelected = calendarYear === yr;
                  return (
                    <TouchableOpacity
                      key={yr}
                      style={[styles.yearPill, isSelected && styles.yearPillActive]}
                      onPress={() => setCalendarYear(yr)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.yearPillText, isSelected && styles.yearPillTextActive]}>
                        {yr}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* ================= USER FILTER (ADMIN ONLY) ================= */}
          {isAdmin && (
            <View style={styles.filterSection}>
              <Text style={styles.sectionLabel}>Filter by User</Text>
              <TouchableOpacity
                style={styles.dropdownSelector}
                onPress={() => setShowUserDropdown(!showUserDropdown)}
                activeOpacity={0.8}
              >
                <Text style={styles.dropdownSelectorText}>
                  {selectedUserObj ? `${selectedUserObj.username} (${selectedUserObj.mobileNumber || 'No mobile'})` : 'All Users (View All History)'}
                </Text>
                <Text style={styles.dropdownArrow}>{showUserDropdown ? '▲' : '▼'}</Text>
              </TouchableOpacity>

              {showUserDropdown && (
                <View style={styles.dropdownMenu}>
                  <TextInput
                    style={styles.userSearchInput}
                    placeholder="Search by username or phone..."
                    placeholderTextColor="#9CA3AF"
                    value={userSearchText}
                    onChangeText={setUserSearchText}
                  />
                  <ScrollView style={styles.usersDropdownScroll} nestedScrollEnabled>
                    <TouchableOpacity
                      style={[styles.userItem, !selectedUserId && styles.userItemActive]}
                      onPress={() => {
                        setSelectedUserId('');
                        setShowUserDropdown(false);
                      }}
                    >
                      <Text style={[styles.userItemText, !selectedUserId && styles.userItemTextActive]}>
                        All Users
                      </Text>
                    </TouchableOpacity>
                    {filteredUsers.map(userItem => {
                      const uid = userItem._id || userItem.id;
                      const isSel = selectedUserId === uid;
                      return (
                        <TouchableOpacity
                          key={uid}
                          style={[styles.userItem, isSel && styles.userItemActive]}
                          onPress={() => {
                            setSelectedUserId(uid);
                            setShowUserDropdown(false);
                          }}
                        >
                          <Text style={[styles.userItemText, isSel && styles.userItemTextActive]}>
                            {userItem.username}
                          </Text>
                          <Text style={styles.userItemSub}>
                            {userItem.mobileNumber || userItem.email || 'User'}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}
            </View>
          )}

          {/* ================= STATUS FILTER ================= */}
          <View style={styles.filterSection}>
            <Text style={styles.sectionLabel}>Filter by Status</Text>
            <View style={styles.statusButtonsRow}>
              {STATUS_OPTIONS.map(opt => {
                const isSel = selectedStatus === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[
                      styles.statusFilterBtn,
                      isSel && styles.statusFilterBtnActive,
                      isSel && opt.key === 'active' && styles.statusFilterBtnActiveRed,
                    ]}
                    onPress={() => setSelectedStatus(opt.key)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.statusFilterText, isSel && styles.statusFilterTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* ================= RECORDS FOUND & EXPORT BAR ================= */}
          <View style={styles.exportBar}>
            <View style={styles.exportBarInfo}>
              <Text style={styles.exportBarCount}>
                {loadingRecords ? 'Searching...' : `${totalRecordsFound} SOS Events`}
              </Text>
              <Text style={styles.exportBarLabel}>
                {recordsData?.reportMeta?.formattedPeriodLabel || 'Matching period criteria'}
              </Text>
            </View>

            <TouchableOpacity
              style={[
                styles.downloadPdfButton,
                (isExportingPdf || loadingRecords || totalRecordsFound === 0) && styles.downloadPdfButtonDisabled,
              ]}
              disabled={isExportingPdf || loadingRecords || totalRecordsFound === 0}
              onPress={handleDownloadPdf}
              activeOpacity={0.8}
            >
              {isExportingPdf ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.downloadPdfButtonText}>Download PDF</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* ================= RECORD CARDS PREVIEW ================= */}
          <Text style={styles.previewSectionTitle}>SOS Records Preview</Text>

          {loadingRecords ? (
            <View style={styles.centerLoading}>
              <ActivityIndicator size="large" color="#E4002B" />
              <Text style={styles.centerLoadingText}>Retrieving records from server...</Text>
            </View>
          ) : fetchError ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{fetchError}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={fetchReportData}>
                <Text style={styles.retryBtnText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : totalRecordsFound === 0 ? (
            <View style={styles.emptyStateContainer}>
              <View style={styles.emptyIconCircle}>
                <Text style={styles.emptyIconText}>📋</Text>
              </View>
              <Text style={styles.emptyTitle}>No SOS Records Found</Text>
              <Text style={styles.emptySub}>
                No SOS events match the selected period, dates, or status filter.
              </Text>
            </View>
          ) : (
            recordsData.records.map((rec, index) => {
              const isActive = rec.status === 'active';
              const isResolved = rec.status === 'deactivated' || rec.status === 'resolved';

              return (
                <TouchableOpacity
                  key={rec.id || `rec-${index}`}
                  style={[styles.previewCard, isActive && styles.previewCardActive]}
                  onPress={() => onSosDetail?.(rec)}
                  activeOpacity={0.85}
                >
                  <View style={styles.previewCardHeader}>
                    <View style={styles.previewCardUser}>
                      <View style={[styles.avatarCircle, { backgroundColor: isActive ? '#E4002B' : '#178A4B' }]}>
                        <Text style={styles.avatarText}>
                          {(rec.user?.name || 'U').slice(0, 2).toUpperCase()}
                        </Text>
                      </View>
                      <View>
                        <Text style={styles.previewUserName}>{rec.user?.name || 'User'}</Text>
                        <Text style={styles.previewUserPhone}>{rec.user?.mobileNumber || 'Phone unavailable'}</Text>
                      </View>
                    </View>

                    <View style={[styles.previewStatusBadge, isActive ? styles.badgeActive : isResolved ? styles.badgeResolved : styles.badgeCancelled]}>
                      <Text style={[styles.previewStatusText, isActive ? styles.badgeActiveText : isResolved ? styles.badgeResolvedText : styles.badgeCancelledText]}>
                        {rec.statusLabel || rec.status?.toUpperCase()}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.previewMsg} numberOfLines={2}>
                    "{rec.emergencyMessage}"
                  </Text>

                  <View style={styles.previewFooter}>
                    <Text style={styles.previewLocation} numberOfLines={1}>
                      📍 {rec.location?.coordinatesText || 'No location'}
                    </Text>
                    <Text style={styles.previewTime}>{rec.timeFormatted || rec.dateFormatted}</Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}

          <View style={styles.bottomSpace} />
        </ScrollView>

        {/* ================= PDF EXPORT SUCCESS MODAL ================= */}
        <Modal
          visible={exportSuccessModal.visible}
          transparent
          animationType="fade"
          onRequestClose={() => setExportSuccessModal({ ...exportSuccessModal, visible: false })}
        >
          <View style={styles.successOverlay}>
            <View style={styles.successCard}>
              <View style={styles.successIconCircle}>
                <Text style={styles.successCheck}>✓</Text>
              </View>
              <Text style={styles.successTitle}>PDF Report Ready</Text>
              <Text style={styles.successSub}>
                Your SOS report was successfully generated and saved to device Downloads:
              </Text>
              <View style={styles.filenameBox}>
                <Text style={styles.filenameText} numberOfLines={2}>
                  {exportSuccessModal.fileName}
                </Text>
              </View>

              <View style={styles.successActions}>
                <TouchableOpacity
                  style={styles.openPdfBtn}
                  onPress={handleOpenPdf}
                  activeOpacity={0.8}
                >
                  <Text style={styles.openPdfBtnText}>Open PDF</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.sharePdfBtn}
                  onPress={handleSharePdf}
                  activeOpacity={0.8}
                >
                  <Text style={styles.sharePdfBtnText}>Share PDF</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.doneBtn}
                onPress={() => setExportSuccessModal({ ...exportSuccessModal, visible: false })}
                activeOpacity={0.7}
              >
                <Text style={styles.doneBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIcon: {
    fontSize: 24,
    lineHeight: 26,
    color: '#334155',
    fontWeight: '300',
  },
  headerTitleWrap: {
    flex: 1,
    marginLeft: 12,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  refreshButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFF0F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  periodTabs: {
    flexDirection: 'row',
    backgroundColor: '#E5E7EB',
    borderRadius: 8,
    padding: 3,
    marginBottom: 14,
  },
  periodTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  periodTabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  periodTabText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4B5563',
  },
  periodTabTextActive: {
    color: '#E4002B',
    fontWeight: '700',
  },

  /* Calendar Card */
  calendarCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
    marginBottom: 14,
  },
  calendarNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  navArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navArrowText: {
    fontSize: 20,
    lineHeight: 22,
    color: '#1F2937',
    fontWeight: '600',
  },
  calendarMonthText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayColHeader: {
    width: '14.28%',
    alignItems: 'center',
    paddingVertical: 4,
  },
  dayColHeaderText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  dayCellEmpty: {
    width: '14.28%',
    height: 34,
  },
  dayCell: {
    width: '14.28%',
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    marginVertical: 1,
  },
  dayCellSelected: {
    backgroundColor: '#E4002B',
  },
  dayCellToday: {
    borderWidth: 1,
    borderColor: '#E4002B',
  },
  dayCellText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#1F2937',
  },
  dayCellTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  dayCellTextToday: {
    color: '#E4002B',
    fontWeight: '700',
  },
  periodSummaryRow: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    alignItems: 'center',
  },
  summaryInfoText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4B5563',
  },

  /* Custom Date Pickers */
  customDatePickersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  customDateBtn: {
    flex: 1,
    padding: 8,
    backgroundColor: '#F9FAFB',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  customDateBtnActive: {
    borderColor: '#E4002B',
    backgroundColor: '#FFF0F2',
  },
  customDateLabel: {
    fontSize: 9,
    color: '#6B7280',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  customDateVal: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
    marginTop: 2,
  },
  customDateArrow: {
    paddingHorizontal: 8,
    fontSize: 16,
    color: '#9CA3AF',
  },

  /* Monthly / Yearly Grid */
  monthsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
    marginTop: 6,
  },
  monthPill: {
    width: '31%',
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
  },
  monthPillActive: {
    backgroundColor: '#E4002B',
  },
  monthPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  monthPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  yearsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  yearPill: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
  },
  yearPillActive: {
    backgroundColor: '#E4002B',
  },
  yearPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  yearPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  /* Filter Section */
  filterSection: {
    marginBottom: 14,
  },
  dropdownSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  dropdownSelectorText: {
    fontSize: 13,
    color: '#111827',
    fontWeight: '500',
  },
  dropdownArrow: {
    fontSize: 12,
    color: '#6B7280',
  },
  dropdownMenu: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginTop: 4,
    padding: 8,
  },
  userSearchInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    color: '#111827',
    marginBottom: 6,
  },
  usersDropdownScroll: {
    maxHeight: 180,
  },
  userItem: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  userItemActive: {
    backgroundColor: '#FFF0F2',
    borderRadius: 4,
  },
  userItemText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1F2937',
  },
  userItemTextActive: {
    color: '#E4002B',
  },
  userItemSub: {
    fontSize: 10,
    color: '#6B7280',
    marginTop: 1,
  },

  /* Status Buttons */
  statusButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statusFilterBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 6,
  },
  statusFilterBtnActive: {
    borderColor: '#178A4B',
    backgroundColor: '#ECFDF5',
  },
  statusFilterBtnActiveRed: {
    borderColor: '#E4002B',
    backgroundColor: '#FFF0F2',
  },
  statusFilterText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4B5563',
  },
  statusFilterTextActive: {
    color: '#111827',
    fontWeight: '700',
  },

  /* Export Action Bar */
  exportBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  exportBarInfo: {
    flex: 1,
    marginRight: 10,
  },
  exportBarCount: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
  },
  exportBarLabel: {
    fontSize: 10,
    color: '#6B7280',
    marginTop: 2,
  },
  downloadPdfButton: {
    backgroundColor: '#E4002B',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 120,
  },
  downloadPdfButtonDisabled: {
    backgroundColor: '#FCA5A5',
  },
  downloadPdfButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  /* Preview Section */
  previewSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  previewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
    marginBottom: 10,
  },
  previewCardActive: {
    borderColor: '#E4002B',
    borderLeftWidth: 4,
  },
  previewCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  previewCardUser: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  avatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  previewUserName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  previewUserPhone: {
    fontSize: 10,
    color: '#6B7280',
  },
  previewStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  badgeActive: { backgroundColor: '#FEE2E2' },
  badgeResolved: { backgroundColor: '#DCFCE7' },
  badgeCancelled: { backgroundColor: '#FEF3C7' },
  previewStatusText: { fontSize: 9, fontWeight: '700' },
  badgeActiveText: { color: '#B91C1C' },
  badgeResolvedText: { color: '#15803D' },
  badgeCancelledText: { color: '#B45309' },
  previewMsg: {
    fontSize: 11,
    color: '#374151',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  previewFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 6,
  },
  previewLocation: {
    fontSize: 10,
    color: '#6B7280',
    flex: 1,
    marginRight: 8,
  },
  previewTime: {
    fontSize: 10,
    color: '#9CA3AF',
  },

  /* Empty / Error States */
  centerLoading: {
    padding: 30,
    alignItems: 'center',
  },
  centerLoadingText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 8,
  },
  errorBox: {
    padding: 16,
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 12,
    color: '#991B1B',
    textAlign: 'center',
    marginBottom: 8,
  },
  retryBtn: {
    backgroundColor: '#991B1B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  emptyStateContainer: {
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  emptyIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  emptyIconText: {
    fontSize: 22,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  emptySub: {
    fontSize: 11,
    color: '#6B7280',
    textAlign: 'center',
  },
  bottomSpace: {
    height: 40,
  },

  /* Success Dialog */
  successOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  successCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 20,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  successIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  successCheck: {
    fontSize: 26,
    color: '#15803D',
    fontWeight: '800',
  },
  successTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
  },
  successSub: {
    fontSize: 12,
    color: '#4B5563',
    textAlign: 'center',
    marginBottom: 10,
  },
  filenameBox: {
    backgroundColor: '#F3F4F6',
    padding: 8,
    borderRadius: 6,
    width: '100%',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  filenameText: {
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier',
    fontSize: 11,
    color: '#1F2937',
    textAlign: 'center',
  },
  successActions: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
    marginBottom: 10,
  },
  openPdfBtn: {
    flex: 1,
    backgroundColor: '#178A4B',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  openPdfBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  sharePdfBtn: {
    flex: 1,
    backgroundColor: '#2563EB',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  sharePdfBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  doneBtn: {
    paddingVertical: 8,
  },
  doneBtnText: {
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '600',
  },
});

