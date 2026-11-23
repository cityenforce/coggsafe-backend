// sosReporting.test.js
import { buildReportFilename } from '../src/services/pdf/pdfExportService';
import { generateSosReportHtml } from '../src/services/pdf/sosPdfTemplate';
import { normalizeAndEnrichRecord } from '../src/components/SosReportModal';

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

  describe('normalizeAndEnrichRecord', () => {
    it('accurately resolves dates, group metadata, dual locations and relay statuses', () => {
      const rawSos = {
        _id: 'sos_12345',
        status: 'active',
        createdAt: '2026-11-09T10:15:00.000Z',
        emergencyMessage: 'Need backup at warehouse gate 3',
        collectionId: 'col_999',
        userId: {
          _id: 'usr_abc',
          username: 'Waqas Worker',
          mobileNumber: '+61400845579',
          email: 'waqas@example.com',
        },
        location: {
          latitude: -37.813628,
          longitude: 144.963058,
          accuracy: 5.2,
          source: 'GPS Sensor',
        },
        liveLocation: {
          status: 'active',
          lastLocation: {
            latitude: -37.814000,
            longitude: 144.964000,
            accuracy: 4.1,
            capturedAt: '2026-11-09T10:20:00.000Z',
          },
        },
        components: {
          sms: { status: 'success' },
          email: { status: 'success' },
          frontImage: { status: 'success', storageRef: 'sos/123/front.jpg' },
        },
      };

      const collectionsMap = {
        col_999: {
          name: 'Dock Security Team',
          type: 'Workers',
          emergencyCallNumber: '+611800999888',
          userCount: 14,
        },
      };

      const enriched = normalizeAndEnrichRecord(rawSos, collectionsMap);

      expect(enriched.id).toBe('sos_12345');
      expect(enriched.dateFormatted).not.toBe('Not Available');
      expect(enriched.timeFormatted).not.toBe('Not Available');
      expect(enriched.duration).toContain('(Active / Ongoing)');
      expect(enriched.user.groupName).toBe('Dock Security Team');
      expect(enriched.user.emergencyCallNumber).toBe('+611800999888');
      expect(enriched.user.totalGroupMembers).toBe(14);
      expect(enriched.location.coordinatesText).toBe('-37.813628, 144.963058');
      expect(enriched.location.mapsUrl).toContain('maps.google.com');
      expect(enriched.liveLocation.isSameAsInitial).toBe(false);
      expect(enriched.liveLocation.coordinatesText).toBe('-37.814000, 144.964000');
      expect(enriched.liveLocation.mapsUrl).toContain('-37.814,144.964');
      expect(enriched.channels.sms).toBe('success');
      expect(enriched.channels.email).toBe('success');
      expect(enriched.media.frontImage.available).toBe(true);
    });
  });

  describe('generateSosReportHtml', () => {
    it('renders branded header with official logo, admin name and CoGG Safe title', () => {
      const html = generateSosReportHtml({
        reportMeta: {
          period: 'daily',
          formattedPeriodLabel: 'Daily Report (2026-11-08)',
          generatedBy: { name: 'Waqas Bashir', username: 'Waqas Bashir', role: 'admin', id: 'ADM-789' },
        },
        records: [],
      });

      expect(html).toContain('CoGG Safe');
      expect(html).toContain('DAILY SOS REPORT');
      expect(html).toContain('data:image/png;base64');
      expect(html).toContain('Waqas Bashir');
      expect(html).toContain('ADM-789');
      expect(html).toContain('ADMIN');
      expect(html).toContain('No SOS Emergency Events Found');
    });

    it('renders individual SOS report cards with group emergency call, dual location, and media', () => {
      const mockRecord = {
        id: 'SOS-999',
        status: 'active',
        dateFormatted: 'Nov 8, 2026',
        timeFormatted: '10:30:00 AM',
        duration: '15m 22s',
        emergencyMessage: 'Need medical assistance on Site B',
        user: {
          name: 'Jane Doe',
          id: 'USR-101',
          mobileNumber: '+15551234567',
          email: 'jane@example.com',
          groupName: 'Field Operatives',
          groupType: 'Workers',
          emergencyCallNumber: '+611800112233',
          totalGroupMembers: '18 registered users',
        },
        location: {
          coordinatesText: '37.774900, -122.419400',
          accuracy: '4.5m',
          capturedAt: '2026-11-08T10:30:00.000Z',
          source: 'GPS',
          latitude: 37.7749,
          longitude: -122.4194,
          mapsUrl: 'https://maps.google.com/?q=37.7749,-122.4194',
        },
        liveLocation: {
          status: 'active',
          latitude: 37.7755,
          longitude: -122.4201,
          accuracy: '3.8m',
          coordinatesText: '37.775500, -122.420100',
          mapsUrl: 'https://maps.google.com/?q=37.7755,-122.4201',
          isSameAsInitial: false,
        },
        media: {
          frontImage: { available: true, url: 'https://cdn.coggsafe.com/front.jpg' },
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
          generatedBy: { name: 'Admin Chief', username: 'Admin Chief', role: 'admin', id: 'ADM-001' },
        },
        records: [mockRecord],
      });

      expect(html).toContain('Jane Doe');
      expect(html).toContain('USR-101');
      expect(html).toContain('+15551234567');
      expect(html).toContain('+611800112233'); // Emergency Call Number
      expect(html).toContain('18 registered users'); // Total group users
      expect(html).toContain('Need medical assistance on Site B');
      expect(html).toContain('INITIAL TRIGGER LOCATION');
      expect(html).toContain('LATEST / LAST LOCATION');
      expect(html).toContain('View Initial Location on Google Maps');
      expect(html).toContain('View Latest Live Location on Google Maps');
      expect(html).toContain('37.774900, -122.419400');
      expect(html).toContain('37.775500, -122.420100');
      expect(html).toContain('ACTIVE');
      expect(html).toContain('Front Camera:');
      expect(html).toContain('evidence-img'); // thumbnail image
      expect(html).toContain('Back Camera:');
      expect(html).toContain('Not Captured');
      expect(html).toContain('Audio Recording:');
      expect(html).toContain('SUCCESS (Delivered)');
      expect(html).toContain('Admin Chief');
    });
  });
});

