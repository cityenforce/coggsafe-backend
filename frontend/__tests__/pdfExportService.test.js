jest.mock('react-native-html-to-pdf', () => ({
  generatePDF: jest.fn().mockResolvedValue({
    filePath: '/cache/report.pdf',
    numberOfPages: 1,
  }),
}));

const { NativeModules, Platform } = require('react-native');
const originalPlatformOS = Platform.OS;
const originalEmergencyMedia = NativeModules.EmergencyMedia;

describe('exportSosReportToPdf Android notifications', () => {
  let emergencyMedia;
  let exportSosReportToPdf;

  beforeEach(() => {
    emergencyMedia = {
      savePdfToDownloads: jest.fn().mockResolvedValue('/storage/emulated/0/Download/report.pdf'),
      showPdfDownloadedNotification: jest.fn().mockResolvedValue(true),
    };
    NativeModules.EmergencyMedia = emergencyMedia;
    Platform.OS = 'android';
    ({ exportSosReportToPdf } = require('../src/services/pdf/pdfExportService'));
  });

  afterEach(() => {
    Platform.OS = originalPlatformOS;
    NativeModules.EmergencyMedia = originalEmergencyMedia;
  });

  it('does not replace the MediaStore notification posted while saving the PDF', async () => {
    const result = await exportSosReportToPdf({
      reportMeta: { period: 'daily' },
      records: [],
    });

    expect(emergencyMedia.savePdfToDownloads).toHaveBeenCalledWith(
      '/cache/report.pdf',
      'CoGGSafe_Admin_Daily_Report_today.pdf'
    );
    expect(emergencyMedia.showPdfDownloadedNotification).not.toHaveBeenCalled();
    expect(result.filePath).toBe('/storage/emulated/0/Download/report.pdf');
  });
});
