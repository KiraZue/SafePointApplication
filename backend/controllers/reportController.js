// reportController.js — SQLite3 version
const EmergencyReport = require('../models/EmergencyReport');
const User = require('../models/User');
const { sendPushNotification } = require('../utils/notification');
const {
  Document, Packer, Paragraph, TextRun, AlignmentType,
  HeadingLevel, BorderStyle, Table, TableRow, TableCell,
  WidthType, ShadingType, VerticalAlign,
} = require('docx');

let ioInstance;
function setIO(io) { ioInstance = io; }

// @desc    Create new report
// @route   POST /api/reports
const createReport = async (req, res) => {
  const { type, location, status, statusHistory, createdAt, syncedFromOffline, user: reportUser, message } = req.body;
  const offlineId = req.headers['x-offline-id'];
  const userId = reportUser?._id || reportUser || req.user._id;
  const isOfflineSync = syncedFromOffline === true || (statusHistory && Array.isArray(statusHistory) && statusHistory.length > 0);

  // Duplicate detection for offline syncs
  if (isOfflineSync && createdAt) {
    const existingReport = EmergencyReport.findOne({
      $or: [
        {
          user: userId,
          type,
          'location.latitude': location?.latitude,
          'location.longitude': location?.longitude,
          createdAt: createdAt ? {
            $gte: new Date(new Date(createdAt).getTime() - 30000),
            $lte: new Date(new Date(createdAt).getTime() + 30000),
          } : undefined,
        },
      ].filter(q => q.createdAt !== undefined),
    });

    if (existingReport) {
      let historyUpdated = false;
      if (statusHistory && Array.isArray(statusHistory)) {
        for (const entry of statusHistory) {
          const entryUserId = entry.updatedBy?._id || entry.updatedBy || userId;
          const alreadyExists = existingReport.statusHistory.some(
            h => h.status === entry.status && (h.updatedBy?._id || h.updatedBy) === entryUserId
          );
          if (!alreadyExists) {
            existingReport.statusHistory.push({
              status: entry.status,
              updatedBy: entryUserId,
              timestamp: entry.updatedAt || entry.timestamp || new Date(),
            });
            historyUpdated = true;
          }
        }

        if (historyUpdated) {
          existingReport.statusHistory.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
          const statusPriority = { REPORTED: 1, ACKNOWLEDGED: 2, RESPONDING: 3, RESOLVED: 4 };
          let latestStatus = existingReport.status;
          let maxPriority = statusPriority[latestStatus] || 0;
          existingReport.statusHistory.forEach(entry => {
            const priority = statusPriority[entry.status] || 0;
            if (priority > maxPriority) { maxPriority = priority; latestStatus = entry.status; }
          });
          existingReport.status = latestStatus;
          await EmergencyReport.save(existingReport);
        }
      }

      const populated = EmergencyReport.findById(existingReport._id);
      if (ioInstance) ioInstance.emit('report:updated', populated);
      return res.status(200).json(populated);
    }
  }

  // Build statusHistory priority if syncing offline
  let resolvedStatus = status || 'REPORTED';
  let resolvedHistory = [];
  if (isOfflineSync && statusHistory && Array.isArray(statusHistory)) {
    resolvedHistory = statusHistory.map(entry => ({
      status: entry.status,
      updatedBy: entry.updatedBy?._id || entry.updatedBy || userId,
      timestamp: entry.updatedAt || entry.timestamp || new Date(),
    })).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const statusPriority = { REPORTED: 1, ACKNOWLEDGED: 2, RESPONDING: 3, RESOLVED: 4 };
    let maxPriority = 0;
    resolvedHistory.forEach(entry => {
      const priority = statusPriority[entry.status] || 0;
      if (priority > maxPriority) { maxPriority = priority; resolvedStatus = entry.status; }
    });
  }

  const report = await EmergencyReport.create({
    user: userId,
    type,
    location,
    message,
    status: resolvedStatus,
    syncedFromOffline: isOfflineSync,
    createdAt: createdAt ? new Date(createdAt) : undefined,
    statusHistory: resolvedHistory,
  });

  if (ioInstance) ioInstance.emit('report:created', report);

  try {
    const activeCount = EmergencyReport.countDocuments({ status: { $ne: 'RESOLVED' } });
    const locationStr = report.location?.description ||
      (report.location?.latitude ? `${report.location.latitude.toFixed(4)}, ${report.location.longitude.toFixed(4)}` : 'Unknown');

    await sendPushNotification({
      title: `🚨 New ${report.type} Alert!`,
      body: `Reporter: ${report.user?.firstName} ${report.user?.lastName}\nLoc: ${locationStr}\nTime: ${new Date(report.createdAt).toLocaleTimeString()}`,
      data: { type: 'NEW_REPORT', reportId: report._id, alertType: report.type },
      badge: activeCount,
    });
  } catch (pushErr) {
    console.error('[Push] Failed to send report notification:', pushErr);
  }

  res.status(201).json(report);
};

// @desc    Get all reports
const getReports = async (req, res) => {
  const reports = EmergencyReport.find({}, { sort: { createdAt: -1 } });
  res.json(reports);
};

// @desc    Get active (non-resolved) reports
const getActiveReports = async (req, res) => {
  const reports = EmergencyReport.find({ status: { $ne: 'RESOLVED' } });
  res.json(reports);
};

// @desc    Update report status
const updateReportStatus = async (req, res) => {
  const { status } = req.body;
  const report = EmergencyReport.findById(req.params.id);
  if (!report) return res.status(404).json({ message: 'Report not found' });

  const alreadyApplied = report.statusHistory.some(
    h => h.status === status && (h.updatedBy?._id || h.updatedBy) === req.user._id
  );

  report.status = status;
  if (!alreadyApplied) {
    report.statusHistory.push({ status, updatedBy: req.user._id });
  }

  const populated = await EmergencyReport.save(report);
  if (ioInstance) ioInstance.emit('report:updated', populated);

  try {
    if (populated.user?._id) {
      const updaterName = `${req.user.firstName} ${req.user.lastName}`;
      const updaterRole = req.user.role ? ` (${req.user.role})` : '';
      await sendPushNotification({
        userIds: [populated.user._id],
        title: `🔄 Security Response: ${status}`,
        body: `${updaterName}${updaterRole} updated your ${populated.type} report to: ${status}.`,
        data: { type: 'STATUS_UPDATE', reportId: populated._id, status },
      });
    }
  } catch (err) { console.error('[Push] Failed to send targeted notification:', err); }

  res.json(populated);
};

// @desc    Acknowledge report
const acknowledgeReport = async (req, res) => {
  const report = EmergencyReport.findById(req.params.id);
  if (!report) return res.status(404).json({ message: 'Report not found' });
  if (report.status === 'RESOLVED') return res.status(400).json({ message: 'Cannot acknowledge resolved report' });

  if (report.status === 'REPORTED') report.status = 'ACKNOWLEDGED';

  const alreadyAcked = report.statusHistory.some(
    h => h.status === 'ACKNOWLEDGED' && (h.updatedBy?._id || h.updatedBy) === req.user._id
  );
  if (!alreadyAcked) {
    report.statusHistory.push({ status: 'ACKNOWLEDGED', updatedBy: req.user._id });
  }

  const populated = await EmergencyReport.save(report);
  if (ioInstance) ioInstance.emit('report:updated', populated);

  try {
    if (populated.user?._id) {
      const updaterName = `${req.user.firstName} ${req.user.lastName}`;
      const updaterRole = req.user.role ? ` (${req.user.role})` : '';
      await sendPushNotification({
        userIds: [populated.user._id],
        title: `✅ Report Acknowledged`,
        body: `${updaterName}${updaterRole} has acknowledged your ${populated.type} report.`,
        data: { type: 'STATUS_UPDATE', reportId: populated._id, status: 'ACKNOWLEDGED' },
      });
    }
  } catch (err) { console.error('[Push] Failed to send targeted notification:', err); }

  res.json(populated);
};

// @desc    Bulk update report status (offline sync)
const bulkUpdateReportStatus = async (req, res) => {
  const { updates } = req.body;
  if (!updates || !Array.isArray(updates)) return res.status(400).json({ message: 'Invalid updates array' });

  const results = [];
  for (const update of updates) {
    try {
      const report = EmergencyReport.findById(update.reportId);
      if (report) {
        const userId = update.updatedBy?._id || update.updatedBy || req.user._id;
        const alreadyApplied = report.statusHistory.some(
          h => h.status === update.status && (h.updatedBy?._id || h.updatedBy) === userId
        );
        report.status = update.status;
        if (!alreadyApplied) {
          report.statusHistory.push({ status: update.status, updatedBy: userId, timestamp: update.updatedAt || new Date() });
        }
        const populated = await EmergencyReport.save(report);
        if (ioInstance) ioInstance.emit('report:updated', populated);
        results.push({ reportId: update.reportId, success: true });
      } else {
        results.push({ reportId: update.reportId, success: false, message: 'Report not found' });
      }
    } catch (err) {
      results.push({ reportId: update.reportId, success: false, message: err.message });
    }
  }
  res.json({ results });
};

// @desc    Get current user's reports
const getMyReports = async (req, res) => {
  const reports = EmergencyReport.find({ user: req.user._id }, { sort: { createdAt: -1 } });
  res.json(reports);
};

// @desc    Get unseen reports count
const getUnseenReportsCount = async (req, res) => {
  const user = User.findById(req.user._id);
  if (!user) return res.status(404).json({ message: 'User not found' });

  const lastSeen = user.lastSeenReport || new Date(0);
  const count = EmergencyReport.countDocuments({
    createdAt: { $gt: lastSeen },
    status: { $ne: 'RESOLVED' },
  });
  res.json({ count });
};

// ============================================================
// DOCX REPORT GENERATOR (formal justified format)
// ============================================================

const DARK_BLUE = '1B3A5C';
const RED = 'C0392B';
const LIGHT_BG = 'EBF2FA';
const WHITE = 'FFFFFF';

const hr = () => new Paragraph({
  border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: DARK_BLUE } },
  spacing: { before: 100, after: 100 },
});

const spacer = (pts = 120) => new Paragraph({ spacing: { before: pts, after: 0 } });

const sectionHeading = (text) => new Paragraph({
  children: [new TextRun({ text, bold: true, size: 22, color: WHITE, font: 'Calibri' })],
  alignment: AlignmentType.LEFT,
  shading: { type: ShadingType.CLEAR, color: DARK_BLUE, fill: DARK_BLUE },
  spacing: { before: 240, after: 80 },
  indent: { left: 120, right: 120 },
});

const labelValue = (label, value) => new Paragraph({
  alignment: AlignmentType.JUSTIFIED,
  spacing: { before: 60, after: 60 },
  indent: { left: 240, right: 240 },
  children: [
    new TextRun({ text: `${label}: `, bold: true, size: 20, font: 'Calibri', color: DARK_BLUE }),
    new TextRun({ text: value || 'N/A', size: 20, font: 'Calibri' }),
  ],
});

const bodyText = (text) => new Paragraph({
  alignment: AlignmentType.JUSTIFIED,
  spacing: { before: 60, after: 80 },
  indent: { left: 240, right: 240 },
  children: [new TextRun({ text: text || '', size: 20, font: 'Calibri' })],
});

const buildStatusTable = (statusHistory) => {
  const headerRow = new TableRow({
    tableHeader: true,
    children: ['Status', 'Updated By', 'Role', 'Date & Time'].map(h =>
      new TableCell({
        shading: { type: ShadingType.CLEAR, color: DARK_BLUE, fill: DARK_BLUE },
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: h, bold: true, color: WHITE, size: 18, font: 'Calibri' })],
        })],
      })
    ),
  });

  const sorted = [...(statusHistory || [])].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  const dataRows = sorted.length > 0 ? sorted.map((h, i) => {
    const updater = h.updatedBy ? `${h.updatedBy.firstName || ''} ${h.updatedBy.lastName || ''}`.trim() : 'System';
    const role = h.updatedBy?.role || '—';
    const ts = new Date(h.timestamp).toLocaleString();
    const fill = i % 2 === 0 ? LIGHT_BG : WHITE;
    return new TableRow({
      children: [h.status, updater, role, ts].map(val =>
        new TableCell({
          shading: { type: ShadingType.CLEAR, color: fill, fill },
          verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: val, size: 18, font: 'Calibri' })],
          })],
        })
      ),
    });
  }) : [new TableRow({
    children: [new TableCell({
      columnSpan: 4,
      children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: 'No status history recorded.', italics: true, size: 18, font: 'Calibri' })],
      })],
    })],
  })];

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...dataRows],
  });
};

const generateSingleReportDoc = async (report) => {
  const reporterName = report.user
    ? `${report.user.lastName}, ${report.user.firstName}`
    : 'Unknown Reporter';
  const reporterRole = report.user?.role || 'N/A';
  const location = report.location?.description ||
    (report.location?.latitude
      ? `${report.location.latitude.toFixed(5)}, ${report.location.longitude.toFixed(5)}`
      : 'Not provided');

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 20 },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 },
        },
      },
      children: [
        // ── HEADER ──────────────────────────────────────────
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 60 },
          children: [new TextRun({ text: 'SAFEPOINT EMERGENCY MONITORING SYSTEM', bold: true, size: 32, color: DARK_BLUE, font: 'Calibri' })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 60 },
          children: [new TextRun({ text: 'Saint Gabriel College', size: 22, color: '555555', font: 'Calibri', italics: true })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 200 },
          children: [new TextRun({ text: 'OFFICIAL INCIDENT REPORT DOCUMENT', bold: true, size: 24, color: RED, font: 'Calibri' })],
        }),
        hr(),

        // ── INCIDENT INFORMATION ─────────────────────────────
        sectionHeading('INCIDENT INFORMATION'),
        labelValue('Report ID', (report._id || '').toString().toUpperCase()),
        labelValue('Date & Time Reported', new Date(report.createdAt).toLocaleString()),
        labelValue('Incident Type', report.type || 'N/A'),
        labelValue('Current Status', report.status || 'N/A'),

        // ── REPORTER DETAILS ─────────────────────────────────
        sectionHeading('REPORTER DETAILS'),
        labelValue('Full Name', reporterName),
        labelValue('Role / Position', reporterRole),
        labelValue('Location of Incident', location),

        // ── INCIDENT DESCRIPTION ─────────────────────────────
        sectionHeading('INCIDENT DESCRIPTION'),
        bodyText(
          `A ${(report.type || 'N/A').toLowerCase()}-related emergency incident was reported through the SafePoint system. ` +
          `The report was received and processed by the SafePoint Admin Panel. ` +
          `Appropriate status updates were recorded as part of the emergency response workflow.`
        ),
        spacer(80),
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { before: 60, after: 60 },
          indent: { left: 240, right: 240 },
          children: [
            new TextRun({ text: 'Reporter\'s Message: ', bold: true, size: 20, font: 'Calibri', color: DARK_BLUE }),
            new TextRun({ text: `"${report.message || 'No message provided'}"`, italics: true, size: 20, font: 'Calibri' }),
          ],
        }),

        // ── STATUS HISTORY ───────────────────────────────────
        sectionHeading('STATUS HISTORY / RESPONSE LOG'),
        spacer(80),
        buildStatusTable(report.statusHistory),

        // ── FINAL RESOLUTION ─────────────────────────────────
        sectionHeading('FINAL RESOLUTION'),
        bodyText(
          report.status === 'RESOLVED'
            ? 'The reported incident has been successfully resolved. All actions taken have been logged within the SafePoint system for accountability and record-keeping purposes.'
            : `The reported incident is currently marked as "${report.status}". The SafePoint Admin Panel continues to monitor this incident. All actions taken are recorded for accountability purposes.`
        ),

        // ── AUTHENTICATION ───────────────────────────────────
        sectionHeading('DOCUMENT AUTHENTICATION'),
        bodyText(
          'This document was automatically generated by the SafePoint Admin Panel and serves as an official record of the reported incident and its complete response timeline.'
        ),
        spacer(80),
        labelValue('Generated On', new Date().toLocaleString()),
        labelValue('System', 'SafePoint Emergency Monitoring System'),
        labelValue('Institution', 'Saint Gabriel College'),
        spacer(200),
        hr(),
        spacer(160),
        new Paragraph({
          alignment: AlignmentType.LEFT,
          indent: { left: 240 },
          spacing: { before: 80, after: 40 },
          children: [new TextRun({ text: 'Authorized by:', bold: true, size: 20, font: 'Calibri', color: DARK_BLUE })],
        }),
        new Paragraph({
          alignment: AlignmentType.LEFT,
          indent: { left: 240 },
          spacing: { before: 40, after: 40 },
          children: [new TextRun({ text: 'SafePoint Administration Office', size: 20, font: 'Calibri' })],
        }),
        spacer(320),
        new Paragraph({
          alignment: AlignmentType.LEFT,
          indent: { left: 240 },
          children: [
            new TextRun({ text: 'Signature:  ', bold: true, size: 20, font: 'Calibri' }),
            new TextRun({ text: '___________________________________', size: 20, font: 'Calibri' }),
          ],
        }),
        spacer(120),
        new Paragraph({
          alignment: AlignmentType.LEFT,
          indent: { left: 240 },
          children: [
            new TextRun({ text: 'Date:           ', bold: true, size: 20, font: 'Calibri' }),
            new TextRun({ text: '___________________________________', size: 20, font: 'Calibri' }),
          ],
        }),
      ],
    }],
  });

  return Packer.toBuffer(doc);
};

const generateBulkReportDoc = async (reports) => {
  const children = [];

  // Cover page
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 80 },
      children: [new TextRun({ text: 'SAFEPOINT EMERGENCY MONITORING SYSTEM', bold: true, size: 36, color: DARK_BLUE, font: 'Calibri' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 80 },
      children: [new TextRun({ text: 'Saint Gabriel College', size: 24, color: '555555', italics: true, font: 'Calibri' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 80 },
      children: [new TextRun({ text: 'BULK INCIDENT REPORT EXPORT', bold: true, size: 28, color: RED, font: 'Calibri' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 200 },
      children: [new TextRun({ text: `Total Reports: ${reports.length}  |  Generated: ${new Date().toLocaleString()}`, size: 20, font: 'Calibri' })],
    }),
    hr(),
    spacer(200),
  );

  reports.forEach((report, idx) => {
    const reporterName = report.user
      ? `${report.user.lastName}, ${report.user.firstName}`
      : 'Unknown Reporter';
    const location = report.location?.description ||
      (report.location?.latitude
        ? `${report.location.latitude.toFixed(5)}, ${report.location.longitude.toFixed(5)}`
        : 'Not provided');

    children.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { before: 240, after: 80 },
        children: [new TextRun({ text: `REPORT ${idx + 1} OF ${reports.length}`, bold: true, size: 28, color: DARK_BLUE, font: 'Calibri' })],
        shading: { type: ShadingType.CLEAR, color: LIGHT_BG, fill: LIGHT_BG },
        indent: { left: 120, right: 120 },
      }),
      sectionHeading('INCIDENT INFORMATION'),
      labelValue('Report ID', (report._id || '').toString().toUpperCase()),
      labelValue('Date & Time Reported', new Date(report.createdAt).toLocaleString()),
      labelValue('Incident Type', report.type || 'N/A'),
      labelValue('Current Status', report.status || 'N/A'),
      sectionHeading('REPORTER DETAILS'),
      labelValue('Full Name', reporterName),
      labelValue('Role / Position', report.user?.role || 'N/A'),
      labelValue('Location of Incident', location),
      sectionHeading('MESSAGE'),
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { before: 60, after: 80 },
        indent: { left: 240, right: 240 },
        children: [new TextRun({ text: `"${report.message || 'No message provided'}"`, italics: true, size: 20, font: 'Calibri' })],
      }),
      sectionHeading('STATUS HISTORY'),
      spacer(80),
      buildStatusTable(report.statusHistory),
      spacer(80),
      hr(),
    );
  });

  // Footer
  children.push(
    spacer(200),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `Generated by SafePoint Admin Panel  |  ${new Date().toLocaleString()}`, size: 18, italics: true, color: '888888', font: 'Calibri' })],
    }),
  );

  const doc = new Document({
    sections: [{
      properties: { page: { margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } } },
      children,
    }],
  });

  return Packer.toBuffer(doc);
};


// Helper: build template data from a report object
const buildReportData = (report) => {
  const historyLines = (report.statusHistory || [])
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .map(h => {
      const updater = h.updatedBy
        ? `${h.updatedBy.firstName || ''} ${h.updatedBy.lastName || ''}`.trim()
        : 'System';
      return `${h.status} — ${updater} — ${new Date(h.timestamp).toLocaleString()}`;
    })
    .join('\n');

  return {
    reportId: (report._id || '').toString().toUpperCase(),
    dateReported: new Date(report.createdAt).toLocaleString(),
    reportType: report.type || 'N/A',
    status: report.status || 'N/A',
    reporterFirst: report.user?.firstName || 'Unknown',
    reporterLast: report.user?.lastName || 'N/A',
    reporterName: report.user ? `${report.user.lastName}, ${report.user.firstName}` : 'Unknown Reporter',
    reporterRole: report.user?.role || 'N/A',
    location: report.location?.description || (report.location?.latitude ? `${report.location.latitude.toFixed(4)}, ${report.location.longitude.toFixed(4)}` : 'N/A'),
    message: report.message || 'No message provided',
    statusHistory: historyLines || 'No history recorded',
    generatedOn: new Date().toLocaleDateString(),
  };
};

// @desc    Extract single report as .docx
// @route   GET /api/reports/:id/extract
const extractReport = async (req, res) => {
  try {
    const report = EmergencyReport.findById(req.params.id);
    if (!report) return res.status(404).json({ message: 'Report not found' });

    const buf = await generateSingleReportDoc(report);
    const reporterName = report.user ? `${report.user.firstName} ${report.user.lastName}` : 'Unknown';
    const dateStr = new Date(report.createdAt).toLocaleDateString().replace(/\//g, '-');
    const filename = `${reporterName}-${dateStr} Incident Report.docx`;

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.send(buf);
  } catch (err) {
    console.error('[Extract] Error:', err.message);
    res.status(500).json({ message: 'Error generating report document' });
  }
};

// @desc    Bulk extract multiple reports as a single .docx
// @route   POST /api/reports/bulk-extract
const bulkExtractReports = async (req, res) => {
  try {
    const { ids, filename } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'No report IDs provided' });
    }

    const reports = ids.map(id => EmergencyReport.findById(id)).filter(Boolean);
    if (reports.length === 0) {
      return res.status(404).json({ message: 'No matching reports found' });
    }

    const buf = await generateBulkReportDoc(reports);
    const outFilename = `${filename || 'Bulk Reports'}.docx`;

    res.setHeader('Content-Disposition', `attachment; filename="${outFilename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.send(buf);
  } catch (err) {
    console.error('[BulkExtract] Error:', err.message);
    res.status(500).json({ message: 'Error generating bulk report document' });
  }
};

module.exports = {
  createReport, getReports, getMyReports, getActiveReports,
  getUnseenReportsCount, updateReportStatus, acknowledgeReport,
  bulkUpdateReportStatus, setIO, extractReport, bulkExtractReports,
};