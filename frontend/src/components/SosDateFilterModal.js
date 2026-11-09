// SosDateFilterModal.js
// Date Filtering Modal for Admin and User SOS screens.

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Platform,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

export default function SosDateFilterModal({
  visible,
  onClose,
  selectedDate,
  onApplyDate,
}) {
  let insets = { top: 0, bottom: 0, left: 0, right: 0 };
  try {
    insets = useSafeAreaInsets();
  } catch (_) {}
  const todayStr = formatDateStr(new Date());

  const initialDate = selectedDate ? new Date(selectedDate) : new Date();
  const [calendarYear, setCalendarYear] = useState(() => initialDate.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(() => initialDate.getMonth());
  const [tempSelectedDate, setTempSelectedDate] = useState(() => selectedDate || todayStr);

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

  const calendarDays = React.useMemo(() => {
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const firstDay = new Date(calendarYear, calendarMonth, 1).getDay();
    // Monday-first index: Sunday (0) -> 6, Monday (1) -> 0
    const startOffset = (firstDay + 6) % 7;

    const days = [];
    for (let i = 0; i < startOffset; i++) {
      days.push({ key: `empty-${i}`, empty: true });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${calendarYear}-${padZero(calendarMonth + 1)}-${padZero(d)}`;
      days.push({
        key: `day-${d}`,
        empty: false,
        dayNumber: d,
        dateStr,
      });
    }

    return days;
  }, [calendarYear, calendarMonth]);

  const handleApply = () => {
    onApplyDate(tempSelectedDate);
    onClose();
  };

  const handleClear = () => {
    onApplyDate(null);
    onClose();
  };

  const handleQuickSelect = (type) => {
    const d = new Date();
    if (type === 'yesterday') {
      d.setDate(d.getDate() - 1);
    }
    const dStr = formatDateStr(d);
    setCalendarYear(d.getFullYear());
    setCalendarMonth(d.getMonth());
    setTempSelectedDate(dStr);
  };

  const topInset = Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 0);
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 24 : 12);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      statusBarTranslucent={false}
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingTop: topInset, paddingBottom: bottomInset }]}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" translucent={false} />

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
            <Text style={styles.closeBtnText}>×</Text>
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>Filter Alerts by Date</Text>
            <Text style={styles.headerSubtitle}>Show SOS events for a specific day</Text>
          </View>
          {selectedDate ? (
            <TouchableOpacity style={styles.clearHeaderBtn} onPress={handleClear} activeOpacity={0.7}>
              <Text style={styles.clearHeaderBtnText}>Show All</Text>
            </TouchableOpacity>
          ) : <View style={{ width: 40 }} />}
        </View>

        {/* Quick options */}
        <View style={styles.quickOptionsRow}>
          <TouchableOpacity
            style={[styles.quickChip, !tempSelectedDate && styles.quickChipActive]}
            onPress={() => setTempSelectedDate(null)}
            activeOpacity={0.7}>
            <Text style={[styles.quickChipText, !tempSelectedDate && styles.quickChipTextActive]}>
              All Dates
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.quickChip, tempSelectedDate === todayStr && styles.quickChipActive]}
            onPress={() => handleQuickSelect('today')}
            activeOpacity={0.7}>
            <Text style={[styles.quickChipText, tempSelectedDate === todayStr && styles.quickChipTextActive]}>
              Today
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickChip}
            onPress={() => handleQuickSelect('yesterday')}
            activeOpacity={0.7}>
            <Text style={styles.quickChipText}>
              Yesterday
            </Text>
          </TouchableOpacity>
        </View>

        {/* Calendar Card */}
        <View style={styles.calendarCard}>
          <View style={styles.calendarNav}>
            <TouchableOpacity style={styles.navArrow} onPress={prevMonth} activeOpacity={0.7}>
              <Text style={styles.navArrowText}>‹</Text>
            </TouchableOpacity>
            <Text style={styles.calendarMonthText}>
              {MONTH_NAMES[calendarMonth]} {calendarYear}
            </Text>
            <TouchableOpacity style={styles.navArrow} onPress={nextMonth} activeOpacity={0.7}>
              <Text style={styles.navArrowText}>›</Text>
            </TouchableOpacity>
          </View>

          {/* Day of week headers */}
          <View style={styles.calendarGrid}>
            {DAYS_SHORT.map((d, i) => (
              <View key={`day-${i}`} style={styles.dayColHeader}>
                <Text style={styles.dayColHeaderText}>{d}</Text>
              </View>
            ))}

            {/* Days cells */}
            {calendarDays.map((cell) => {
              if (cell.empty) {
                return <View key={cell.key} style={styles.dayCellEmpty} />;
              }

              const isSelected = tempSelectedDate === cell.dateStr;
              const isToday = cell.dateStr === todayStr;

              return (
                <TouchableOpacity
                  key={cell.key}
                  style={[
                    styles.dayCell,
                    isSelected && styles.dayCellSelected,
                    isToday && !isSelected && styles.dayCellToday,
                  ]}
                  onPress={() => setTempSelectedDate(cell.dateStr)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.dayCellText,
                      isSelected && styles.dayCellTextSelected,
                      isToday && !isSelected && styles.dayCellTextToday,
                    ]}
                  >
                    {cell.dayNumber}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {tempSelectedDate ? (
            <View style={styles.selectedDateBanner}>
              <Text style={styles.selectedDateBannerText}>
                Selected: <Text style={styles.selectedDateBannerBold}>{tempSelectedDate}</Text>
              </Text>
            </View>
          ) : (
            <View style={styles.selectedDateBanner}>
              <Text style={styles.selectedDateBannerText}>
                Showing <Text style={styles.selectedDateBannerBold}>All SOS Records</Text>
              </Text>
            </View>
          )}
        </View>

        {/* Actions */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.clearBtn}
            onPress={handleClear}
            activeOpacity={0.7}
          >
            <Text style={styles.clearBtnText}>Show All Dates</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.applyBtn}
            onPress={handleApply}
            activeOpacity={0.8}
          >
            <Text style={styles.applyBtnText}>Apply Filter</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    marginHorizontal: -16,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
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
    marginTop: 2,
  },
  clearHeaderBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
  },
  clearHeaderBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#E4002B',
  },
  quickOptionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  quickChip: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
  },
  quickChipActive: {
    borderColor: '#E4002B',
    backgroundColor: '#FFF0F2',
  },
  quickChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  quickChipTextActive: {
    color: '#E4002B',
    fontWeight: '700',
  },
  calendarCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  calendarNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  navArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navArrowText: {
    fontSize: 20,
    lineHeight: 22,
    color: '#334155',
    fontWeight: '600',
  },
  calendarMonthText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayColHeader: {
    width: '14.28%',
    alignItems: 'center',
    paddingVertical: 6,
  },
  dayColHeaderText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
  },
  dayCellEmpty: {
    width: '14.28%',
    height: 38,
  },
  dayCell: {
    width: '14.28%',
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    marginVertical: 2,
  },
  dayCellSelected: {
    backgroundColor: '#E4002B',
  },
  dayCellToday: {
    borderWidth: 1,
    borderColor: '#E4002B',
  },
  dayCellText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1E293B',
  },
  dayCellTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  dayCellTextToday: {
    color: '#E4002B',
    fontWeight: '700',
  },
  selectedDateBanner: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    alignItems: 'center',
  },
  selectedDateBannerText: {
    fontSize: 12,
    color: '#64748B',
  },
  selectedDateBannerBold: {
    fontWeight: '700',
    color: '#0F172A',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  clearBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  clearBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  applyBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#E4002B',
  },
  applyBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
