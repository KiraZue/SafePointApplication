import AsyncStorage from '@react-native-async-storage/async-storage';
import api, { BASE_URL } from './api';

const OFFLINE_QUEUE_KEY = 'OFFLINE_QUEUE';
const OFFLINE_REPORTS_KEY = 'OFFLINE_REPORTS';
const HOSTED_REPORTS_KEY = 'HOSTED_REPORTS';
const SYNCED_REPORT_IDS_KEY = 'SYNCED_REPORT_IDS';
const SYNCED_STATUS_UPDATES_KEY = 'SYNCED_STATUS_UPDATES';
const OFFLINE_TO_ONLINE_ID_MAP_KEY = 'OFFLINE_TO_ONLINE_ID_MAP';

// ID Mapping functions
const mapOfflineToOnlineId = async (offlineId, onlineId) => {
  try {
    const mapStr = await AsyncStorage.getItem(OFFLINE_TO_ONLINE_ID_MAP_KEY);
    const map = mapStr ? JSON.parse(mapStr) : {};
    map[offlineId] = onlineId;
    await AsyncStorage.setItem(OFFLINE_TO_ONLINE_ID_MAP_KEY, JSON.stringify(map));
  } catch (e) {
    console.error('[IDMap] Error:', e);
  }
};

const getOnlineId = async (offlineId) => {
  try {
    const mapStr = await AsyncStorage.getItem(OFFLINE_TO_ONLINE_ID_MAP_KEY);
    const map = mapStr ? JSON.parse(mapStr) : {};
    return map[offlineId] || null;
  } catch (e) {
    return null;
  }
};

// Queue operations
export const addToQueue = async (request) => {
  try {
    const queueStr = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    const queue = queueStr ? JSON.parse(queueStr) : [];
    queue.push({ ...request, timestamp: Date.now() });
    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.error('[Queue] Error adding:', e);
  }
};

// Offline report operations
export const addOfflineReport = async (report) => {
  try {
    const reportsStr = await AsyncStorage.getItem(OFFLINE_REPORTS_KEY);
    const reports = reportsStr ? JSON.parse(reportsStr) : [];
    
    const offlineReport = {
      ...report,
      _id: `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
      status: 'REPORTED',
      statusHistory: [],
      isOffline: true,
      synced: false,
      syncedToBackend: false,
      fromHost: false,
      hostedInGroup: false
    };
    
    reports.push(offlineReport);
    await AsyncStorage.setItem(OFFLINE_REPORTS_KEY, JSON.stringify(reports));
    console.log('[Offline] Added report:', offlineReport._id);
    return offlineReport;
  } catch (e) {
    console.error('[Offline] Error adding report:', e);
    return null;
  }
};

// Hosted report operations with CRITICAL persistence flag preservation
export const addHostedReport = async (report) => {
  try {
    const hostedStr = await AsyncStorage.getItem(HOSTED_REPORTS_KEY);
    const hosted = hostedStr ? JSON.parse(hostedStr) : [];
    
    const existingIndex = hosted.findIndex(r => r._id === report._id);
    if (existingIndex !== -1) {
      console.log('[Hosted] Report already exists:', report._id);
      return hosted[existingIndex];
    }
    
    const hostedReport = {
      ...report,
      hostedInGroup: true,
      isOffline: true,
      synced: false,
      syncedToBackend: report.syncedToBackend || false,
      fromHost: false,
      sharedFromOnline: report.sharedFromOnline || false,
      _isPersistentShare: report._isPersistentShare || false,
      sharedAt: report.sharedAt || new Date().toISOString(),
      statusHistory: report.statusHistory || []
    };
    
    hosted.push(hostedReport);
    await AsyncStorage.setItem(HOSTED_REPORTS_KEY, JSON.stringify(hosted));
    console.log('[Hosted] Added report:', hostedReport._id, '| Persistent:', hostedReport._isPersistentShare);
    return hostedReport;
  } catch (e) {
    console.error('[Hosted] Error adding:', e);
    return null;
  }
};

export const removeHostedReport = async (reportId) => {
  try {
    const hostedStr = await AsyncStorage.getItem(HOSTED_REPORTS_KEY);
    const hosted = hostedStr ? JSON.parse(hostedStr) : [];
    
    const filtered = hosted.filter(r => r._id !== reportId);
    await AsyncStorage.setItem(HOSTED_REPORTS_KEY, JSON.stringify(filtered));
    console.log('[Hosted] Removed report:', reportId);
    return true;
  } catch (e) {
    console.error('[Hosted] Error removing:', e);
    return false;
  }
};

// CRITICAL FIX: Preserve ALL persistence flags during update
export const updateHostedReport = async (reportId, updatedData) => {
  try {
    const hostedStr = await AsyncStorage.getItem(HOSTED_REPORTS_KEY);
    const hosted = hostedStr ? JSON.parse(hostedStr) : [];
    
    const reportIndex = hosted.findIndex(r => r._id === reportId);
    
    if (reportIndex !== -1) {
      const oldReport = hosted[reportIndex];
      
      // Preserve critical flags
      hosted[reportIndex] = {
        ...oldReport,
        ...updatedData,
        hostedInGroup: true,
        sharedFromOnline: oldReport.sharedFromOnline,
        _isPersistentShare: oldReport._isPersistentShare,
        sharedAt: oldReport.sharedAt,
        statusHistory: updatedData.statusHistory || oldReport.statusHistory || []
      };
      
      await AsyncStorage.setItem(HOSTED_REPORTS_KEY, JSON.stringify(hosted));
      return hosted[reportIndex];
    }
    
    return null;
  } catch (e) {
    console.error('[Hosted] Error updating:', e);
    return null;
  }
};

export const getHostedReports = async () => {
  try {
    const hostedStr = await AsyncStorage.getItem(HOSTED_REPORTS_KEY);
    const hosted = hostedStr ? JSON.parse(hostedStr) : [];
    return hosted.map(r => ({
      ...r,
      hostedInGroup: true,
      statusHistory: r.statusHistory || []
    }));
  } catch (e) {
    console.error('[Hosted] Error getting:', e);
    return [];
  }
};

export const clearHostedReports = async () => {
  try {
    await AsyncStorage.removeItem(HOSTED_REPORTS_KEY);
    console.log('[Hosted] Cleared all reports');
  } catch (e) {
    console.error('[Hosted] Error clearing:', e);
  }
};

// CRITICAL FIX: Only clear non-persistent shared reports
export const clearSharedOnlineReports = async () => {
  try {
    const hostedStr = await AsyncStorage.getItem(HOSTED_REPORTS_KEY);
    const hosted = hostedStr ? JSON.parse(hostedStr) : [];
    
    const reportsToKeep = hosted.filter(r => {
      // Keep client-submitted reports
      if (!r.sharedFromOnline) return true;
      
      // Keep manually shared (persistent) reports
      if (r._isPersistentShare === true) {
        console.log('[Hosted] Keeping persistent share:', r._id);
        return true;
      }
      
      // Remove auto-shared reports
      console.log('[Hosted] Removing auto-shared:', r._id);
      return false;
    });
    
    await AsyncStorage.setItem(HOSTED_REPORTS_KEY, JSON.stringify(reportsToKeep));
    console.log('[Hosted] Cleared non-persistent, kept', reportsToKeep.length);
    return true;
  } catch (e) {
    console.error('[Hosted] Error clearing shared:', e);
    return false;
  }
};

export const getOfflineReports = async () => {
  try {
    const reportsStr = await AsyncStorage.getItem(OFFLINE_REPORTS_KEY);
    return reportsStr ? JSON.parse(reportsStr) : [];
  } catch (e) {
    return [];
  }
};

export const getStoredOfflineReports = async () => {
  try {
    const reportsStr = await AsyncStorage.getItem(OFFLINE_REPORTS_KEY);
    const reports = reportsStr ? JSON.parse(reportsStr) : [];
    return reports
      .filter(r => !r.fromHost && !r.hostedInGroup)
      .map(r => ({
        ...r,
        isOffline: true,
        statusHistory: r.statusHistory || []
      }));
  } catch (e) {
    return [];
  }
};

// Synced report tracking
const addSyncedReportId = async (reportId) => {
  try {
    const syncedIdsStr = await AsyncStorage.getItem(SYNCED_REPORT_IDS_KEY);
    const syncedIds = syncedIdsStr ? JSON.parse(syncedIdsStr) : [];
    if (!syncedIds.includes(reportId)) {
      syncedIds.push(reportId);
      await AsyncStorage.setItem(SYNCED_REPORT_IDS_KEY, JSON.stringify(syncedIds));
    }
  } catch (e) {
    console.error('[Sync] Error adding synced ID:', e);
  }
};

const isSyncedReportId = async (reportId) => {
  try {
    const syncedIdsStr = await AsyncStorage.getItem(SYNCED_REPORT_IDS_KEY);
    const syncedIds = syncedIdsStr ? JSON.parse(syncedIdsStr) : [];
    return syncedIds.includes(reportId);
  } catch (e) {
    return false;
  }
};

// Status update tracking
const generateStatusUpdateKey = (reportId, status, userId) => {
  return `${reportId}_${status}_${userId}`;
};

const addSyncedStatusUpdate = async (reportId, status, userId) => {
  try {
    const key = generateStatusUpdateKey(reportId, status, userId);
    const syncedStr = await AsyncStorage.getItem(SYNCED_STATUS_UPDATES_KEY);
    const synced = syncedStr ? JSON.parse(syncedStr) : [];
    if (!synced.includes(key)) {
      synced.push(key);
      await AsyncStorage.setItem(SYNCED_STATUS_UPDATES_KEY, JSON.stringify(synced));
    }
  } catch (e) {
    console.error('[Sync] Error adding status update:', e);
  }
};

const isSyncedStatusUpdate = async (reportId, status, userId) => {
  try {
    const key = generateStatusUpdateKey(reportId, status, userId);
    const syncedStr = await AsyncStorage.getItem(SYNCED_STATUS_UPDATES_KEY);
    const synced = syncedStr ? JSON.parse(syncedStr) : [];
    return synced.includes(key);
  } catch (e) {
    return false;
  }
};

// CRITICAL FIX: Proper status update with persistence preservation
export const updateOfflineReportStatus = async (reportId, status, user) => {
  try {
    const onlineId = await getOnlineId(reportId);
    const targetId = onlineId || reportId;
    
    let updated = false;
    
    // Update offline reports
    const reportsStr = await AsyncStorage.getItem(OFFLINE_REPORTS_KEY);
    if (reportsStr) {
      let reports = JSON.parse(reportsStr);
      const reportIndex = reports.findIndex(r => r._id === reportId || r._id === targetId);
      
      if (reportIndex !== -1) {
        const report = reports[reportIndex];
        
        if (!report.statusHistory) report.statusHistory = [];
        
        const alreadyHasStatus = report.statusHistory.some(
          h => h.status === status && h.updatedBy && h.updatedBy._id === user?._id
        );
        
        if (!alreadyHasStatus) {
          const statusEntry = {
            status: status,
            updatedBy: {
              _id: user?._id || 'offline_user',
              firstName: user?.firstName || 'Unknown',
              lastName: user?.lastName || 'User',
              role: user?.role || 'User'
            },
            updatedAt: new Date().toISOString(),
            timestamp: new Date().toISOString(),
            syncedToBackend: false
          };
          
          report.statusHistory.push(statusEntry);
          report.status = status;
          
          if (onlineId && report._id !== onlineId) {
            report._id = onlineId;
          }
          
          reports[reportIndex] = report;
          await AsyncStorage.setItem(OFFLINE_REPORTS_KEY, JSON.stringify(reports));
          updated = true;
        } else {
          updated = true;
        }
      }
    }
    
    // Update hosted reports WITH PERSISTENCE PRESERVATION
    const hostedStr = await AsyncStorage.getItem(HOSTED_REPORTS_KEY);
    if (hostedStr) {
      let hosted = JSON.parse(hostedStr);
      const hostedIndex = hosted.findIndex(r => r._id === reportId || r._id === targetId);
      
      if (hostedIndex !== -1) {
        const report = hosted[hostedIndex];
        
        if (!report.statusHistory) report.statusHistory = [];
        
        const alreadyHasStatus = report.statusHistory.some(
          h => h.status === status && h.updatedBy && h.updatedBy._id === user?._id
        );
        
        if (!alreadyHasStatus) {
          const statusEntry = {
            status: status,
            updatedBy: {
              _id: user?._id || 'offline_user',
              firstName: user?.firstName || 'Unknown',
              lastName: user?.lastName || 'User',
              role: user?.role || 'User'
            },
            updatedAt: new Date().toISOString(),
            timestamp: new Date().toISOString(),
            syncedToBackend: false
          };
          
          report.statusHistory.push(statusEntry);
          report.status = status;
          
          if (onlineId && report._id !== onlineId) {
            report._id = onlineId;
          }
          
          // PRESERVE PERSISTENCE FLAGS
          hosted[hostedIndex] = {
            ...report,
            sharedFromOnline: report.sharedFromOnline,
            _isPersistentShare: report._isPersistentShare,
            sharedAt: report.sharedAt
          };
          
          await AsyncStorage.setItem(HOSTED_REPORTS_KEY, JSON.stringify(hosted));
          updated = true;
        } else {
          updated = true;
        }
      }
    }
    
    // Send to host if connected
    if (!updated && BASE_URL.includes('192.168.49.1')) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        
        const response = await fetch(`${BASE_URL}/p2p/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reportId: targetId,
            status: status,
            updatedBy: {
              _id: user?._id,
              firstName: user?.firstName,
              lastName: user?.lastName,
              role: user?.role
            },
            updatedAt: new Date().toISOString()
          }),
          signal: controller.signal
        });
        
        clearTimeout(timeout);
        
        if (response.ok) {
          return true;
        }
      } catch (e) {
        console.error('[Update] Failed to send to host:', e.message);
      }
    }
    
    return updated;
  } catch (e) {
    console.error('[Update] Error:', e);
    return false;
  }
};

// Mark reports as synced WITH PERSISTENCE PRESERVATION
export const markReportsSynced = async (reportIds) => {
  try {
    const reportsStr = await AsyncStorage.getItem(OFFLINE_REPORTS_KEY);
    if (reportsStr) {
      let reports = JSON.parse(reportsStr);
      reports = reports.map(r => {
        if (reportIds.includes(r._id)) {
          return { ...r, synced: true, syncedToBackend: true };
        }
        return r;
      });
      await AsyncStorage.setItem(OFFLINE_REPORTS_KEY, JSON.stringify(reports));
    }
    
    const hostedStr = await AsyncStorage.getItem(HOSTED_REPORTS_KEY);
    if (hostedStr) {
      let hosted = JSON.parse(hostedStr);
      hosted = hosted.map(r => {
        if (reportIds.includes(r._id)) {
          return {
            ...r,
            synced: true,
            syncedToBackend: true,
            // PRESERVE PERSISTENCE FLAGS
            sharedFromOnline: r.sharedFromOnline,
            _isPersistentShare: r._isPersistentShare,
            sharedAt: r.sharedAt
          };
        }
        return r;
      });
      await AsyncStorage.setItem(HOSTED_REPORTS_KEY, JSON.stringify(hosted));
    }
    
    for (const reportId of reportIds) {
      await addSyncedReportId(reportId);
    }
  } catch (e) {
    console.error('[Sync] Error marking synced:', e);
  }
};

export const markStatusUpdatesSynced = async (reportId, statusUpdates) => {
  try {
    // Update offline reports
    const reportsStr = await AsyncStorage.getItem(OFFLINE_REPORTS_KEY);
    if (reportsStr) {
      let reports = JSON.parse(reportsStr);
      const reportIndex = reports.findIndex(r => r._id === reportId);
      
      if (reportIndex !== -1) {
        const report = reports[reportIndex];
        if (report.statusHistory) {
          report.statusHistory = report.statusHistory.map(entry => {
            const matchingUpdate = statusUpdates.find(
              u => u.status === entry.status && u.updatedBy?._id === entry.updatedBy?._id
            );
            if (matchingUpdate) {
              return { ...entry, syncedToBackend: true };
            }
            return entry;
          });
          
          reports[reportIndex] = report;
          await AsyncStorage.setItem(OFFLINE_REPORTS_KEY, JSON.stringify(reports));
        }
      }
    }
    
    // Update hosted reports WITH PERSISTENCE PRESERVATION
    const hostedStr = await AsyncStorage.getItem(HOSTED_REPORTS_KEY);
    if (hostedStr) {
      let hosted = JSON.parse(hostedStr);
      const hostedIndex = hosted.findIndex(r => r._id === reportId);
      
      if (hostedIndex !== -1) {
        const report = hosted[hostedIndex];
        if (report.statusHistory) {
          report.statusHistory = report.statusHistory.map(entry => {
            const matchingUpdate = statusUpdates.find(
              u => u.status === entry.status && u.updatedBy?._id === entry.updatedBy?._id
            );
            if (matchingUpdate) {
              return { ...entry, syncedToBackend: true };
            }
            return entry;
          });
          
          // PRESERVE PERSISTENCE FLAGS
          hosted[hostedIndex] = {
            ...report,
            sharedFromOnline: report.sharedFromOnline,
            _isPersistentShare: report._isPersistentShare,
            sharedAt: report.sharedAt
          };
          await AsyncStorage.setItem(HOSTED_REPORTS_KEY, JSON.stringify(hosted));
        }
      }
    }
    
    for (const update of statusUpdates) {
      await addSyncedStatusUpdate(reportId, update.status, update.updatedBy?._id || update.updatedBy);
    }
  } catch (e) {
    console.error('[Sync] Error marking status updates:', e);
  }
};

// CRITICAL FIX: Update synced report with persistence preservation
export const updateSyncedOfflineReport = async (onlineReport) => {
  try {
    // Update offline reports
    const reportsStr = await AsyncStorage.getItem(OFFLINE_REPORTS_KEY);
    if (reportsStr) {
      let reports = JSON.parse(reportsStr);
      
      const reportIndex = reports.findIndex(r => {
        if (r._id === onlineReport._id) return true;
        if (r.latitude === onlineReport.location?.latitude &&
            r.longitude === onlineReport.location?.longitude &&
            r.type === onlineReport.type &&
            Math.abs(new Date(r.createdAt).getTime() - new Date(onlineReport.createdAt).getTime()) < 60000) {
          return true;
        }
        return false;
      });
      
      if (reportIndex !== -1) {
        const oldReport = reports[reportIndex];
        const oldOfflineId = oldReport._id;
        
        if (oldOfflineId !== onlineReport._id && oldOfflineId.startsWith('offline_')) {
          await mapOfflineToOnlineId(oldOfflineId, onlineReport._id);
        }
        
        const mergedHistory = [...(onlineReport.statusHistory || [])].map(h => ({
          ...h,
          syncedToBackend: true
        }));
        
        (oldReport.statusHistory || []).forEach(localEntry => {
          const existsOnline = mergedHistory.some(
            h => h.status === localEntry.status &&
                 h.updatedBy?._id === localEntry.updatedBy?._id
          );
          if (!existsOnline) {
            mergedHistory.push(localEntry);
          }
        });
        
        reports[reportIndex] = {
          ...onlineReport,
          _id: onlineReport._id,
          latitude: onlineReport.location?.latitude || oldReport.latitude,
          longitude: onlineReport.location?.longitude || oldReport.longitude,
          location: onlineReport.location,
          isOffline: true,
          synced: true,
          syncedToBackend: true,
          fromHost: oldReport.fromHost,
          hostedInGroup: oldReport.hostedInGroup,
          statusHistory: mergedHistory,
          _originalOfflineId: oldOfflineId
        };
        
        await AsyncStorage.setItem(OFFLINE_REPORTS_KEY, JSON.stringify(reports));
      }
    }
    
    // Update hosted reports WITH PERSISTENCE PRESERVATION
    const hostedStr = await AsyncStorage.getItem(HOSTED_REPORTS_KEY);
    if (hostedStr) {
      let hosted = JSON.parse(hostedStr);
      
      const hostedIndex = hosted.findIndex(r => r._id === onlineReport._id);
      
      if (hostedIndex !== -1) {
        const oldReport = hosted[hostedIndex];
        
        const mergedHistory = [...(onlineReport.statusHistory || [])].map(h => ({
          ...h,
          syncedToBackend: true
        }));
        
        (oldReport.statusHistory || []).forEach(localEntry => {
          const existsOnline = mergedHistory.some(
            h => h.status === localEntry.status &&
                 h.updatedBy?._id === localEntry.updatedBy?._id
          );
          if (!existsOnline) {
            mergedHistory.push(localEntry);
          }
        });
        
        // PRESERVE ALL PERSISTENCE FLAGS
        hosted[hostedIndex] = {
          ...onlineReport,
          _id: onlineReport._id,
          latitude: onlineReport.location?.latitude || oldReport.latitude,
          longitude: onlineReport.location?.longitude || oldReport.longitude,
          location: onlineReport.location,
          isOffline: true,
          synced: true,
          syncedToBackend: true,
          fromHost: false,
          hostedInGroup: true,
          sharedFromOnline: oldReport.sharedFromOnline,
          _isPersistentShare: oldReport._isPersistentShare,
          sharedAt: oldReport.sharedAt,
          statusHistory: mergedHistory
        };
        
        await AsyncStorage.setItem(HOSTED_REPORTS_KEY, JSON.stringify(hosted));
      }
    }
  } catch (e) {
    console.error('[Update] Error updating synced report:', e);
  }
};

// Utility functions
export const hasPending = async () => {
  try {
    const queue = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    const reports = await AsyncStorage.getItem(OFFLINE_REPORTS_KEY);
    const hosted = await AsyncStorage.getItem(HOSTED_REPORTS_KEY);
    
    const queueCount = queue ? JSON.parse(queue).length : 0;
    const allReports = reports ? JSON.parse(reports) : [];
    const allHosted = hosted ? JSON.parse(hosted) : [];
    
    const reportsCount = allReports.filter(r => !r.syncedToBackend && !r.fromHost).length;
    const hostedCount = allHosted.filter(r => !r.syncedToBackend).length;
    
    return queueCount > 0 || reportsCount > 0 || hostedCount > 0;
  } catch (e) {
    return false;
  }
};

export const getPendingCount = async () => {
  try {
    const queue = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    const reports = await AsyncStorage.getItem(OFFLINE_REPORTS_KEY);
    const hosted = await AsyncStorage.getItem(HOSTED_REPORTS_KEY);
    
    const queueCount = queue ? JSON.parse(queue).length : 0;
    const allReports = reports ? JSON.parse(reports) : [];
    const allHosted = hosted ? JSON.parse(hosted) : [];
    
    const reportsCount = allReports.filter(r => !r.syncedToBackend && !r.fromHost).length;
    const hostedCount = allHosted.filter(r => !r.syncedToBackend).length;
    
    return queueCount + reportsCount + hostedCount;
  } catch (e) {
    return 0;
  }
};

export const isAllSynced = async () => {
  try {
    const pending = await hasPending();
    return !pending;
  } catch (e) {
    return false;
  }
};

export const clearAllOfflineData = async () => {
  try {
    await AsyncStorage.removeItem(OFFLINE_QUEUE_KEY);
    await AsyncStorage.removeItem(SYNCED_REPORT_IDS_KEY);
    return { success: true, message: 'Queue cleared, reports preserved' };
  } catch (e) {
    console.error('[Clear] Error:', e);
    return { success: false, message: 'Failed to clear offline data' };
  }
};

export const clearIfAllSent = async () => {
  try {
    await AsyncStorage.removeItem(OFFLINE_QUEUE_KEY);
  } catch (e) {}
};

// Main sync functions
export const syncToBackend = async () => {
  try {
    const queueStr = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    const queue = queueStr ? JSON.parse(queueStr) : [];
    
    const reportsStr = await AsyncStorage.getItem(OFFLINE_REPORTS_KEY);
    const allReports = reportsStr ? JSON.parse(reportsStr) : [];
    
    const hostedStr = await AsyncStorage.getItem(HOSTED_REPORTS_KEY);
    const allHosted = hostedStr ? JSON.parse(hostedStr) : [];
    
    const reportsToSync = [
      ...allReports.filter(r => !r.syncedToBackend && !r.fromHost),
      ...allHosted.filter(r => !r.syncedToBackend && !r.hostedFromOnline && !r.sharedFromOnline)
    ];
    
    if (queue.length === 0 && reportsToSync.length === 0) {
      return true;
    }

    console.log(`[Sync] Starting: ${reportsToSync.length} reports`);
    const failedQueue = [];
    const syncedReportIds = [];
    
    // Sync queue
    for (const req of queue) {
      try {
        await api.request({
          method: req.method || 'POST',
          url: req.url,
          data: req.data,
          headers: req.headers,
          timeout: 15000
        });
      } catch (e) {
        failedQueue.push(req);
      }
    }
    
    // Sync reports
    for (const report of reportsToSync) {
      const alreadySynced = await isSyncedReportId(report._id);
      if (alreadySynced && report.syncedToBackend) {
        continue;
      }
      
      try {
        const location = {};
        if (report.latitude !== undefined && report.longitude !== undefined) {
          location.latitude = report.latitude;
          location.longitude = report.longitude;
        }
        if (report.location) {
          if (report.location.x !== undefined) location.x = report.location.x;
          if (report.location.y !== undefined) location.y = report.location.y;
          if (report.location.description) location.description = report.location.description;
        }
        
        const allStatusHistory = (report.statusHistory || []).map(h => ({
          status: h.status,
          updatedBy: h.updatedBy,
          updatedAt: h.updatedAt || h.timestamp,
          timestamp: h.timestamp || h.updatedAt
        }));
        
        const reportData = {
          type: report.type,
          location: location,
          description: report.description || '',
          imageUri: report.imageUri || null,
          user: report.user,
          createdAt: report.createdAt,
          status: report.status || 'REPORTED',
          statusHistory: allStatusHistory,
          syncedFromOffline: true
        };
        
        const response = await api.post('/reports', reportData, { timeout: 15000 });
        
        if (response.data?._id && report._id.startsWith('offline_')) {
          await mapOfflineToOnlineId(report._id, response.data._id);
          
          // Update hosted reports with new ID and preserve persistence flags
          if (report.hostedInGroup) {
            const hostedReports = hostedStr ? JSON.parse(hostedStr) : [];
            const index = hostedReports.findIndex(r => r._id === report._id);
            if (index !== -1) {
              hostedReports[index] = {
                ...hostedReports[index],
                _id: response.data._id,
                syncedToBackend: true,
                hostedFromOnline: true,
                // PRESERVE
                _isPersistentShare: hostedReports[index]._isPersistentShare,
                sharedFromOnline: hostedReports[index].sharedFromOnline,
                sharedAt: hostedReports[index].sharedAt
              };
              await AsyncStorage.setItem(HOSTED_REPORTS_KEY, JSON.stringify(hostedReports));
            }
          }
          
          // Update offline reports
          if (report.isOffline && !report.fromHost && !report.hostedInGroup) {
            const offlineReports = reportsStr ? JSON.parse(reportsStr) : [];
            const index = offlineReports.findIndex(r => r._id === report._id);
            if (index !== -1) {
              offlineReports[index] = {
                ...offlineReports[index],
                _id: response.data._id,
                syncedToBackend: true
              };
              await AsyncStorage.setItem(OFFLINE_REPORTS_KEY, JSON.stringify(offlineReports));
            }
          }
        }
        
        syncedReportIds.push(response.data?._id || report._id);
        await addSyncedReportId(response.data?._id || report._id);
        await markStatusUpdatesSynced(response.data?._id || report._id, allStatusHistory);
        
      } catch (e) {
        console.error('[Sync] Failed:', report._id, e.message);
      }
    }
    
    if (failedQueue.length > 0) {
      await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(failedQueue));
    } else {
      await AsyncStorage.removeItem(OFFLINE_QUEUE_KEY);
    }
    
    if (syncedReportIds.length > 0) {
      await markReportsSynced(syncedReportIds);
      console.log(`[Sync] Complete: ${syncedReportIds.length} reports`);
    }

    return failedQueue.length === 0 && syncedReportIds.length === reportsToSync.length;
  } catch (e) {
    console.error('[Sync] Error:', e.message);
    return false;
  }
};

export const syncOfflineReportsToBackend = async (reportIds = null) => {
  try {
    const reportsStr = await AsyncStorage.getItem(OFFLINE_REPORTS_KEY);
    const hostedStr = await AsyncStorage.getItem(HOSTED_REPORTS_KEY);
    
    let allReports = [];
    if (reportsStr) allReports = [...allReports, ...JSON.parse(reportsStr)];
    if (hostedStr) allReports = [...allReports, ...JSON.parse(hostedStr)];
    
    if (allReports.length === 0) return true;
    
    const reportsToSync = reportIds
      ? allReports.filter(r => reportIds.includes(r._id) && !r.fromHost)
      : allReports.filter(r => !r.syncedToBackend && !r.fromHost);
    
    if (reportsToSync.length === 0) return true;
    
    const syncedIds = [];
    
    for (const report of reportsToSync) {
      const alreadySynced = await isSyncedReportId(report._id);
      if (alreadySynced && report.syncedToBackend) {
        syncedIds.push(report._id);
        continue;
      }
      
      try {
        const location = {};
        if (report.latitude !== undefined && report.longitude !== undefined) {
          location.latitude = report.latitude;
          location.longitude = report.longitude;
        }
        if (report.location) {
          if (report.location.x !== undefined) location.x = report.location.x;
          if (report.location.y !== undefined) location.y = report.location.y;
          if (report.location.description) location.description = report.location.description;
        }
        
        const allStatusHistory = (report.statusHistory || []).map(h => ({
          status: h.status,
          updatedBy: h.updatedBy,
          updatedAt: h.updatedAt || h.timestamp,
          timestamp: h.timestamp || h.updatedAt
        }));
        
        const reportData = {
          type: report.type,
          location: location,
          description: report.description || '',
          imageUri: report.imageUri || null,
          user: report.user,
          createdAt: report.createdAt,
          status: report.status || 'REPORTED',
          statusHistory: allStatusHistory,
          syncedFromOffline: true
        };
        
        const response = await api.post('/reports', reportData, { timeout: 15000 });
        
        if (response.data?._id && report._id.startsWith('offline_')) {
          await mapOfflineToOnlineId(report._id, response.data._id);
        }
        
        syncedIds.push(response.data?._id || report._id);
        await addSyncedReportId(response.data?._id || report._id);
        await markStatusUpdatesSynced(response.data?._id || report._id, allStatusHistory);
        
      } catch (e) {
        console.error('[Sync] Failed:', report._id, e.message);
      }
    }
    
    if (syncedIds.length > 0) {
      await markReportsSynced(syncedIds);
      console.log(`[Sync] Complete: ${syncedIds.length} reports`);
    }
    
    return syncedIds.length === reportsToSync.length;
  } catch (e) {
    console.error('[Sync] Error:', e);
    return false;
  }
};

// Host communication
export const drainClientToHost = async (hostUrl) => {
  try {
    const queueStr = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    const queue = queueStr ? JSON.parse(queueStr) : [];
    
    const reportsStr = await AsyncStorage.getItem(OFFLINE_REPORTS_KEY);
    const allReports = reportsStr ? JSON.parse(reportsStr) : [];
    
    const reports = allReports.filter(r => !r.synced && !r.fromHost && !r.hostedInGroup);
    
    if (queue.length === 0 && reports.length === 0) return;

    console.log(`[Drain] Starting: ${reports.length} reports to host`);
    const failedQueue = [];
    const syncedReportIds = [];

    for (const req of queue) {
      try {
        const targetUrl = `${hostUrl}${req.url}`;
        
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);
        
        const response = await fetch(targetUrl, {
          method: req.method || 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(req.headers || {})
          },
          body: JSON.stringify(req.data),
          signal: controller.signal
        });
        
        clearTimeout(timeout);
        
        if (!response.ok) {
          failedQueue.push(req);
        }
      } catch (e) {
        failedQueue.push(req);
      }
    }
    
    for (const report of reports) {
      try {
        const location = {};
        if (report.latitude !== undefined && report.longitude !== undefined) {
          location.latitude = report.latitude;
          location.longitude = report.longitude;
        }
        if (report.location) {
          if (report.location.x !== undefined) location.x = report.location.x;
          if (report.location.y !== undefined) location.y = report.location.y;
          if (report.location.description) location.description = report.location.description;
        }
        
        const reportData = {
          _id: report._id,
          type: report.type,
          location: location,
          description: report.description || '',
          imageUri: report.imageUri || null,
          user: report.user || null,
          createdAt: report.createdAt,
          status: report.status || 'REPORTED',
          statusHistory: report.statusHistory || []
        };
        
        const targetUrl = `${hostUrl}/p2p/report`;
        
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);
        
        const response = await fetch(targetUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ type: 'emergency_report', payload: reportData }),
          signal: controller.signal
        });
        
        clearTimeout(timeout);
        
        if (response.ok) {
          syncedReportIds.push(report._id);
        }
      } catch (e) {
        // Silent fail
      }
    }

    if (failedQueue.length > 0) {
      await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(failedQueue));
    } else {
      await AsyncStorage.removeItem(OFFLINE_QUEUE_KEY);
    }
    
    if (syncedReportIds.length > 0) {
      await markReportsSynced(syncedReportIds);
      console.log(`[Drain] Complete: ${syncedReportIds.length} reports`);
    }
  } catch (e) {
    console.error('[Drain] Error:', e);
  }
};

// Host report fetching with cache
let hostReportsCache = [];
let lastSuccessfulFetch = 0;
const CACHE_DURATION = 8000;

export const fetchHostOfflineReports = async (hostUrl) => {
  try {
    const now = Date.now();
    
    if (now - lastSuccessfulFetch < CACHE_DURATION && hostReportsCache.length > 0) {
      return hostReportsCache;
    }
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    
    const response = await fetch(`${hostUrl}/p2p/offline`, {
      method: 'GET',
      signal: controller.signal
    });
    
    clearTimeout(timeout);
    
    if (response.ok) {
      const data = await response.json();
      const emergencyReports = (data.items || [])
        .filter(item => item.type === 'emergency_report')
        .map(item => ({
          ...item.payload,
          _id: item.id || item.payload._id,
          isOffline: true,
          fromHost: true,
          statusHistory: item.payload?.statusHistory || []
        }));
      
      hostReportsCache = emergencyReports;
      lastSuccessfulFetch = now;
      
      return emergencyReports;
    }
    
    return hostReportsCache;
  } catch (e) {
    return hostReportsCache;
  }
};

export const clearHostReportsCache = () => {
  hostReportsCache = [];
  lastSuccessfulFetch = 0;
};

// Online reports from host with cache
let onlineReportsCache = [];
let lastOnlineFetch = 0;
const ONLINE_CACHE_DURATION = 5000;

export const fetchOnlineReportsFromHost = async (hostUrl) => {
  try {
    const now = Date.now();
    
    if (now - lastOnlineFetch < ONLINE_CACHE_DURATION && onlineReportsCache.length > 0) {
      return onlineReportsCache;
    }
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(`${hostUrl}/p2p/online`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeout);
    
    if (response.ok) {
      const data = await response.json();
      const reports = data.reports || [];
      
      onlineReportsCache = reports;
      lastOnlineFetch = now;
      
      return reports;
    }
    
    return onlineReportsCache;
  } catch (e) {
    return onlineReportsCache;
  }
};

export const clearOnlineReportsCache = () => {
  onlineReportsCache = [];
  lastOnlineFetch = 0;
};