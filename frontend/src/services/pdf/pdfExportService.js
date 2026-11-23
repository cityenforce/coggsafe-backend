// pdfExportService.js
// Handles PDF creation, persistent storage in Android Downloads, opening, and sharing.

import { NativeModules, Platform } from 'react-native';
import RNFS from 'react-native-fs';
import { generateSosReportHtml } from './sosPdfTemplate';

// Native module from EmergencyMediaModule.kt (registered as EmergencyMedia)
const EmergencyMedia = NativeModules.EmergencyMedia || NativeModules.EmergencyMediaModule;

let isExporting = false;

/**
 * Derives a clean, readable filename according to CoGG Safe specifications.
 */
export function buildReportFilename({ period, role, startDateFormatted, endDateFormatted, filenameSuffix, dateRange }) {
  const prefix = role === 'admin' ? 'CoGGSafe_Admin' : 'CoGGSafe_User';

  if (filenameSuffix) {
    return `${prefix}_${filenameSuffix}`;
  }

  const start = startDateFormatted || dateRange?.start || '';
  const end = endDateFormatted || dateRange?.end || '';

  const p = (period || 'custom').toLowerCase();
  switch (p) {
    case 'daily':
      return `${prefix}_Daily_Report_${start || 'today'}`;
    case 'weekly':
      return `${prefix}_Weekly_Report_${start}_to_${end}`;
    case 'monthly':
      return `${prefix}_Monthly_Report_${start ? start.slice(0, 7) : 'month'}`;
    case 'yearly':
      return `${prefix}_Yearly_Report_${start ? start.slice(0, 4) : 'year'}`;
    default:
      return `${prefix}_Report_${start || 'custom'}_to_${end || 'custom'}`;
  }
}

/**
 * Converts HTML to PDF and saves it into the device's accessible Downloads storage.
 *
 * @param {Object} reportData { reportMeta, records }
 * @returns {Promise<{ filePath: string, fileName: string, totalPages: number }>}
 */
export async function exportSosReportToPdf(reportData) {
  if (isExporting) {
    throw new Error('A report is already being generated. Please wait.');
  }

  isExporting = true;

  try {
    const meta = reportData?.reportMeta || {};
    const records = reportData?.records || [];

    // 1. Generate structured HTML with CSS styling and branding
    const htmlContent = generateSosReportHtml({ reportMeta: meta, records });

    // 2. Build standard filename
    const baseName = buildReportFilename({
      period: meta.period,
      role: meta.generatedBy?.role || 'admin',
      startDateFormatted: meta.startDateFormatted,
      endDateFormatted: meta.endDateFormatted,
      dateRange: meta.dateRange,
      filenameSuffix: meta.filenameSuffix,
    });

    const fileNameWithExt = `${baseName}.pdf`;

    // 3. Resolve PDF converter function
    // react-native-html-to-pdf v1.3.0 exports generatePDF(options), while older versions export convert(options)
    let pdfConvertFn = null;

    try {
      const htmlToPdfLib = require('react-native-html-to-pdf');
      if (typeof htmlToPdfLib.generatePDF === 'function') {
        pdfConvertFn = htmlToPdfLib.generatePDF;
      } else if (typeof htmlToPdfLib.convert === 'function') {
        pdfConvertFn = htmlToPdfLib.convert;
      } else if (htmlToPdfLib.default && typeof htmlToPdfLib.default.generatePDF === 'function') {
        pdfConvertFn = htmlToPdfLib.default.generatePDF;
      } else if (htmlToPdfLib.default && typeof htmlToPdfLib.default.convert === 'function') {
        pdfConvertFn = htmlToPdfLib.default.convert;
      }
    } catch (_) {}

    if (!pdfConvertFn) {
      const nativeModule = NativeModules.HtmlToPdf || NativeModules.RNHTMLtoPDF;
      if (nativeModule && typeof nativeModule.convert === 'function') {
        pdfConvertFn = (opts) => nativeModule.convert(opts);
      }
    }

    if (!pdfConvertFn) {
      try {
        const { TurboModuleRegistry } = require('react-native');
        const turbo = TurboModuleRegistry.get('HtmlToPdf');
        if (turbo && typeof turbo.convert === 'function') {
          pdfConvertFn = (opts) => turbo.convert(opts);
        }
      } catch (_) {}
    }

    if (!pdfConvertFn) {
      throw new Error('PDF generator is not available on this platform. Please rebuild the app.');
    }

    const options = {
      html: htmlContent,
      fileName: baseName,
      directory: 'Documents',
      base64: false,
    };

    const pdfResult = await pdfConvertFn(options);
    const sourceFilePath = pdfResult?.filePath;

    if (!sourceFilePath) {
      throw new Error('Failed to generate PDF document.');
    }

    // 4. Save to Android Public Download Directory for easy user access
    let finalFilePath = sourceFilePath;

    if (Platform.OS === 'android') {
      try {
        if (EmergencyMedia && typeof EmergencyMedia.savePdfToDownloads === 'function') {
          const publicPath = await EmergencyMedia.savePdfToDownloads(sourceFilePath, fileNameWithExt);
          if (publicPath) {
            finalFilePath = publicPath;
          }
        } else {
          const downloadDir = RNFS.DownloadDirectoryPath;
          if (downloadDir) {
            const downloadDest = `${downloadDir}/${fileNameWithExt}`;

            // Check if file already exists; if so, remove or overwrite
            const exists = await RNFS.exists(downloadDest);
            if (exists) {
              await RNFS.unlink(downloadDest);
            }

            await RNFS.copyFile(sourceFilePath, downloadDest);
            finalFilePath = downloadDest;

            // Also inform Android media scanner so it appears in file managers immediately
            if (RNFS.scanFile) {
              try {
                await RNFS.scanFile(finalFilePath);
              } catch (_) {}
            }
          }
        }
      } catch (saveErr) {
        console.warn('Could not save to public Downloads, keeping app internal storage path:', saveErr);
        finalFilePath = sourceFilePath;
      }

      // Show top-bar notification so user can tap and view in file manager / PDF viewer
      if (EmergencyMedia && typeof EmergencyMedia.showPdfDownloadedNotification === 'function') {
        try {
          await EmergencyMedia.showPdfDownloadedNotification(fileNameWithExt, finalFilePath);
        } catch (_) {}
      }
    }

    return {
      filePath: finalFilePath,
      sourceFilePath,
      fileName: fileNameWithExt,
      totalPages: parseInt(pdfResult.numberOfPages, 10) || 1,
      totalRecords: records.length,
    };
  } finally {
    isExporting = false;
  }
}

/**
 * Opens the saved PDF using the device's native PDF viewer.
 */
export async function openPdfFile(filePath, fallbackFilePath) {
  if (!filePath && !fallbackFilePath) {
    throw new Error('File path is required to open PDF.');
  }

  if (EmergencyMedia && typeof EmergencyMedia.openPdf === 'function') {
    try {
      return await EmergencyMedia.openPdf(filePath || fallbackFilePath);
    } catch (err) {
      if (fallbackFilePath && fallbackFilePath !== filePath) {
        return await EmergencyMedia.openPdf(fallbackFilePath);
      }
      throw err;
    }
  }

  throw new Error('Native PDF viewer bridge is unavailable.');
}

/**
 * Shares the saved PDF using Android native share sheet.
 */
export async function sharePdfFile(filePath, title = 'CoGG Safe SOS Report', fallbackFilePath) {
  if (!filePath && !fallbackFilePath) {
    throw new Error('File path is required to share PDF.');
  }

  if (EmergencyMedia && typeof EmergencyMedia.sharePdf === 'function') {
    try {
      return await EmergencyMedia.sharePdf(filePath || fallbackFilePath, title);
    } catch (err) {
      if (fallbackFilePath && fallbackFilePath !== filePath) {
        return await EmergencyMedia.sharePdf(fallbackFilePath, title);
      }
      throw err;
    }
  }

  throw new Error('Native file sharing bridge is unavailable.');
}

