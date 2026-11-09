// sosPdfTemplate.js
// Generates professional, multi-page HTML & CSS for CoGG Safe SOS Reports.

import { COGG_LOGO_BASE64 } from './logoBase64.js';

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function generateSosReportHtml({ reportMeta, records = [] }) {
  const meta = reportMeta || {};
  const genBy = meta.generatedBy || {};
  const summary = meta.summary || {
    totalRecords: records.length,
    activeRecords: records.filter(r => r.status === 'active').length,
    deactivatedRecords: records.filter(r => r.status === 'deactivated').length,
    cancelledRecords: records.filter(r => r.status === 'cancelled').length,
  };

  const periodTitle = (meta.period || 'Report').toUpperCase() + ' SOS REPORT';
  const periodLabel = meta.formattedPeriodLabel || `${meta.startDateFormatted || ''} - ${meta.endDateFormatted || ''}`;
  const genDate = meta.generatedAt ? new Date(meta.generatedAt).toLocaleString() : new Date().toLocaleString();

  const cardsHtml = records.length === 0
    ? `
      <div class="empty-state">
        <div class="empty-icon">✓</div>
        <h3>No SOS Emergency Events Found</h3>
        <p>No incidents were recorded for the specified criteria and date range (${escapeHtml(periodLabel)}).</p>
      </div>
    `
    : records.map((record, index) => {
        const status = (record.status || 'unknown').toLowerCase();
        const isResolved = status === 'deactivated' || status === 'resolved';
        const isActive = status === 'active';
        const isCancelled = status === 'cancelled';

        const statusClass = isActive ? 'status-active' : isResolved ? 'status-resolved' : 'status-cancelled';
        const statusText = isActive ? 'ACTIVE' : isResolved ? 'RESOLVED / DEACTIVATED' : status.toUpperCase();

        const user = record.user || {};
        const loc = record.location || {};
        const media = record.media || {};
        const channels = record.channels || {};

        return `
        <div class="sos-card ${index > 0 ? 'page-break-before' : ''}">
          <!-- CARD HEADER -->
          <div class="card-header">
            <div class="card-title-row">
              <span class="event-id-badge">ID: ${escapeHtml(record.id || record.eventId || 'N/A')}</span>
              <span class="status-pill ${statusClass}">${statusText}</span>
              <span class="event-number">Event ${index + 1} of ${records.length}</span>
            </div>
            <div class="card-meta-row">
              <span class="meta-item"><strong>Date:</strong> ${escapeHtml(record.dateFormatted || 'Not Available')}</span>
              <span class="meta-item"><strong>Time:</strong> ${escapeHtml(record.timeFormatted || 'Not Available')}</span>
              <span class="meta-item"><strong>Duration:</strong> ${escapeHtml(record.duration || 'Not Available')}</span>
            </div>
          </div>

          <!-- EMERGENCY MESSAGE CONTAINER -->
          <div class="emergency-message-box">
            <span class="emergency-label">EMERGENCY BROADCAST MESSAGE:</span>
            <div class="emergency-text">"${escapeHtml(record.emergencyMessage || 'Emergency SOS triggered.')}"</div>
          </div>

          <!-- 2-COLUMN GRID FOR USER & LOCATION -->
          <div class="info-grid">
            <!-- USER INFO -->
            <div class="info-block">
              <div class="block-title">User Identification</div>
              <table class="detail-table">
                <tr>
                  <td class="lbl">Full Name:</td>
                  <td class="val highlight-user">${escapeHtml(user.name || 'Not Available')}</td>
                </tr>
                <tr>
                  <td class="lbl">User ID:</td>
                  <td class="val monospace">${escapeHtml(user.id || 'Not Available')}</td>
                </tr>
                <tr>
                  <td class="lbl">Mobile Number:</td>
                  <td class="val">${escapeHtml(user.mobileNumber || 'Not Available')}</td>
                </tr>
                <tr>
                  <td class="lbl">Email Address:</td>
                  <td class="val">${escapeHtml(user.email || 'Not Available')}</td>
                </tr>
                <tr>
                  <td class="lbl">Assigned Group:</td>
                  <td class="val">${escapeHtml(user.groupName || 'Not Available')} (${escapeHtml(user.groupType || 'General')})</td>
                </tr>
              </table>
            </div>

            <!-- LOCATION INFO -->
            <div class="info-block">
              <div class="block-title">Incident Location & Coordinates</div>
              <table class="detail-table">
                <tr>
                  <td class="lbl">Coordinates:</td>
                  <td class="val font-bold">${escapeHtml(loc.coordinatesText || 'Location Not Available')}</td>
                </tr>
                <tr>
                  <td class="lbl">Accuracy:</td>
                  <td class="val">${escapeHtml(loc.accuracy || 'Not Available')}</td>
                </tr>
                <tr>
                  <td class="lbl">Captured At:</td>
                  <td class="val">${escapeHtml(loc.capturedAt ? new Date(loc.capturedAt).toLocaleString() : 'Not Available')}</td>
                </tr>
                <tr>
                  <td class="lbl">Fix Source:</td>
                  <td class="val">${escapeHtml(loc.source || 'GPS')}</td>
                </tr>
                <tr>
                  <td class="lbl">Maps Verification:</td>
                  <td class="val">
                    ${loc.latitude && loc.longitude 
                      ? `<a href="https://maps.google.com/?q=${loc.latitude},${loc.longitude}" class="map-link" target="_blank">View on Google Maps &rarr;</a>` 
                      : 'Unavailable'}
                  </td>
                </tr>
              </table>
            </div>
          </div>

          <!-- MEDIA & DISPATCH STATUS -->
          <div class="media-dispatch-row">
            <!-- MEDIA EVIDENCE -->
            <div class="sub-block">
              <div class="block-title">Media Telemetry & Evidence</div>
              <div class="chips-container">
                <div class="chip ${media.frontImage?.available ? 'chip-success' : 'chip-neutral'}">
                  <span class="chip-dot"></span>
                  Front Photo: <strong>${media.frontImage?.available ? 'Captured' : 'Not Available'}</strong>
                </div>
                <div class="chip ${media.backImage?.available ? 'chip-success' : 'chip-neutral'}">
                  <span class="chip-dot"></span>
                  Back Photo: <strong>${media.backImage?.available ? 'Captured' : 'Not Available'}</strong>
                </div>
                <div class="chip ${media.audio?.available ? 'chip-success' : 'chip-neutral'}">
                  <span class="chip-dot"></span>
                  Audio Recording: <strong>${media.audio?.available ? 'Captured (5s Audio)' : 'Not Available'}</strong>
                </div>
              </div>
            </div>

            <!-- RELAY & DISPATCH CHANNELS -->
            <div class="sub-block">
              <div class="block-title">Dispatch Relays</div>
              <div class="chips-container">
                <div class="chip ${channels.sms === 'success' ? 'chip-success' : 'chip-neutral'}">
                  SMS Alerts: <strong>${escapeHtml(channels.sms || 'Not Available')}</strong>
                </div>
                <div class="chip ${channels.call === 'success' ? 'chip-success' : 'chip-neutral'}">
                  Phone Call Relay: <strong>${escapeHtml(channels.call || 'Not Available')}</strong>
                </div>
                <div class="chip ${channels.email === 'success' ? 'chip-success' : 'chip-neutral'}">
                  Email Dispatch: <strong>${escapeHtml(channels.email || 'Not Available')}</strong>
                </div>
                <div class="chip ${channels.push === 'success' ? 'chip-success' : 'chip-neutral'}">
                  Push Alerts: <strong>${escapeHtml(channels.push || 'Not Available')}</strong>
                </div>
              </div>
            </div>
          </div>

          <!-- RESOLUTION / DEACTIVATION AUDIT -->
          <div class="card-footer-audit">
            <span class="audit-item">
              <strong>Deactivated By:</strong> ${escapeHtml(record.deactivatedBy || (isResolved ? 'Admin' : 'Not Resolved'))}
            </span>
            ${record.deactivatedAt ? `<span class="audit-item"><strong>Deactivated At:</strong> ${escapeHtml(new Date(record.deactivatedAt).toLocaleString())}</span>` : ''}
            ${record.cancelledAt ? `<span class="audit-item"><strong>Cancelled At:</strong> ${escapeHtml(new Date(record.cancelledAt).toLocaleString())}</span>` : ''}
          </div>
        </div>
        `;
      }).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(periodTitle)}</title>
  <style>
    @page {
      size: A4;
      margin: 14mm 12mm 14mm 12mm;
      @bottom-center {
        content: "CoGG Safe &bull; SOS Safety Audit System";
        font-size: 8pt;
        color: #9CA3AF;
      }
      @bottom-right {
        content: "Page " counter(page);
        font-size: 8pt;
        color: #6B7280;
      }
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #1A1A1A;
      background-color: #FFFFFF;
      font-size: 11px;
      line-height: 1.45;
    }

    /* ================= HEADER & BRANDING ================= */
    .header-container {
      border-bottom: 2px solid #E4002B;
      padding-bottom: 12px;
      margin-bottom: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .brand-section {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .brand-logo {
      width: 58px;
      height: 58px;
      object-fit: contain;
    }

    .brand-title {
      font-size: 20px;
      font-weight: 800;
      letter-spacing: -0.5px;
      color: #1A1A1A;
      text-transform: uppercase;
    }

    .brand-title span {
      color: #E4002B;
    }

    .brand-sub {
      font-size: 10px;
      color: #6B7280;
      font-weight: 500;
      margin-top: 1px;
    }

    .report-meta-header {
      text-align: right;
    }

    .report-badge {
      display: inline-block;
      background-color: #FFF0F2;
      color: #E4002B;
      font-size: 12px;
      font-weight: 700;
      padding: 5px 12px;
      border-radius: 6px;
      border: 1px solid #FFD1D8;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    }

    .report-period-text {
      font-size: 11px;
      font-weight: 600;
      color: #374151;
    }

    /* ================= AUDIT / GENERATED BY BAR ================= */
    .audit-bar {
      background-color: #F9FAFB;
      border: 1px solid #E5E7EB;
      border-radius: 8px;
      padding: 10px 14px;
      margin-bottom: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 10px;
    }

    .audit-col strong {
      color: #111827;
    }

    .audit-col span {
      color: #4B5563;
    }

    /* ================= STATS SUMMARY CARDS ================= */
    .stats-row {
      display: flex;
      gap: 10px;
      margin-bottom: 18px;
    }

    .stat-card {
      flex: 1;
      padding: 10px 12px;
      background-color: #FFFFFF;
      border: 1px solid #E5E7EB;
      border-radius: 8px;
      text-align: center;
    }

    .stat-num {
      font-size: 18px;
      font-weight: 800;
      line-height: 1.1;
      margin-bottom: 2px;
    }

    .stat-num.total { color: #1F2937; }
    .stat-num.active { color: #E4002B; }
    .stat-num.resolved { color: #178A4B; }
    .stat-num.cancelled { color: #D97706; }

    .stat-label {
      font-size: 9px;
      font-weight: 700;
      color: #6B7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    /* ================= INDIVIDUAL SOS CARDS ================= */
    .sos-card {
      border: 1px solid #D1D5DB;
      border-radius: 10px;
      background-color: #FFFFFF;
      margin-bottom: 18px;
      padding: 14px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .page-break-before {
      page-break-before: always;
      break-before: page;
    }

    .card-header {
      border-bottom: 1px solid #E5E7EB;
      padding-bottom: 10px;
      margin-bottom: 10px;
    }

    .card-title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 6px;
    }

    .event-id-badge {
      font-family: "Courier New", Courier, monospace;
      font-weight: 700;
      font-size: 12px;
      color: #111827;
      background-color: #F3F4F6;
      padding: 3px 8px;
      border-radius: 4px;
      border: 1px solid #E5E7EB;
    }

    .status-pill {
      font-size: 10px;
      font-weight: 800;
      padding: 3px 10px;
      border-radius: 20px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .status-active {
      background-color: #FEE2E2;
      color: #B91C1C;
      border: 1px solid #F87171;
    }

    .status-resolved {
      background-color: #DCFCE7;
      color: #15803D;
      border: 1px solid #86EFAC;
    }

    .status-cancelled {
      background-color: #FEF3C7;
      color: #B45309;
      border: 1px solid #FCD34D;
    }

    .event-number {
      font-size: 10px;
      font-weight: 600;
      color: #9CA3AF;
    }

    .card-meta-row {
      display: flex;
      gap: 16px;
      font-size: 10px;
      color: #4B5563;
    }

    /* ================= EMERGENCY MESSAGE ================= */
    .emergency-message-box {
      background-color: #FFF5F5;
      border-left: 4px solid #E4002B;
      padding: 8px 12px;
      border-radius: 0 6px 6px 0;
      margin-bottom: 12px;
    }

    .emergency-label {
      font-size: 8.5px;
      font-weight: 800;
      color: #E4002B;
      letter-spacing: 0.5px;
      display: block;
      margin-bottom: 2px;
    }

    .emergency-text {
      font-size: 11px;
      font-weight: 600;
      color: #111827;
      font-style: italic;
    }

    /* ================= 2-COLUMN INFO GRID ================= */
    .info-grid {
      display: flex;
      gap: 12px;
      margin-bottom: 12px;
    }

    .info-block {
      flex: 1;
      background-color: #F9FAFB;
      border: 1px solid #E5E7EB;
      border-radius: 6px;
      padding: 10px;
    }

    .block-title {
      font-size: 9.5px;
      font-weight: 800;
      color: #374151;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
      border-bottom: 1px solid #E5E7EB;
      padding-bottom: 4px;
    }

    .detail-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
    }

    .detail-table td {
      padding: 3px 0;
      vertical-align: top;
    }

    .detail-table .lbl {
      color: #6B7280;
      width: 40%;
      font-weight: 500;
    }

    .detail-table .val {
      color: #111827;
      width: 60%;
    }

    .highlight-user {
      font-weight: 700;
      color: #111827;
      font-size: 11px;
    }

    .monospace {
      font-family: "Courier New", Courier, monospace;
      font-size: 9px;
    }

    .font-bold {
      font-weight: 700;
    }

    .map-link {
      color: #2563EB;
      text-decoration: none;
      font-weight: 600;
    }

    /* ================= MEDIA & DISPATCH ROW ================= */
    .media-dispatch-row {
      display: flex;
      gap: 12px;
      margin-bottom: 10px;
    }

    .sub-block {
      flex: 1;
      background-color: #F9FAFB;
      border: 1px solid #E5E7EB;
      border-radius: 6px;
      padding: 8px 10px;
    }

    .chips-container {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .chip {
      font-size: 9px;
      padding: 3px 8px;
      border-radius: 4px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }

    .chip-success {
      background-color: #ECFDF5;
      color: #065F46;
      border: 1px solid #A7F3D0;
    }

    .chip-neutral {
      background-color: #F3F4F6;
      color: #6B7280;
      border: 1px solid #E5E7EB;
    }

    .chip-dot {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background-color: currentColor;
    }

    /* ================= AUDIT FOOTER ================= */
    .card-footer-audit {
      border-top: 1px solid #E5E7EB;
      padding-top: 6px;
      display: flex;
      justify-content: space-between;
      font-size: 9px;
      color: #6B7280;
    }

    /* ================= EMPTY STATE ================= */
    .empty-state {
      text-align: center;
      padding: 40px 20px;
      background-color: #F9FAFB;
      border: 2px dashed #D1D5DB;
      border-radius: 12px;
      margin: 30px 0;
    }

    .empty-icon {
      font-size: 32px;
      color: #10B981;
      margin-bottom: 10px;
    }

    .empty-state h3 {
      font-size: 16px;
      font-weight: 700;
      color: #111827;
      margin-bottom: 6px;
    }

    .empty-state p {
      font-size: 11px;
      color: #6B7280;
    }

    /* ================= FOOTER ================= */
    .page-footer {
      border-top: 1px solid #E5E7EB;
      padding-top: 10px;
      margin-top: 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 9px;
      color: #9CA3AF;
    }
  </style>
</head>
<body>

  <!-- HEADER -->
  <div class="header-container">
    <div class="brand-section">
      <img src="${COGG_LOGO_BASE64}" class="brand-logo" alt="CoGG Safe Logo" />
      <div>
        <div class="brand-title">CoGG <span>SAFE</span></div>
        <div class="brand-sub">Emergency Safety Response & Official Incident Reporting</div>
      </div>
    </div>
    <div class="report-meta-header">
      <div class="report-badge">${escapeHtml(periodTitle)}</div>
      <div class="report-period-text">${escapeHtml(periodLabel)}</div>
    </div>
  </div>

  <!-- AUDIT & GENERATION BAR -->
  <div class="audit-bar">
    <div class="audit-col">
      <strong>Generated By:</strong> <span>${escapeHtml(genBy.username || 'CoGG Staff')} (${escapeHtml(genBy.role ? genBy.role.toUpperCase() : 'USER')})</span>
    </div>
    <div class="audit-col">
      <strong>User / Staff ID:</strong> <span>${escapeHtml(genBy.id || 'N/A')}</span>
    </div>
    <div class="audit-col">
      <strong>Generated At:</strong> <span>${escapeHtml(genDate)}</span>
    </div>
  </div>

  <!-- KPI SUMMARY CARDS -->
  <div class="stats-row">
    <div class="stat-card">
      <div class="stat-num total">${summary.totalRecords}</div>
      <div class="stat-label">Total SOS Events</div>
    </div>
    <div class="stat-card">
      <div class="stat-num active">${summary.activeRecords}</div>
      <div class="stat-label">Active Emergencies</div>
    </div>
    <div class="stat-card">
      <div class="stat-num resolved">${summary.deactivatedRecords}</div>
      <div class="stat-label">Resolved / Deactivated</div>
    </div>
    <div class="stat-card">
      <div class="stat-num cancelled">${summary.cancelledRecords}</div>
      <div class="stat-label">Cancelled Events</div>
    </div>
  </div>

  <!-- RECORD CARDS -->
  <div class="records-container">
    ${cardsHtml}
  </div>

  <!-- REPORT FOOTER -->
  <div class="page-footer">
    <div>CONFIDENTIAL &bull; CoGG Safe Emergency Audit Record &bull; Generated securely from encrypted incident logs</div>
    <div>CoGG Safe v1.0</div>
  </div>

</body>
</html>
  `;
}
