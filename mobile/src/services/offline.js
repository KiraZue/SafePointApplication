import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import api, { BASE_URL } from './api';
import { isProxyActive, updateHostedReportInMemory, broadcastHostedStatusUpdate, removeHostedReportFromMemory } from '../services/ProxyServer';

const OFFLINE_QUEUE_KEY = 'OFFLINE_QUEUE';
const OFFLINE_REPORTS_KEY = 'OFFLINE_REPORTS';
const HOSTED_REPORTS_KEY = 'HOSTED_REPORTS';
const SYNCED_REPORT_IDS_KEY = 'SYNCED_REPORT_IDS';
const REPORT_HISTORY_KEY = 'REPORT_HISTORY';
const SYNCED_STATUS_UPDATES_KEY = 'SYNCED_STATUS_UPDATES';
const OFFLINE_TO_ONLINE_ID_MAP_KEY = 'OFFLINE_TO_ONLINE_ID_MAP';

// ============================================
// ENHANCED ID MAPPING & REPORT MATCHING
// ============================================

const mapOfflineToOnlineId = async (offlineId, onlineId) => {
  try {
    const mapStr = await AsyncStorage.getItem(OFFLINE_TO_ONLINE_ID_MAP_KEY);
    const map = mapStr ? JSON.parse(mapStr) : {};
    map[offlineId] = onlineId;
    await AsyncStorage.setItem(OFFLINE_TO_ONLINE_ID_MAP_KEY, JSON.stringify(map));
    console.log('[IDMap] Mapped:', offlineId, '→', onlineId);
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

// Enhanced report matching - finds report across all storage locations
const findReportAcrossStorage = async (reportId) => {
  try {
    // Check ID mapping first
    const mappedId = await getOnlineId(reportId);
    const searchIds = mappedId ? [reportId, mappedId] : [reportId];

    // Search offline reports
    const offlineStr = await AsyncStorage.getItem(OFFLINE_REPORTS_KEY);
    if (offlineStr) {
      const offline = JSON.parse(offlineStr);
      for (const id of searchIds) {
        const found = offline.find(r => r._id === id || r._originalOfflineId === id);
        if (found) return { report: found, storage: 'offline', index: offline.indexOf(found) };
      }
    }

    // Search hosted reports
    const hostedStr = await AsyncStorage.getItem(HOSTED_REPORTS_KEY);
    if (hostedStr) {
      const hosted = JSON.parse(hostedStr);
      for (const id of searchIds) {
        const found = hosted.find(r => r._id === id || r._originalOfflineId === id);
        if (found) return { report: found, storage: 'hosted', index: hosted.indexOf(found) };
      }
    }

    return null;
  } catch (e) {
    console.error('[Find] Error finding report:', e);
    return null;
  }
};

// ============================================
// QUEUE OPERATIONS
// ============================================

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

// ============================================
// REPORT HISTORY (Persistence for "My Reports")
// ============================================

export const saveReportHistory = async (reports) => {
  try {
    if (!Array.isArray(reports)) return false;
    await AsyncStorage.setItem(REPORT_HISTORY_KEY, JSON.stringify(reports));
    console.log('[History] Saved', reports.length, 'reports');
    return true;
  } catch (e) {
    console.error('[Offline] Error saving history:', e);
    return false;
  }
};

export const getStoredReportHistory = async () => {
  try {
    const historyStr = await AsyncStorage.getItem(REPORT_HISTORY_KEY);
    return historyStr ? JSON.parse(historyStr) : [];
  } catch (e) {
    console.error('[Offline] Error loading history:', e);
    return [];
  }
};

// ============================================
// OFFLINE REPORT OPERATIONS
// ============================================

export const addOfflineReport = async (report) => {
  try {
    const reportsStr = await AsyncStorage.getItem(OFFLINE_REPORTS_KEY);
    const reports = reportsStr ? JSON.parse(reportsStr) : [];

    // Ensure user data is always included
    if (!report.user) {
      console.warn('[Offline] Report missing user data, adding placeholder');
    }

    const offlineReport = {
      ...report,
      _id: report._id || `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: report.createdAt || new Date().toISOString(),
      status: report.status || 'REPORTED',
      statusHistory: report.statusHistory || [],
      isOffline: true,
      synced: false,
      syncedToBackend: false,
      fromHost: false,
      hostedInGroup: false,
      user: report.user || {
        _id: 'unknown',
        firstName: 'Unknown',
        lastName: 'User',
        role: 'User'
      }
    };

    reports.push(offlineReport);
    await AsyncStorage.setItem(OFFLINE_REPORTS_KEY, JSON.stringify(reports));
    console.log('[Offline] Added report:', offlineReport._id, 'for user:', offlineReport.user._id);
    return offlineReport;
  } catch (e) {
    console.error('[Offline] Error adding report:', e);
    return null;
  }
};

// ============================================
// HOSTED REPORT OPERATIONS
// ============================================

export const addHostedReport = async (report) => {
  try {
    const hostedStr = await AsyncStorage.getItem(HOSTED_REPORTS_KEY);
    const hosted = hostedStr ? JSON.parse(hostedStr) : [];

    const existingIndex = hosted.findIndex(r => r._id === report._id);
    if (existingIndex !== -1) {
      console.log('[Hosted] Report already exists:', report._id);
      return hosted[existingIndex];
    }

    if (!report.user) {
      console.warn('[Hosted] Report missing user data, adding placeholder');
    }

    const hostedReport = {
      ...report,
      hostedInGroup: true,
      isOffline: true,
      synced: false,
      syncedToBackend: report.syncedToBackend || false,
      fromHost: false,
      statusHistory: report.statusHistory || [],
      user: report.user || {
        _id: 'unknown',
        firstName: 'Unknown',
        lastName: 'User',
        role: 'User'
      }
    };

    hosted.push(hostedReport);
    await AsyncStorage.setItem(HOSTED_REPORTS_KEY, JSON.stringify(hosted));
    console.log('[Hosted] Added report:', hostedReport._id, 'for user:', hostedReport.user._id);
    try { DeviceEventEmitter.emit('HOSTED_REPORTS_CHANGED'); } catch (e) { }
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
    try { DeviceEventEmitter.emit('HOSTED_REPORTS_CHANGED'); } catch (e) { }
    return true;
  } catch (e) {
    console.error('[Hosted] Error removing:', e);
    return false;
  }
};

export const updateHostedReport = async (reportId, updatedData) => {
  try {
    const hostedStr = await AsyncStorage.getItem(HOSTED_REPORTS_KEY);
    const hosted = hostedStr ? JSON.parse(hostedStr) : [];

    const reportIndex = hosted.findIndex(r => r._id === reportId);

    if (reportIndex !== -1) {
      const oldReport = hosted[reportIndex];

      hosted[reportIndex] = {
        ...oldReport,
        ...updatedData,
        hostedInGroup: true,
        statusHistory: updatedData.statusHistory || oldReport.statusHistory || [],
        user: updatedData.user || oldReport.user || {
          _id: 'unknown',
          firstName: 'Unknown',
          lastName: 'User',
          role: 'User'
        }
      };

      await AsyncStorage.setItem(HOSTED_REPORTS_KEY, JSON.stringify(hosted));
      console.log('[Hosted] Updated report:', reportId);
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
    let hosted = hostedStr ? JSON.parse(hostedStr) : [];

    // Check for 24h expiry
    const now = Date.now();
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    let modified = false;

    const activeHosted = [];

    for (const report of hosted) {
      const reportTime = new Date(report.createdAt).getTime();
      const isExpired = (now - reportTime) > TWENTY_FOUR_HOURS;

      if (isExpired) {
        if (report.syncedToBackend) {
          console.log('[Hosted] Report expired (24h) and synced, removing:', report._id);
          modified = true;
        } else {
          activeHosted.push(report);
          continue;
        }
      } else {
        activeHosted.push(report);
      }
    }

    if (modified) {
      await AsyncStorage.setItem(HOSTED_REPORTS_KEY, JSON.stringify(activeHosted));
      hosted = activeHosted;
    }

    return hosted.map(r => ({
      ...r,
      hostedInGroup: true,
      statusHistory: r.statusHistory || [],
      user: r.user || {
        _id: 'unknown',
        firstName: 'Unknown',
        lastName: 'User',
        role: 'User'
      }
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
        statusHistory: r.statusHistory || [],
        user: r.user || {
          _id: 'unknown',
          firstName: 'Unknown',
          lastName: 'User',
          role: 'User'
        }
      }));
  } catch (e) {
    return [];
  }
};

// ============================================
// SYNCED REPORT TRACKING
// ============================================

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

// ============================================
// STATUS UPDATE TRACKING
// ============================================

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

// ============================================
// ENHANCED STATUS UPDATE FUNCTION
// ============================================

export const updateOfflineReportStatus = async (reportId, status, user) => {
  try {
    // Use enhanced finder to locate report
    const found = await findReportAcrossStorage(reportId);

    if (!found) {
      console.log('[Update] Report not found locally, attempting host update');

      // Try to update via host if connected
      if (BASE_URL.includes('192.168.49.1')) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10000);

          const response = await fetch(`${BASE_URL}/p2p/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              reportId: reportId,
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
            console.log('[Update] Successfully updated via host');
            return true;
          }
        } catch (e) {
          console.error('[Update] Failed to update via host:', e.message);
        }
      }
      return false;
    }

    const { report, storage } = found;

    // Check if this status update already exists
    const alreadyExists = (report.statusHistory || []).some(
      h => h.status === status && h.updatedBy?._id === user?._id
    );

    if (alreadyExists) {
      console.log('[Update] Status already recorded:', status, 'by', user?._id);
      return true;
    }

    // Create new status entry
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

    const updatedHistory = [...(report.statusHistory || []), statusEntry];
    const updatedReport = {
      ...report,
      status: status,
      statusHistory: updatedHistory
    };

    // Update the appropriate storage
    if (storage === 'offline') {
      const reportsStr = await AsyncStorage.getItem(OFFLINE_REPORTS_KEY);
      const reports = reportsStr ? JSON.parse(reportsStr) : [];
      const index = reports.findIndex(r => r._id === report._id);
      if (index !== -1) {
        reports[index] = updatedReport;
        await AsyncStorage.setItem(OFFLINE_REPORTS_KEY, JSON.stringify(reports));
        console.log('[Update] Updated offline report:', report._id);
      }
    } else if (storage === 'hosted') {
      const hostedStr = await AsyncStorage.getItem(HOSTED_REPORTS_KEY);
      const hosted = hostedStr ? JSON.parse(hostedStr) : [];
      const index = hosted.findIndex(r => r._id === report._id);
      if (index !== -1) {
        hosted[index] = updatedReport;
        await AsyncStorage.setItem(HOSTED_REPORTS_KEY, JSON.stringify(hosted));
        console.log('[Update] Updated hosted report:', report._id);

        // Sync with ProxyServer memory if hosting
        if (isProxyActive()) {
          updateHostedReportInMemory(report._id, updatedReport);
          broadcastHostedStatusUpdate(report._id);
        }
      }
    }

    // Try to sync to backend immediately
    try {
      const onlineId = await getOnlineId(reportId) || reportId;
      await api.put(`/reports/${onlineId}/status`, { status }, { timeout: 10000 });
      console.log('[Update] Synced status to backend immediately');

      // Mark as synced
      await markStatusUpdatesSynced(onlineId, [statusEntry]);
    } catch (e) {
      console.log('[Update] Could not sync to backend immediately, will sync later');
      // Queue for later sync
      await addToQueue({
        method: 'PUT',
        url: `/reports/${report._id}/status`,
        data: { status }
      });
    }

    return true;
  } catch (e) {
    console.error('[Update] Error:', e);
    return false;
  }
};

// ============================================
// MARK REPORTS AS SYNCED
// ============================================

export const markReportsSynced = async (reportIds) => {
  try {
    const reportsStr = await AsyncStorage.getItem(OFFLINE_REPORTS_KEY);
    if (reportsStr) {
      let reports = JSON.parse(reportsStr);
      reports = reports.map(r => {
        if (reportIds.includes(r._id) || reportIds.includes(r._originalOfflineId)) {
          return { ...r, synced: true, syncedToBackend: true };
        }
        return r;
      });
      await AsyncStorage.setItem(OFFLINE_REPORTS_KEY, JSON.stringify(reports));
    }

    // Update hosted reports
    const hostedStr = await AsyncStorage.getItem(HOSTED_REPORTS_KEY);
    if (hostedStr) {
      let hosted = JSON.parse(hostedStr);
      hosted = hosted.map(r => {
        if (reportIds.includes(r._id) || reportIds.includes(r._originalOfflineId)) {
          return { ...r, synced: true, syncedToBackend: true };
        }
        return r;
      });
      await AsyncStorage.setItem(HOSTED_REPORTS_KEY, JSON.stringify(hosted));

      // ✅ FIX: Also update ProxyServer memory if active, otherwise it will overwrite disk with stale data
      if (isProxyActive()) {
        const { updateHostedReportInMemory } = require('../services/ProxyServer'); // safe require

        hosted.forEach(r => {
          if (reportIds.includes(r._id) || reportIds.includes(r._originalOfflineId)) {
            // Update the report in memory to be synced
            updateHostedReportInMemory(r._id, {
              synced: true,
              syncedToBackend: true
            });
          }
        });
        console.log('[Sync] Updated ProxyServer memory for synced reports');
      }
    }

    for (const reportId of reportIds) {
      await addSyncedReportId(reportId);
    }

    console.log('[Sync] Marked', reportIds.length, 'reports as synced');
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
      const reportIndex = reports.findIndex(r => r._id === reportId || r._originalOfflineId === reportId);

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

    // Update hosted reports
    const hostedStr = await AsyncStorage.getItem(HOSTED_REPORTS_KEY);
    if (hostedStr) {
      let hosted = JSON.parse(hostedStr);
      const hostedIndex = hosted.findIndex(r => r._id === reportId || r._originalOfflineId === reportId);

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

          hosted[hostedIndex] = report;
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

// ============================================
// ENHANCED UPDATE SYNCED REPORT
// ============================================

export const updateSyncedOfflineReport = async (onlineReport) => {
  try {
    let updated = false;

    // Update offline reports
    const reportsStr = await AsyncStorage.getItem(OFFLINE_REPORTS_KEY);
    if (reportsStr) {
      let reports = JSON.parse(reportsStr);

      const reportIndex = reports.findIndex(r => {
        if (r._id === onlineReport._id) return true;
        if (r._originalOfflineId === onlineReport._id) return true;
        // Fuzzy match by location and type
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

        // Merge status histories
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

        mergedHistory.sort((a, b) => {
          const timeA = new Date(a.updatedAt || a.timestamp || 0).getTime();
          const timeB = new Date(b.updatedAt || b.timestamp || 0).getTime();
          return timeB - timeA;
        });

        const latestStatus = mergedHistory.length > 0 ? mergedHistory[0].status : onlineReport.status;

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
          status: latestStatus,
          statusHistory: mergedHistory,
          _originalOfflineId: oldOfflineId,
          user: onlineReport.user || oldReport.user || {
            _id: 'unknown',
            firstName: 'Unknown',
            lastName: 'User',
            role: 'User'
          }
        };

        await AsyncStorage.setItem(OFFLINE_REPORTS_KEY, JSON.stringify(reports));
        updated = true;
        console.log('[Update] Synced offline report:', oldOfflineId, '→', onlineReport._id);
      }
    }

    // Update hosted reports
    const hostedStr = await AsyncStorage.getItem(HOSTED_REPORTS_KEY);
    if (hostedStr) {
      let hosted = JSON.parse(hostedStr);

      const hostedIndex = hosted.findIndex(r => r._id === onlineReport._id || r._originalOfflineId === onlineReport._id);

      if (hostedIndex !== -1) {
        const oldReport = hosted[hostedIndex];

        // Merge status histories
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

        mergedHistory.sort((a, b) => {
          const timeA = new Date(a.updatedAt || a.timestamp || 0).getTime();
          const timeB = new Date(b.updatedAt || b.timestamp || 0).getTime();
          return timeB - timeA;
        });

        const latestStatus = mergedHistory.length > 0 ? mergedHistory[0].status : onlineReport.status;

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
          status: latestStatus,
          statusHistory: mergedHistory,
          user: onlineReport.user || oldReport.user || {
            _id: 'unknown',
            firstName: 'Unknown',
            lastName: 'User',
            role: 'User'
          }
        };

        await AsyncStorage.setItem(HOSTED_REPORTS_KEY, JSON.stringify(hosted));
        updated = true;
        console.log('[Update] Synced hosted report:', onlineReport._id);
      }
    }

    return updated;
  } catch (e) {
    console.error('[Update] Error updating synced report:', e);
    return false;
  }
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

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
  } catch (e) { }
};

// ============================================
// MAIN SYNC FUNCTIONS
// ============================================

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
      ...allHosted.filter(r => !r.syncedToBackend)
    ];

    if (queue.length === 0 && reportsToSync.length === 0) {
      return true;
    }

    console.log(`[Sync] Starting: ${reportsToSync.length} reports, ${queue.length} queue items`);
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
        console.error('[Sync] Queue item failed:', e.message);
        failedQueue.push(req);
      }
    }

    // Sync reports
    for (const report of reportsToSync) {
      const alreadySynced = await isSyncedReportId(report._id);
      if (alreadySynced && report.syncedToBackend) {
        console.log('[Sync] Skipping already synced:', report._id);
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
          user: report.user || {
            _id: 'unknown',
            firstName: 'Unknown',
            lastName: 'User',
            role: 'User'
          },
          createdAt: report.createdAt,
          status: report.status || 'REPORTED',
          statusHistory: allStatusHistory,
          syncedFromOffline: true
        };

        const response = await api.post('/reports', reportData, {
          timeout: 15000,
          headers: {
            'X-Offline-ID': report._id
          }
        });

        if (response.data?._id && typeof report._id === 'string' && report._id.startsWith('offline_')) {
          await mapOfflineToOnlineId(report._id, response.data._id);

          // Update the local storage with new ID
          if (report.hostedInGroup) {
            await updateHostedReport(report._id, {
              _id: response.data._id,
              syncedToBackend: true,
              _originalOfflineId: report._id
            });
          } else {
            const found = await findReportAcrossStorage(report._id);
            if (found && found.storage === 'offline') {
              const offlineReports = reportsStr ? JSON.parse(reportsStr) : [];
              const index = offlineReports.findIndex(r => r._id === report._id);
              if (index !== -1) {
                offlineReports[index] = {
                  ...offlineReports[index],
                  _id: response.data._id,
                  syncedToBackend: true,
                  _originalOfflineId: report._id
                };
                await AsyncStorage.setItem(OFFLINE_REPORTS_KEY, JSON.stringify(offlineReports));
              }
            }
          }
        }

        syncedReportIds.push(response.data?._id || report._id);
        await addSyncedReportId(response.data?._id || report._id);
        await markStatusUpdatesSynced(response.data?._id || report._id, allStatusHistory);

        console.log('[Sync] ✓ Synced:', report._id, '→', response.data?._id);

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
      console.log(`[Sync] Complete: ${syncedReportIds.length}/${reportsToSync.length} reports synced`);
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
      ? allReports.filter(r => {
        // Match by ID or mapped ID
        if (reportIds.includes(r._id)) return true;
        if (r._originalOfflineId && reportIds.includes(r._originalOfflineId)) return true;
        return false;
      }).filter(r => !r.fromHost)
      : allReports.filter(r => !r.syncedToBackend && !r.fromHost);

    if (reportsToSync.length === 0) {
      console.log('[Sync] No reports to sync');
      return true;
    }

    console.log('[Sync] Syncing', reportsToSync.length, 'specific reports');
    const syncedIds = [];

    for (const report of reportsToSync) {
      const alreadySynced = await isSyncedReportId(report._id);
      if (alreadySynced && report.syncedToBackend) {
        syncedIds.push(report._id);
        console.log('[Sync] Already synced:', report._id);
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
          user: report.user || {
            _id: 'unknown',
            firstName: 'Unknown',
            lastName: 'User',
            role: 'User'
          },
          createdAt: report.createdAt,
          status: report.status || 'REPORTED',
          statusHistory: allStatusHistory,
          syncedFromOffline: true
        };

        const response = await api.post('/reports', reportData, {
          timeout: 15000,
          headers: {
            'X-Offline-ID': report._id
          }
        });

        if (response.data?._id && typeof report._id === 'string' && report._id.startsWith('offline_')) {
          await mapOfflineToOnlineId(report._id, response.data._id);
        }

        syncedIds.push(response.data?._id || report._id);
        await addSyncedReportId(response.data?._id || report._id);
        await markStatusUpdatesSynced(response.data?._id || report._id, allStatusHistory);

        console.log('[Sync] ✓ Synced:', report._id, '→', response.data?._id);

      } catch (e) {
        console.error('[Sync] Failed:', report._id, e.message);
      }
    }

    if (syncedIds.length > 0) {
      await markReportsSynced(syncedIds);
      console.log(`[Sync] Complete: ${syncedIds.length}/${reportsToSync.length} reports synced`);
    }

    return syncedIds.length === reportsToSync.length;
  } catch (e) {
    console.error('[Sync] Error:', e);
    return false;
  }
};

// ============================================
// HOST COMMUNICATION
// ============================================

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
          user: report.user || {
            _id: 'unknown',
            firstName: 'Unknown',
            lastName: 'User',
            role: 'User'
          },
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

// ============================================
// HOST REPORT FETCHING
// ============================================

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
          statusHistory: item.payload?.statusHistory || [],
          user: item.payload?.user || {
            _id: 'unknown',
            firstName: 'Unknown',
            lastName: 'User',
            role: 'User'
          }
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

// ============================================
// ONLINE REPORTS FROM HOST
// ============================================

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
      const reports = (data.reports || []).map(report => ({
        ...report,
        user: report.user || {
          _id: 'unknown',
          firstName: 'Unknown',
          lastName: 'User',
          role: 'User'
        }
      }));

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