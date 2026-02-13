const EmergencyReport = require('../models/EmergencyReport');
const User = require('../models/User');
const { sendPushNotification } = require('../utils/notification');
const { Server } = require('socket.io');
let ioInstance;
function setIO(io) { ioInstance = io; }

// @desc    Create new report
// @route   POST /api/reports
// @access  Private
const createReport = async (req, res) => {
  const { type, location, status, statusHistory, createdAt, syncedFromOffline, user: reportUser } = req.body;
  const offlineId = req.headers['x-offline-id'];

  const userId = reportUser?._id || reportUser || req.user._id;

  const isOfflineSync = syncedFromOffline === true || (statusHistory && Array.isArray(statusHistory) && statusHistory.length > 0);

  // ✅ CRITICAL FIX: Better duplicate detection with multiple criteria
  if (isOfflineSync && (createdAt || offlineId)) {
    const existingReport = await EmergencyReport.findOne({
      $or: [
        {
          user: userId,
          type,
          'location.latitude': location?.latitude,
          'location.longitude': location?.longitude,
          createdAt: createdAt ? {
            $gte: new Date(new Date(createdAt).getTime() - 30000), // Reduced window to 30s
            $lte: new Date(new Date(createdAt).getTime() + 30000)
          } : undefined
        },
        // Also check by a unique property if we had one, but since we don't, 
        // the location + type + time window is our best bet.
      ].filter(q => q.createdAt !== undefined)
    });

    if (existingReport) {
      console.log('[Report] Duplicate offline report detected, merging status history');
      
      // Merge status history from offline report
      if (statusHistory && Array.isArray(statusHistory)) {
        for (const entry of statusHistory) {
          const entryUserId = entry.updatedBy?._id || entry.updatedBy || userId;
          
          const alreadyExists = existingReport.statusHistory.some(
            h => h.status === entry.status && String(h.updatedBy) === String(entryUserId)
          );
          
          if (!alreadyExists) {
            existingReport.statusHistory.push({
              status: entry.status,
              updatedBy: entryUserId,
              timestamp: entry.updatedAt || entry.timestamp || new Date()
            });
            console.log(`[Report] Added status ${entry.status} from user ${entryUserId}`);
          }
        }
        
        // Sort status history by timestamp
        existingReport.statusHistory.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        // Update main status to the most advanced status
        if (statusHistory.length > 0) {
          const statusPriority = { 'REPORTED': 1, 'ACKNOWLEDGED': 2, 'RESPONDING': 3, 'RESOLVED': 4 };
          let latestStatus = existingReport.status;
          let maxPriority = statusPriority[latestStatus] || 0;
          
          existingReport.statusHistory.forEach(entry => {
            const priority = statusPriority[entry.status] || 0;
            if (priority > maxPriority) {
              maxPriority = priority;
              latestStatus = entry.status;
            }
          });
          
          existingReport.status = latestStatus;
          console.log(`[Report] Updated main status to ${latestStatus}`);
        }
        
        await existingReport.save();
      }
      
      const populated = await EmergencyReport.findById(existingReport._id)
        .populate('user', 'firstName lastName role userCode')
        .populate('statusHistory.updatedBy', 'firstName lastName role userCode');
        
      if (ioInstance) {
        ioInstance.emit('report:updated', populated);
      }
      
      return res.status(200).json(populated);
    }
  }

  // Create new report
  const report = new EmergencyReport({
    user: userId,
    type,
    location,
    status: status || 'REPORTED',
    syncedFromOffline: isOfflineSync,
    ...(createdAt && { createdAt: new Date(createdAt) })
  });

  // If offline report with status history, preserve it
  if (isOfflineSync && statusHistory && Array.isArray(statusHistory)) {
    report.statusHistory = statusHistory.map(entry => {
      const entryUserId = entry.updatedBy?._id || entry.updatedBy || userId;
      return {
        status: entry.status,
        updatedBy: entryUserId,
        timestamp: entry.updatedAt || entry.timestamp || new Date()
      };
    });
    
    // Sort status history by timestamp
    report.statusHistory.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    // Set main status to the most advanced status
    if (statusHistory.length > 0) {
      const statusPriority = { 'REPORTED': 1, 'ACKNOWLEDGED': 2, 'RESPONDING': 3, 'RESOLVED': 4 };
      let latestStatus = 'REPORTED';
      let maxPriority = 0;
      
      report.statusHistory.forEach(entry => {
        const priority = statusPriority[entry.status] || 0;
        if (priority > maxPriority) {
          maxPriority = priority;
          latestStatus = entry.status;
        }
      });
      
      report.status = latestStatus;
      console.log(`[Report] Set initial status to ${latestStatus} from ${statusHistory.length} history entries`);
    }
  }

  const createdReport = await report.save();
  const populated = await EmergencyReport.findById(createdReport._id)
    .populate('user', 'firstName lastName role userCode')
    .populate('statusHistory.updatedBy', 'firstName lastName role userCode');
    
  if (ioInstance) {
    ioInstance.emit('report:created', populated);
  }

  // Send push notification for new reports
  try {
    const activeCount = await EmergencyReport.countDocuments({ status: { $ne: 'RESOLVED' } });
    const locationStr = populated.location?.description || 
                       (populated.location?.latitude ? `${populated.location.latitude.toFixed(4)}, ${populated.location.longitude.toFixed(4)}` : 'Unknown');
    
    await sendPushNotification({
      title: `🚨 New ${populated.type} Alert!`,
      body: `Reporter: ${populated.user?.firstName} ${populated.user?.lastName}\nLoc: ${locationStr}\nTime: ${new Date(populated.createdAt).toLocaleTimeString()}`,
      data: { 
        type: 'NEW_REPORT', 
        reportId: populated._id,
        alertType: populated.type
      },
      badge: activeCount
    });
  } catch (pushErr) {
    console.error('[Push] Failed to send report notification:', pushErr);
  }
  
  console.log(`[Report] Created ${isOfflineSync ? 'offline sync' : 'new'} report:`, createdReport._id, 'Status:', createdReport.status, 'History count:', createdReport.statusHistory.length);
  res.status(201).json(populated);
};

// @desc    Get all reports
// @route   GET /api/reports
// @access  Private/Admin/Security
const getReports = async (req, res) => {
  const reports = await EmergencyReport.find({})
    .populate('user', 'firstName lastName userCode role')
    .populate('statusHistory.updatedBy', 'firstName lastName role userCode')
    .sort({ createdAt: -1 });
  res.json(reports);
};

// @desc    Get active (non-resolved) reports
// @route   GET /api/reports/active
// @access  Private
const getActiveReports = async (req, res) => {
  const reports = await EmergencyReport.find({ status: { $ne: 'RESOLVED' } })
    .select('_id type status location createdAt updatedAt');
  res.json(reports);
};

// @desc    Update report status
// @route   PUT /api/reports/:id/status
// @access  Private/Admin/Security
const updateReportStatus = async (req, res) => {
  const { status } = req.body;
  const report = await EmergencyReport.findById(req.params.id);

  if (report) {
    const alreadyApplied = report.statusHistory.some(
      (h) => h.status === status && String(h.updatedBy) === String(req.user._id)
    );

    report.status = status;
    if (!alreadyApplied) {
      report.statusHistory.push({
        status,
        updatedBy: req.user._id
      });
    }
    
    const updatedReport = await report.save();
    const populated = await EmergencyReport.findById(updatedReport._id)
      .populate('user', 'firstName lastName role userCode')
      .populate('statusHistory.updatedBy', 'firstName lastName role userCode');
    
    if (ioInstance) {
      ioInstance.emit('report:updated', populated);
    }
    
    res.json(populated);
  } else {
    res.status(404).json({ message: 'Report not found' });
  }
};

// @desc    Acknowledge report (Regular users)
// @route   PUT /api/reports/:id/acknowledge
// @access  Private
const acknowledgeReport = async (req, res) => {
  const report = await EmergencyReport.findById(req.params.id);
  
  if (!report) {
    return res.status(404).json({ message: 'Report not found' });
  }
  
  if (report.status === 'RESOLVED') {
    return res.status(400).json({ message: 'Cannot acknowledge resolved report' });
  }

  // Only update main status if it is currently REPORTED
  if (report.status === 'REPORTED') {
    report.status = 'ACKNOWLEDGED';
  }

  const alreadyAcked = report.statusHistory.some(
    (h) => h.status === 'ACKNOWLEDGED' && String(h.updatedBy) === String(req.user._id)
  );
  
  if (!alreadyAcked) {
    report.statusHistory.push({
      status: 'ACKNOWLEDGED',
      updatedBy: req.user._id,
    });
  }
  
  const updated = await report.save();
  const populated = await EmergencyReport.findById(updated._id)
    .populate('user', 'firstName lastName role userCode')
    .populate('statusHistory.updatedBy', 'firstName lastName role userCode');
    
  if (ioInstance) {
    ioInstance.emit('report:updated', populated);
  }
  
  res.json(populated);
};

// @desc    Bulk update report status (for offline sync)
// @route   PUT /api/reports/bulk/status
// @access  Private
const bulkUpdateReportStatus = async (req, res) => {
  const { updates } = req.body;
  
  if (!updates || !Array.isArray(updates)) {
    return res.status(400).json({ message: 'Invalid updates array' });
  }

  const results = [];
  
  for (const update of updates) {
    try {
      const report = await EmergencyReport.findById(update.reportId);
      
      if (report) {
        const userId = update.updatedBy?._id || update.updatedBy || req.user._id;
        const alreadyApplied = report.statusHistory.some(
          (h) => h.status === update.status && String(h.updatedBy) === String(userId)
        );

        report.status = update.status;
        if (!alreadyApplied) {
          report.statusHistory.push({
            status: update.status,
            updatedBy: userId,
            timestamp: update.updatedAt || new Date()
          });
        }
        
        await report.save();
        results.push({ reportId: update.reportId, success: true });
        
        const populated = await EmergencyReport.findById(report._id)
          .populate('user', 'firstName lastName role userCode')
          .populate('statusHistory.updatedBy', 'firstName lastName role userCode');
          
        if (ioInstance) {
          ioInstance.emit('report:updated', populated);
        }
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
// @route   GET /api/reports/my
// @access  Private
const getMyReports = async (req, res) => {
  const reports = await EmergencyReport.find({ user: req.user._id })
    .populate('user', 'firstName lastName userCode role')
    .populate('statusHistory.updatedBy', 'firstName lastName role userCode')
    .sort({ createdAt: -1 });
  res.json(reports);
};

// @desc    Get unseen reports count
// @route   GET /api/reports/unseen
// @access  Private
const getUnseenReportsCount = async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ message: 'User not found' });

  const lastSeen = user.lastSeenReport || new Date(0);
  const count = await EmergencyReport.countDocuments({
    createdAt: { $gt: lastSeen },
    status: { $ne: 'RESOLVED' }
  });

  res.json({ count });
};

module.exports = { 
  createReport, 
  getReports, 
  getMyReports,
  getActiveReports,
  getUnseenReportsCount,
  updateReportStatus, 
  acknowledgeReport, 
  bulkUpdateReportStatus,
  setIO 
};