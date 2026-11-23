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

function formatChannelBadge(channelVal, defaultSuccessText = 'SUCCESS (Delivered)') {
  if (channelVal === true || channelVal === 'success') {
    return { cls: 'chip-success', text: defaultSuccessText };
  }
  if (!channelVal || channelVal === 'Not Available') {
    return { cls: 'chip-neutral', text: 'Not Configured' };
  }
  const str = String(channelVal).toLowerCase();
  if (str.includes('success') || str.includes('delivered') || str === 'sent') {
    return { cls: 'chip-success', text: defaultSuccessText };
  }
  if (str.includes('fail') || str.includes('error')) {
    return { cls: 'chip-failed', text: String(channelVal).toUpperCase() };
  }
  if (str.includes('pending')) {
    return { cls: 'chip-pending', text: 'PENDING' };
  }
  if (str.includes('skip') || str.includes('not configured')) {
    return { cls: 'chip-neutral', text: 'NOT CONFIGURED' };
  }
  return { cls: 'chip-success', text: String(channelVal).toUpperCase() };
}

export function generateSosReportHtml({ reportMeta, records = [] }) {
  const meta = reportMeta || {};
  const genBy = meta.generatedBy || {};
  const summary = meta.summary || {
    totalRecords: records.length,
    activeRecords: records.filter(r => (r.status || '').toLowerCase() === 'active').length,
    deactivatedRecords: records.filter(r => (r.status || '').toLowerCase() === 'deactivated' || (r.status || '').toLowerCase() === 'resolved').length,
    cancelledRecords: records.filter(r => (r.status || '').toLowerCase() === 'cancelled').length,
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
        const liveLoc = record.liveLocation || {};
        const media = record.media || {};
        const channels = record.channels || {};

        // Defensive date & time parsing
        const rawDate = record.createdAt || record.triggeredAt || record.activatedAt;
        const parsedDate = rawDate ? new Date(rawDate) : null;
        const validDate = parsedDate && !isNaN(parsedDate.getTime());

        const formattedDate = (record.dateFormatted && record.dateFormatted !== 'Not Available')
          ? record.dateFormatted
          : (validDate ? parsedDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'Not Available');

        const formattedTime = (record.timeFormatted && record.timeFormatted !== 'Not Available')
          ? record.timeFormatted
          : (validDate ? parsedDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Not Available');

        // Defensive duration calculation
        let durationDisplay = (record.duration && record.duration !== 'Not Available') ? record.duration : null;
        if (!durationDisplay && validDate) {
          const startMs = parsedDate.getTime();
          let endMs = null;
          if (record.deactivatedAt) endMs = new Date(record.deactivatedAt).getTime();
          else if (record.resolvedAt) endMs = new Date(record.resolvedAt).getTime();
          else if (record.cancelledAt) endMs = new Date(record.cancelledAt).getTime();
          else if (isActive) endMs = Date.now();

          if (endMs && endMs >= startMs) {
            const diffSec = Math.round((endMs - startMs) / 1000);
            const h = Math.floor(diffSec / 3600);
            const m = Math.floor((diffSec % 3600) / 60);
            const s = diffSec % 60;
            if (h > 0) durationDisplay = `${h}h ${m}m ${s}s`;
            else if (m > 0) durationDisplay = `${m}m ${s}s`;
            else durationDisplay = `${s}s`;
            if (isActive) durationDisplay += ' (Active / Ongoing)';
          } else if (isActive) {
            durationDisplay = 'Active (Ongoing)';
          }
        }
        if (!durationDisplay) {
          durationDisplay = isResolved ? 'Resolved' : isActive ? 'Active (Ongoing)' : 'Not Available';
        }

        // Coordinates & Maps formatting for Initial Activation Location
        const hasTriggerCoords = loc.latitude != null && loc.longitude != null;
        const triggerLat = hasTriggerCoords ? Number(loc.latitude) : null;
        const triggerLng = hasTriggerCoords ? Number(loc.longitude) : null;
        const triggerCoordsText = hasTriggerCoords
          ? `${triggerLat.toFixed(6)}, ${triggerLng.toFixed(6)}`
          : (loc.coordinatesText && loc.coordinatesText !== 'Location Not Available' ? loc.coordinatesText : 'Coordinates Not Captured');
        const triggerMapsUrl = hasTriggerCoords
          ? `https://maps.google.com/?q=${triggerLat},${triggerLng}`
          : (loc.mapsUrl || null);

        // Coordinates & Maps formatting for Latest / Live Location
        const hasLiveCoords = liveLoc.latitude != null && liveLoc.longitude != null;
        const liveLat = hasLiveCoords ? Number(liveLoc.latitude) : null;
        const liveLng = hasLiveCoords ? Number(liveLoc.longitude) : null;
        const isSameAsInitial = liveLoc.isSameAsInitial !== undefined
          ? liveLoc.isSameAsInitial
          : (!hasLiveCoords || (hasTriggerCoords && Math.abs(liveLat - triggerLat) < 0.0001 && Math.abs(liveLng - triggerLng) < 0.0001));

        const liveCoordsText = hasLiveCoords
          ? `${liveLat.toFixed(6)}, ${liveLng.toFixed(6)}`
          : (liveLoc.coordinatesText || triggerCoordsText);
        const liveMapsUrl = hasLiveCoords
          ? `https://maps.google.com/?q=${liveLat},${liveLng}`
          : triggerMapsUrl;

        // Media images and urls
        const frontImgUrl = media.frontImage?.url || media.frontPhoto?.url || null;
        const backImgUrl = media.backImage?.url || media.backPhoto?.url || null;
        const frontAvailable = media.frontImage?.available || Boolean(frontImgUrl);
        const backAvailable = media.backImage?.available || Boolean(backImgUrl);
        const audioAvailable = media.audio?.available || Boolean(media.audio?.url || media.audioRecording?.url);

        // Relays formatting
        const smsBadge = formatChannelBadge(channels.sms, 'SUCCESS (Delivered)');
        const emailBadge = formatChannelBadge(channels.email, 'SUCCESS (Delivered)');
        const pushBadge = formatChannelBadge(channels.push, 'SUCCESS (Delivered)');
        const callBadge = formatChannelBadge(channels.call, 'SUCCESS (Connected)');

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
              <span class="meta-item"><strong>Date:</strong> ${escapeHtml(formattedDate)}</span>
              <span class="meta-item"><strong>Time:</strong> ${escapeHtml(formattedTime)}</span>
              <span class="meta-item"><strong>Duration:</strong> ${escapeHtml(durationDisplay)}</span>
            </div>
          </div>

          <!-- EMERGENCY MESSAGE CONTAINER -->
          <div class="emergency-message-box">
            <span class="emergency-label">EMERGENCY BROADCAST MESSAGE:</span>
            <div class="emergency-text">"${escapeHtml(record.emergencyMessage || 'Emergency SOS triggered.')}"</div>
          </div>

          <!-- 2-COLUMN GRID FOR USER & GROUP INFORMATION -->
          <div class="info-grid">
            <!-- USER & GROUP INFO -->
            <div class="info-block">
              <div class="block-title">User &amp; Group Identification</div>
              <table class="detail-table">
                <tr>
                  <td class="lbl">Full Name:</td>
                  <td class="val highlight-user">${escapeHtml(user.name || user.username || 'Not Available')}</td>
                </tr>
                <tr>
                  <td class="lbl">User ID:</td>
                  <td class="val monospace">${escapeHtml(user.id || user._id || 'Not Available')}</td>
                </tr>
                <tr>
                  <td class="lbl">Mobile Number:</td>
                  <td class="val">${escapeHtml(user.mobileNumber || user.phone || 'Not Available')}</td>
                </tr>
                <tr>
                  <td class="lbl">Email Address:</td>
                  <td class="val">${escapeHtml(user.email || 'Not Available')}</td>
                </tr>
                <tr>
                  <td class="lbl">Assigned Group:</td>
                  <td class="val"><strong>${escapeHtml(user.groupName || user.collectionName || 'General')}</strong> (${escapeHtml(user.groupType || user.collectionType || 'Standard')})</td>
                </tr>
                <tr>
                  <td class="lbl">Emergency Call No:</td>
                  <td class="val emergency-phone">${escapeHtml(user.emergencyCallNumber || record.emergencyCallNumber || 'Not Configured')}</td>
                </tr>
                <tr>
                  <td class="lbl">Total Group Users:</td>
                  <td class="val">${escapeHtml(user.totalGroupMembers ? (typeof user.totalGroupMembers === 'number' ? `${user.totalGroupMembers} registered users` : user.totalGroupMembers) : '1 registered user')}</td>
                </tr>
              </table>
            </div>

            <!-- DUAL LOCATION INFO (INITIAL & LATEST) -->
            <div class="info-block">
              <div class="block-title">Location Tracking &amp; Coordinates</div>
              
              <!-- SECTION 1: INITIAL TRIGGER LOCATION -->
              <div class="location-sub-section">
                <div class="sub-section-header">
                  <span class="loc-badge-initial">INITIAL TRIGGER LOCATION</span>
                  <span class="loc-time">${escapeHtml(loc.capturedAt ? new Date(loc.capturedAt).toLocaleTimeString() : formattedTime)}</span>
                </div>
                <table class="detail-table">
                  <tr>
                    <td class="lbl">Coordinates:</td>
                    <td class="val font-bold">${escapeHtml(triggerCoordsText)}</td>
                  </tr>
                  <tr>
                    <td class="lbl">Accuracy:</td>
                    <td class="val">${escapeHtml(loc.accuracy || 'Not Available')}</td>
                  </tr>
                  <tr>
                    <td class="lbl">Fix Source:</td>
                    <td class="val">${escapeHtml(loc.source || 'GPS Sensor')}</td>
                  </tr>
                  <tr>
                    <td class="lbl">Maps Verification:</td>
                    <td class="val">
                      ${triggerMapsUrl 
                        ? `<a href="${triggerMapsUrl}" class="map-link" target="_blank">View Initial Location on Google Maps &rarr;</a>` 
                        : '<span class="text-muted">Unavailable</span>'}
                    </td>
                  </tr>
                </table>
              </div>

              <!-- SECTION 2: LATEST / LAST KNOWN LOCATION -->
              <div class="location-sub-section" style="margin-top: 8px; border-top: 1px dashed #D1D5DB; padding-top: 6px;">
                <div class="sub-section-header">
                  <span class="loc-badge-live">LATEST / LAST LOCATION</span>
                  <span class="loc-time">${escapeHtml(liveLoc.capturedAt ? new Date(liveLoc.capturedAt).toLocaleTimeString() : 'Latest')}</span>
                </div>
                <table class="detail-table">
                  ${!isSameAsInitial && hasLiveCoords ? `
                    <tr>
                      <td class="lbl">Status:</td>
                      <td class="val font-bold" style="color:#059669">${escapeHtml((liveLoc.status || 'Active').toUpperCase())}</td>
                    </tr>
                    <tr>
                      <td class="lbl">Coordinates:</td>
                      <td class="val font-bold">${escapeHtml(liveCoordsText)}</td>
                    </tr>
                    <tr>
                      <td class="lbl">Accuracy:</td>
                      <td class="val">${escapeHtml(liveLoc.accuracy || 'Not Available')}</td>
                    </tr>
                    <tr>
                      <td class="lbl">Maps Verification:</td>
                      <td class="val">
                        <a href="${liveMapsUrl}" class="map-link" style="color:#059669" target="_blank">View Latest Live Location on Google Maps &rarr;</a>
                      </td>
                    </tr>
                  ` : `
                    <tr>
                      <td class="lbl">Live Tracking:</td>
                      <td class="val font-medium">Same as Initial Trigger Location</td>
                    </tr>
                    <tr>
                      <td class="lbl">Status:</td>
                      <td class="val font-medium">${escapeHtml((liveLoc.status || (isResolved ? 'Completed' : 'Captured')).toUpperCase())}</td>
                    </tr>
                    <tr>
                      <td class="lbl">Movement Note:</td>
                      <td class="val text-muted">No live movement recorded beyond trigger fix</td>
                    </tr>
                    <tr>
                      <td class="lbl">Maps Verification:</td>
                      <td class="val">
                        ${triggerMapsUrl 
                          ? `<a href="${triggerMapsUrl}" class="map-link" target="_blank">View on Google Maps &rarr;</a>` 
                          : '<span class="text-muted">Unavailable</span>'}
                      </td>
                    </tr>
                  `}
                </table>
              </div>

            </div>
          </div>

          <!-- MEDIA & DISPATCH STATUS -->
          <div class="media-dispatch-row">
            <!-- MEDIA EVIDENCE -->
            <div class="sub-block">
              <div class="block-title">Media Telemetry &amp; Evidence</div>
              <div class="media-evidence-container">
                <div class="evidence-item">
                  <span class="evidence-name">Front Camera:</span>
                  ${frontImgUrl 
                    ? `<div class="img-preview-box"><img src="${escapeHtml(frontImgUrl)}" alt="Front Photo" class="evidence-img" /><a href="${escapeHtml(frontImgUrl)}" target="_blank" class="media-link">View Full Image &rarr;</a></div>`
                    : `<span class="chip ${frontAvailable ? 'chip-success' : 'chip-neutral'}">${frontAvailable ? 'Captured' : 'Not Captured'}</span>`}
                </div>
                <div class="evidence-item">
                  <span class="evidence-name">Back Camera:</span>
                  ${backImgUrl 
                    ? `<div class="img-preview-box"><img src="${escapeHtml(backImgUrl)}" alt="Back Photo" class="evidence-img" /><a href="${escapeHtml(backImgUrl)}" target="_blank" class="media-link">View Full Image &rarr;</a></div>`
                    : `<span class="chip ${backAvailable ? 'chip-success' : 'chip-neutral'}">${backAvailable ? 'Captured' : 'Not Captured'}</span>`}
                </div>
                <div class="evidence-item">
                  <span class="evidence-name">Audio Recording:</span>
                  <span class="chip ${audioAvailable ? 'chip-success' : 'chip-neutral'}">${audioAvailable ? 'Captured (5s Recording)' : 'Not Captured'}</span>
                </div>
              </div>
            </div>

            <!-- RELAY & DISPATCH CHANNELS -->
            <div class="sub-block">
              <div class="block-title">Dispatch Relays &amp; Alert Status</div>
              <div class="chips-container">
                <div class="chip ${smsBadge.cls}">
                  <span class="chip-dot"></span>
                  SMS Alerts: <strong>${escapeHtml(smsBadge.text)}</strong>
                </div>
                <div class="chip ${emailBadge.cls}">
                  <span class="chip-dot"></span>
                  Email Dispatch: <strong>${escapeHtml(emailBadge.text)}</strong>
                </div>
                <div class="chip ${callBadge.cls}">
                  <span class="chip-dot"></span>
                  Phone Call Relay: <strong>${escapeHtml(callBadge.text)}</strong>
                </div>
                <div class="chip ${pushBadge.cls}">
                  <span class="chip-dot"></span>
                  Push Alerts: <strong>${escapeHtml(pushBadge.text)}</strong>
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
      font-size: 22px;
      font-weight: 900;
      letter-spacing: -0.4px;
      color: #111827;
      line-height: 1.2;
    }

    .brand-title span {
      color: #111827;
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

    .audit-col {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .audit-col strong {
      color: #111827;
    }

    .audit-col span {
      color: #4B5563;
    }

    .highlight-admin {
      font-weight: 700;
      color: #111827;
      font-size: 11px;
    }

    .admin-pill {
      background-color: #FEE2E2;
      color: #B91C1C;
      font-size: 8.5px;
      font-weight: 800;
      padding: 2px 7px;
      border-radius: 10px;
      border: 1px solid #FCA5A5;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .emergency-phone {
      color: #DC2626;
      font-weight: 700;
    }

    .location-sub-section {
      margin-top: 4px;
    }

    .sub-section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
    }

    .loc-badge-initial {
      font-size: 8.5px;
      font-weight: 800;
      color: #1D4ED8;
      background-color: #EFF6FF;
      border: 1px solid #BFDBFE;
      padding: 2px 6px;
      border-radius: 4px;
      letter-spacing: 0.3px;
    }

    .loc-badge-live {
      font-size: 8.5px;
      font-weight: 800;
      color: #047857;
      background-color: #ECFDF5;
      border: 1px solid #A7F3D0;
      padding: 2px 6px;
      border-radius: 4px;
      letter-spacing: 0.3px;
    }

    .loc-time {
      font-size: 8.5px;
      color: #6B7280;
      font-weight: 600;
    }

    .text-muted {
      color: #9CA3AF;
      font-style: italic;
    }

    .font-medium {
      font-weight: 500;
      color: #374151;
    }

    .media-evidence-container {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .evidence-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 9.5px;
      padding: 3px 0;
      border-bottom: 1px dotted #E5E7EB;
    }

    .evidence-item:last-child {
      border-bottom: none;
    }

    .evidence-name {
      color: #4B5563;
      font-weight: 600;
    }

    .img-preview-box {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .evidence-img {
      width: 36px;
      height: 36px;
      object-fit: cover;
      border-radius: 4px;
      border: 1px solid #D1D5DB;
    }

    .media-link {
      font-size: 8.5px;
      color: #2563EB;
      font-weight: 700;
      text-decoration: none;
    }

    .chip-failed {
      background-color: #FEE2E2;
      color: #B91C1C;
      border: 1px solid #FCA5A5;
    }

    .chip-pending {
      background-color: #FEF3C7;
      color: #B45309;
      border: 1px solid #FCD34D;
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
        <div class="brand-title">CoGG Safe</div>
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
      <strong>Generated By:</strong> <span class="highlight-admin">${escapeHtml(genBy.name || genBy.username || 'System Administrator')}</span> <span class="admin-pill">${escapeHtml(genBy.role ? genBy.role.toUpperCase() : 'ADMIN')}</span>
    </div>
    <div class="audit-col">
      <strong>Admin / Staff ID:</strong> <span class="monospace">${escapeHtml(genBy.id || genBy._id || 'N/A')}</span>
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
