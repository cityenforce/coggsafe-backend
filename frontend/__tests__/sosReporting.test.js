// sosReporting.test.js
import { buildReportFilename } from '../src/services/pdf/pdfExportService';
import { generateSosReportHtml } from '../src/services/pdf/sosPdfTemplate';

describe('SOS Reporting & PDF Export Unit Tests', () => {
  describe('buildReportFilename', () => {
    it('generates standard daily report filename for admin', () => {
      const filename = buildReportFilename({
        period: 'daily',
        role: 'admin',
        startDateFormatted: '2026-11-08',
        endDateFormatted: '2026-11-08',
      });
      expect(filename).toBe('CoGGSafe_Admin_Daily_Report_2026-11-08');
    });

    it('generates standard weekly report filename for admin', () => {
      const filename = buildReportFilename({
        period: 'weekly',
        role: 'admin',
        startDateFormatted: '2026-11-02',
        endDateFormatted: '2026-11-08',
      });
      expect(filename).toBe('CoGGSafe_Admin_Weekly_Report_2026-11-02_to_2026-11-08');
    });

    it('generates standard monthly report filename for admin', () => {
      const filename = buildReportFilename({
        period: 'monthly',
        role: 'admin',
        startDateFormatted: '2026-11-01',
        endDateFormatted: '2026-11-30',
      });
      expect(filename).toBe('CoGGSafe_Admin_Monthly_Report_2026-11');
    });

    it('generates standard yearly report filename for admin', () => {
      const filename = buildReportFilename({
        period: 'yearly',
        role: 'admin',
        startDateFormatted: '2026-01-01',
        endDateFormatted: '2026-12-31',
      });
      expect(filename).toBe('CoGGSafe_Admin_Yearly_Report_2026');
    });

    it('generates user-specific report filename for user', () => {
      const filename = buildReportFilename({
        period: 'daily',
        role: 'user',
        startDateFormatted: '2026-11-08',
        endDateFormatted: '2026-11-08',
      });
      expect(filename).toBe('CoGGSafe_User_Daily_Report_2026-11-08');
    });

    it('falls back to dateRange when startDateFormatted is omitted', () => {
      const filename = buildReportFilename({
        period: 'monthly',
        role: 'admin',
        dateRange: { start: '2026-11-01', end: '2026-11-30' },
      });
      expect(filename).toBe('CoGGSafe_Admin_Monthly_Report_2026-11');
    });
  });

  describe('generateSosReportHtml', () => {
    it('renders branded header with official logo and CoGG Safe title', () => {
      const html = generateSosReportHtml({
        reportMeta: {
          period: 'daily',
          formattedPeriodLabel: 'Daily Report (2026-11-08)',
          generatedBy: { username: 'Admin Chief', role: 'admin' },
        },
        records: [],
      });

      expect(html).toContain('CoGG <span>SAFE</span>');
      expect(html).toContain('DAILY SOS REPORT');
      expect(html).toContain('data:image/png;base64');
      expect(html).toContain('Admin Chief');
      expect(html).toContain('No SOS Emergency Events Found');
    });

    it('renders individual SOS report cards with full telemetry, location, and media', () => {
      const mockRecord = {
        id: 'SOS-999',
        status: 'active',
        dateFormatted: '11/8/2026',
        timeFormatted: '10:30:00 AM',
        duration: '15m 22s',
        emergencyMessage: 'Need medical assistance on Site B',
        user: {
          name: 'Jane Doe',
          id: 'USR-101',
          mobileNumber: '+15551234567',
          email: 'jane@example.com',
          groupName: 'Field Operatives',
          groupType: 'employees',
        },
        location: {
          coordinatesText: '37.774900, -122.419400',
          accuracy: '4.5m',
          capturedAt: '2026-11-08T10:30:00.000Z',
          source: 'GPS',
          latitude: 37.7749,
          longitude: -122.4194,
        },
        media: {
          frontImage: { available: true },
          backImage: { available: false },
          audio: { available: true },
        },
        channels: {
          sms: 'success',
          call: 'success',
          email: 'success',
          push: 'success',
        },
      };

      const html = generateSosReportHtml({
        reportMeta: {
          period: 'weekly',
          formattedPeriodLabel: 'Weekly Report (2026-11-02 to 2026-11-08)',
          generatedBy: { username: 'Super Admin', role: 'admin' },
        },
        records: [mockRecord],
      });

      expect(html).toContain('Jane Doe');
      expect(html).toContain('USR-101');
      expect(html).toContain('+15551234567');
      expect(html).toContain('Need medical assistance on Site B');
      expect(html).toContain('37.774900, -122.419400');
      expect(html).toContain('ACTIVE');
      expect(html).toContain('Front Photo: <strong>Captured</strong>');
      expect(html).toContain('Back Photo: <strong>Not Available</strong>');
      expect(html).toContain('Audio Recording: <strong>Captured (5s Audio)</strong>');
      expect(html).toContain('SMS Alerts: <strong>success</strong>');
    });
  });
});

