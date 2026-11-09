const {
  formatDateOnly,
  getStartOfDay,
  getEndOfDay,
  getWeekRange,
  getMonthRange,
  getYearRange,
  resolveReportDateRange,
} = require('../src/modules/sos/reportDate.util');

describe('reportDate.util', () => {
  it('correctly calculates start and end of day', () => {
    const d = new Date(2026, 10, 8, 14, 30, 0); // Nov 8, 2026
    const start = getStartOfDay(d);
    const end = getEndOfDay(d);

    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
    expect(start.getMilliseconds()).toBe(0);

    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(end.getSeconds()).toBe(59);
    expect(end.getMilliseconds()).toBe(999);
  });

  it('correctly calculates week range (Monday to Sunday)', () => {
    // Nov 8, 2026 is a Sunday
    const sunday = new Date(2026, 10, 8);
    const { start, end } = getWeekRange(sunday);

    expect(formatDateOnly(start)).toBe('2026-11-02'); // Monday
    expect(formatDateOnly(end)).toBe('2026-11-08'); // Sunday
    expect(start.getDay()).toBe(1); // Monday
    expect(end.getDay()).toBe(0); // Sunday
  });

  it('correctly calculates month range', () => {
    const { start, end } = getMonthRange(2026, 11); // Nov 2026
    expect(formatDateOnly(start)).toBe('2026-11-01');
    expect(formatDateOnly(end)).toBe('2026-11-30');
  });

  it('correctly calculates year range', () => {
    const { start, end } = getYearRange(2026);
    expect(formatDateOnly(start)).toBe('2026-01-01');
    expect(formatDateOnly(end)).toBe('2026-12-31');
  });

  it('resolves daily period correctly', () => {
    const res = resolveReportDateRange({ period: 'daily', date: '2026-11-08' });
    expect(res.period).toBe('daily');
    expect(res.startDateFormatted).toBe('2026-11-08');
    expect(res.endDateFormatted).toBe('2026-11-08');
    expect(res.filenameSuffix).toBe('Daily_Report_2026-11-08');
  });

  it('resolves weekly period correctly', () => {
    const res = resolveReportDateRange({ period: 'weekly', date: '2026-11-08' });
    expect(res.period).toBe('weekly');
    expect(res.startDateFormatted).toBe('2026-11-02');
    expect(res.endDateFormatted).toBe('2026-11-08');
    expect(res.filenameSuffix).toBe('Weekly_Report_2026-11-02_to_2026-11-08');
  });

  it('resolves monthly period correctly', () => {
    const res = resolveReportDateRange({ period: 'monthly', year: 2026, month: 11 });
    expect(res.period).toBe('monthly');
    expect(res.startDateFormatted).toBe('2026-11-01');
    expect(res.endDateFormatted).toBe('2026-11-30');
    expect(res.filenameSuffix).toBe('Monthly_Report_2026-11');
  });

  it('resolves yearly period correctly', () => {
    const res = resolveReportDateRange({ period: 'yearly', year: 2026 });
    expect(res.period).toBe('yearly');
    expect(res.startDateFormatted).toBe('2026-01-01');
    expect(res.endDateFormatted).toBe('2026-12-31');
    expect(res.filenameSuffix).toBe('Yearly_Report_2026');
  });

  it('resolves custom range correctly', () => {
    const res = resolveReportDateRange({ period: 'custom', startDate: '2026-11-01', endDate: '2026-11-08' });
    expect(res.startDateFormatted).toBe('2026-11-01');
    expect(res.endDateFormatted).toBe('2026-11-08');
  });
});

