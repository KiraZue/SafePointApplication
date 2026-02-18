import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, SectionList, TouchableOpacity, Alert, ActivityIndicator, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DeviceEventEmitter } from 'react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api, { BASE_URL, resolveBaseURL, getApiBaseUrl } from '../services/api';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import {
  getOfflineReports,
  fetchHostOfflineReports,
  updateOfflineReportStatus,
  syncOfflineReportsToBackend,
  getStoredOfflineReports,
  updateSyncedOfflineReport,
  getHostedReports,
  fetchOnlineReportsFromHost,
  addHostedReport,
  updateHostedReport,
  saveReportHistory,
  getStoredReportHistory,
  syncStatusesFromBackend
} from '../services/offline';
import NetInfo from '@react-native-community/netinfo';
import { isProxyActive, addHostedReportToMemory, updateHostedReportInMemory, broadcastHostedStatusUpdate } from '../services/ProxyServer';
import io from 'socket.io-client';
import ReporterContactModal from '../components/ReporterContactModal';

const statusColor = (status) => {
  switch (status) {
    case 'REPORTED': return '#ef5350';
    case 'ACKNOWLEDGED': return '#ffb300';
    case 'RESPONDING': return '#42a5f5';
    case 'RESOLVED': return '#66bb6a';
    default: return '#9e9e9e';
  }
};

const typeColor = (type) => {
  switch (type) {
    case 'Medical': return '#2e7d32';
    case 'Fire': return '#d32f2f';
    case 'Earthquake': return '#795548';
    case 'Security': return '#fbc02d';
    case 'Accident': return '#fb8c00';
    default: return '#616161';
  }
};

const ReportsScreen = () => {
  const [reports, setReports] = useState([]);
  const [offlineReports, setOfflineReports] = useState([]);
  const [hostReports, setHostReports] = useState([]);
  const [hostedReports, setHostedReports] = useState([]);
  const [isOffline, setIsOffline] = useState(false);
  const [isConnectedToHost, setIsConnectedToHost] = useState(false);
  const [viewMode, setViewMode] = useState('online');
  const [syncingReports, setSyncingReports] = useState(new Set());
  const [loadingOnline, setLoadingOnline] = useState(false);
  const [loadingHost, setLoadingHost] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [todayPage, setTodayPage] = useState(1);
  const [earlierPage, setEarlierPage] = useState(1);
  const [showContactModal, setShowContactModal] = useState(false);
  const [selectedReporter, setSelectedReporter] = useState(null);
  const [loadingReporter, setLoadingReporter] = useState(false);
  const socketRef = useRef(null);
  const { user } = useAuth();
  const navigation = useNavigation();
  const route = useRoute();
  const highlightId = route.params?.highlightId;
  const loadingRef = useRef(false);
  const lastLoadTimeRef = useRef(0);
  const lastSyncTimeRef = useRef(0);
  const LOAD_DEBOUNCE_MS = 3000;
  const SYNC_DEBOUNCE_MS = 15000;
  const ITEMS_PER_PAGE = 20;

  const checkConnectivity = async () => {
    try {
      const netInfo = await NetInfo.fetch();
      const connected = netInfo.isConnected && netInfo.isInternetReachable;

      // Use the helper from api.js for consistency
      const isWifiDirectHost = BASE_URL.includes('192.168.49.1');
      const isCurrentlyHosting = isProxyActive();

      setIsOffline(!connected);
      // isConnectedToHost should only be true if we are a CLIENT connected to a host
      setIsConnectedToHost(isWifiDirectHost && !isCurrentlyHosting);

      return { connected, isWifiDirectHost, isCurrentlyHosting };
    } catch (e) {
      console.error('[Reports] Error checking connectivity:', e);
      return { connected: false, isWifiDirectHost: false, isCurrentlyHosting: false };
    }
  };

  // Socket.io setup for real-time updates
  useEffect(() => {
    const isHosting = isProxyActive();

    if (!isHosting) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    const setupSocket = async () => {
      try {
        const connectivity = await checkConnectivity();

        if (!connectivity.connected) {
          console.log('[Socket] No backend connection, skipping socket setup');
          return;
        }

        const socketUrl = BASE_URL.replace(/\/api$/, '');
        console.log('[Socket] Connecting to:', socketUrl);

        const socket = io(socketUrl, {
          transports: ['websocket'],
          reconnection: true,
          reconnectionAttempts: 5,
          timeout: 10000
        });

        socketRef.current = socket;

        socket.on('connect', () => {
          console.log('[Socket] Connected for real-time updates');
        });

        socket.on('disconnect', () => {
          console.log('[Socket] Disconnected');
        });

        socket.on('connect_error', (err) => {
          console.error('[Socket] Connection error:', err.message);
        });

        socket.on('report:updated', async (updatedReport) => {
          console.log('[Socket] Report updated:', updatedReport._id);

          const hosted = await getHostedReports();
          const isHosted = hosted.some(r => r._id === updatedReport._id);

          if (isHosted) {
            await updateHostedReport(updatedReport._id, updatedReport);
            await loadHostedReports();
            console.log('[Socket] Updated hosted report:', updatedReport._id);
          }
        });

        socket.on('report:created', async (newReport) => {
          console.log('[Socket] New report created:', newReport._id);
          await loadOnlineReports(false);
        });

      } catch (e) {
        console.error('[Socket] Setup error:', e);
      }
    };

    setupSocket();

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [isProxyActive()]);

  const loadOnlineReports = async (showLoading = true) => {
    try {
      if (showLoading) setLoadingOnline(true);

      const connectivity = await checkConnectivity();

      // 1. Try Direct Internet Connection (Priority)
      if (connectivity.connected) {
        // CRITICAL FIX: Use the shared API base URL which might be from discovery
        const backendUrl = getApiBaseUrl();
        if (showLoading) {
          console.log('[Reports] Fetching online reports directly from:', backendUrl);
        }

        let headers = {};
        try {
          const userInfoStr = await AsyncStorage.getItem('userInfo');
          if (userInfoStr) {
            const userInfo = JSON.parse(userInfoStr);
            if (userInfo.token) {
              headers['Authorization'] = `Bearer ${userInfo.token}`;
            }
          }
        } catch (e) {
          console.error('[Reports] Error retrieving token:', e);
        }

        const { data } = await axios.get(`${backendUrl}/reports`, {
          timeout: 3000,
          headers: headers
        });

        const storedReports = await getStoredOfflineReports();
        const hostedReportsLocal = await getHostedReports();

        const mergedData = data.map(onlineR => {
          const localOffline = storedReports.find(l => l._id === onlineR._id || l._originalOfflineId === onlineR._id);
          const localHosted = hostedReportsLocal.find(l => l._id === onlineR._id || l._originalOfflineId === onlineR._id);

          const localR = localOffline || localHosted;

          if (localR && localR.statusHistory && localR.statusHistory.length > 0) {
            const localHistory = [...localR.statusHistory].sort((a, b) =>
              new Date(b.updatedAt || b.timestamp || 0).getTime() - new Date(a.updatedAt || a.timestamp || 0).getTime()
            );

            const onlineHistory = [...(onlineR.statusHistory || [])].sort((a, b) =>
              new Date(b.updatedAt || b.timestamp || 0).getTime() - new Date(a.updatedAt || a.timestamp || 0).getTime()
            );

            const localLatest = localHistory[0];
            const onlineLatest = onlineHistory.length > 0 ? onlineHistory[0] : null;

            if (localLatest && (!onlineLatest ||
              new Date(localLatest.updatedAt || localLatest.timestamp || 0).getTime() >
              new Date(onlineLatest.updatedAt || onlineLatest.timestamp || 0).getTime())) {

              return {
                ...onlineR,
                status: localLatest.status,
                statusHistory: localR.statusHistory
              };
            }
          }
          return onlineR;
        });

        const deduped = [];
        const seen = new Set();
        for (const r of mergedData) {
          const key = r._id || `${r.type}_${r.createdAt}`;
          if (!seen.has(key)) {
            seen.add(key);
            deduped.push(r);
          }
        }
        setReports(deduped);

        for (const onlineReport of data) {
          await updateSyncedOfflineReport(onlineReport);
        }

        return true;
      }

      // 2. Fallback to Host Proxy (if no internet but connected to host)
      if (connectivity.isWifiDirectHost && !BASE_URL.includes('localhost')) {
        console.log('[Reports] Fetching online reports from host (No Internet)');
        try {
          const onlineFromHost = await fetchOnlineReportsFromHost(BASE_URL);
          if (onlineFromHost && onlineFromHost.length > 0) {
            console.log('[Reports] Using online reports from host:', onlineFromHost.length);
            setReports(onlineFromHost);

            for (const onlineReport of onlineFromHost) {
              await updateSyncedOfflineReport(onlineReport);
            }

            return true;
          }
        } catch (err) {
          if (showLoading) {
            console.error('[Reports] Failed to fetch from host:', err.message);
          }
        }
      }

      return false;
    } catch (err) {
      if (showLoading) {
        console.error('[Reports] Failed to load online reports:', err.message);
      }
      return false;
    } finally {
      if (showLoading) setLoadingOnline(false);
    }
  };

  const loadHostReports = async () => {
    try {
      setLoadingHost(true);
      const connectivity = await checkConnectivity();

      if (connectivity.isWifiDirectHost && !BASE_URL.includes('localhost')) {
        const hostOffline = await fetchHostOfflineReports(BASE_URL);
        // Silenced redundant log
        setHostReports(hostOffline);
        return true;
      }

      return false;
    } catch (err) {
      console.error('[Reports] Failed to load host reports:', err.message);
      return false;
    } finally {
      setLoadingHost(false);
    }
  };

  const loadHostedReports = async () => {
    try {
      const hosted = await getHostedReports();
      // Silenced redundant log
      setHostedReports(hosted);
      return true;
    } catch (err) {
      console.error('[Reports] Failed to load hosted reports:', err.message);
      return false;
    }
  };

  const loadReportHistory = async (showLoading = false) => {
    if (loadingRef.current) {
      return;
    }

    const now = Date.now();
    if (now - lastLoadTimeRef.current < LOAD_DEBOUNCE_MS) {
      return;
    }

    loadingRef.current = true;
    lastLoadTimeRef.current = now;

    try {
      setLoadingHistory(true);

      const connectivity = await checkConnectivity();
      let historyData = [];

      // 1. Try to fetch from backend if online
      if (connectivity.connected) {
        try {
          // CRITICAL FIX: Use the shared API base URL which might be from discovery
          const backendUrl = getApiBaseUrl();
          if (showLoading) {
            console.log('[Reports] Fetching user report history from:', `${backendUrl}/reports/my`);
          }

          const { data } = await api.get('/reports/my', { timeout: 3000 });
          if (data && Array.isArray(data)) {
            historyData = data.map(r => ({ ...r, syncedToBackend: true, synced: true }));
            await saveReportHistory(historyData);
          }
        } catch (err) {
          if (showLoading) {
            console.error('[Reports] Failed to fetch history from backend:', err.message);
          }
          // Fallback to local history
          historyData = await getStoredReportHistory();
        }
      } else {
        // 2. Offline: Load from local history storage
        if (showLoading) {
          console.log('[Reports] Offline: Loading history from local storage');
        }
        historyData = await getStoredReportHistory();
      }

      // Get other local reports that might not be synced yet
      const localOffline = await getStoredOfflineReports();
      const hosted = await getHostedReports();

      // Combine all reports and filter by current user
      const allUserReports = [...historyData];
      const seenIds = new Set(historyData.map(r => r._id));

      // Helper to check ownership
      const isCurrentUser = (report) => {
        if (!report.user) return false;
        const uid = typeof report.user === 'string' ? report.user : report.user._id;
        return uid === user?._id;
      };

      // Add unsynced local reports
      localOffline.forEach(report => {
        if (isCurrentUser(report) && !seenIds.has(report._id) && !seenIds.has(report._originalOfflineId)) {
          seenIds.add(report._id);
          if (report._originalOfflineId) seenIds.add(report._originalOfflineId);
          allUserReports.push({ ...report, isOffline: true });
        }
      });

      hosted.forEach(report => {
        if (isCurrentUser(report) && !seenIds.has(report._id) && !seenIds.has(report._originalOfflineId)) {
          seenIds.add(report._id);
          if (report._originalOfflineId) seenIds.add(report._originalOfflineId);
          allUserReports.push({ ...report, hostedInGroup: true });
        }
      });

      // Deduplicate and sort by createdAt
      const uniqueReports = allUserReports.sort((a, b) =>
        new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      );

      setOfflineReports(uniqueReports);

    } catch (err) {
      console.error('[Reports] Failed to load report history:', err.message);
    } finally {
      setLoadingHistory(false);
      loadingRef.current = false;
    }
  };

  const syncSingleReport = async (reportId) => {
    try {
      if (syncingReports.has(reportId)) return;

      const connectivity = await checkConnectivity();
      if (!connectivity.connected || connectivity.isWifiDirectHost) {
        Alert.alert('No Connection', 'You need a direct internet connection to sync reports to the backend.');
        return;
      }

      setSyncingReports(prev => new Set(prev).add(reportId));

      // ✅ FIX: Look in all possible storage locations
      const storedOffline = await getStoredOfflineReports();
      const hostedReportsLocal = await getHostedReports();

      let report = storedOffline.find(r => r._id === reportId || r._originalOfflineId === reportId);
      if (!report) {
        report = hostedReportsLocal.find(r => r._id === reportId || r._originalOfflineId === reportId);
      }

      if (!report) {
        console.error('[Sync] Report not found in any storage:', reportId);
        Alert.alert('Error', 'Report not found in local storage. It may have already been synced.');
        setSyncingReports(prev => {
          const newSet = new Set(prev);
          newSet.delete(reportId);
          return newSet;
        });
        return;
      }

      console.log('[Sync] Found report to sync:', report._id, 'Type:', report.type);

      console.log('[Sync] Sending report to backend via sync service...');
      const success = await syncOfflineReportsToBackend([reportId]);

      if (success) {
        Alert.alert('Success', 'Report synced successfully.');
        await load(false);
      } else {
        throw new Error('Sync service failed to process the report.');
      }

    } catch (err) {
      console.error('[Sync] Single sync failed:', err.message);
      Alert.alert('Sync Failed', err.response?.data?.message || err.message || 'An error occurred during sync.');
    } finally {
      setSyncingReports(prev => {
        const newSet = new Set(prev);
        newSet.delete(reportId);
        return newSet;
      });
    }
  };

  const syncOfflineReports = async () => {
    try {
      const now = Date.now();

      if (now - lastSyncTimeRef.current < SYNC_DEBOUNCE_MS) {
        return;
      }

      lastSyncTimeRef.current = now;

      const connectivity = await checkConnectivity();

      if (!connectivity.connected || connectivity.isWifiDirectHost) {
        return;
      }

      // Get unsynced reports from local storage (not from the displayed history)
      const storedOffline = await getStoredOfflineReports();
      const hostedReportsLocal = await getHostedReports();

      const unsyncedReports = [
        ...storedOffline.filter(r => !r.syncedToBackend && r.user && r.user._id === user._id),
        ...hostedReportsLocal.filter(r => !r.syncedToBackend && r.user && r.user._id === user._id)
      ];

      if (unsyncedReports.length === 0) {
        return;
      }

      console.log(`[Sync] Starting auto-sync: ${unsyncedReports.length} reports`);

      // Batch setSyncingReports to avoid flickering re-renders
      const idsToSync = unsyncedReports.map(r => r._id);
      setSyncingReports(prev => {
        const next = new Set(prev);
        idsToSync.forEach(id => next.add(id));
        return next;
      });

      const success = await syncOfflineReportsToBackend(idsToSync);
      if (success) {
        console.log('[Sync] ✓ Auto-sync complete');
        // Reload both online reports and history after sync
        await loadOnlineReports(false);
        await loadReportHistory();
      }
    } catch (err) {
      if (showLoading) {
        console.error('[Sync] Auto-sync error:', err);
      }
    } finally {
      // Clear all syncing states regardless of success/error
      setSyncingReports(new Set());
    }
  };

  const load = async (showLoading = true) => {
    if (loadingRef.current && showLoading) {
      return;
    }

    const connectivity = await checkConnectivity();

    // Always load local hosted reports immediately (fast, no network)
    await loadHostedReports();

    // Mark initial load complete early so UI renders with local data
    if (!initialLoadComplete) {
      setInitialLoadComplete(true);
    }

    if (connectivity.connected) {
      if (showLoading) console.log('[Reports] Loading online reports (has internet)');
      // Run online + history loads in parallel for speed
      const [success] = await Promise.all([
        loadOnlineReports(showLoading),
        loadReportHistory(showLoading),
        syncStatusesFromBackend() // Keep local/hosted reports in sync with backend
      ]);
      if (success) {
        await syncOfflineReports(showLoading);
      }
    } else {
      // Offline: just load local history (no network calls)
      await loadReportHistory();
    }

    if (connectivity.isWifiDirectHost) {
      console.log('[Reports] Loading host reports (connected to Wi-Fi Direct)');
      await loadHostReports();
    }
  };

  useEffect(() => {
    load(true);

    const timer = setInterval(() => load(false), 20000);

    // Refresh when connectivity restored
    let wasOffline = false;
    const netSub = NetInfo.addEventListener(state => {
      const isNowConnected = !!(state.isConnected && state.isInternetReachable);
      if (wasOffline && isNowConnected) {
        console.log('[Reports] Connection restored, refreshing reports...');
        load(false);
      }
      wasOffline = !isNowConnected;
    });

    return () => {
      clearInterval(timer);
      netSub();
    };
  }, [isConnectedToHost, BASE_URL]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('HOSTED_REPORTS_CHANGED', () => {
      loadHostedReports();
      loadReportHistory();
    });
    return () => {
      try { sub && sub.remove(); } catch (e) { }
    };
  }, []);

  const [busyId, setBusyId] = useState(null);

  const handleCardPress = (item) => {
    navigation.navigate('Home', {
      highlightId: item._id,
      report: item,
      latitude: item.latitude || item.location?.latitude,
      longitude: item.longitude || item.location?.longitude
    });
  };

  const acknowledge = async (id, isOfflineReport, isHostReport, isHostedReport) => {
    try {
      if (busyId === id) return;

      const isHosting = isProxyActive();
      // Allow update if hosting OR if connected to a host (fromHost reports)
      if (!isHosting && isHostedReport && !isHostReport) {
        Alert.alert('Not Hosting', 'You cannot update hosted reports when you are not hosting the group.');
        return;
      }

      setBusyId(id);

      const connectivity = await checkConnectivity();

      if (!isOfflineReport && !isHostReport && !isHostedReport && connectivity.connected) {
        // CRITICAL FIX: Use the shared API base URL which might be from discovery
        const backendUrl = getApiBaseUrl();
        console.log('[Reports] Acknowledging online report directly to backend:', backendUrl);

        let headers = {};
        try {
          const userInfoStr = await AsyncStorage.getItem('userInfo');
          if (userInfoStr) {
            const userInfo = JSON.parse(userInfoStr);
            if (userInfo.token) {
              headers['Authorization'] = `Bearer ${userInfo.token}`;
            }
          }
        } catch (e) {
          console.error('[Reports] Error retrieving token:', e);
        }

        await axios.put(`${backendUrl}/reports/${id}/acknowledge`, {}, {
          timeout: 5000,
          headers: headers
        });

        await load(false);
        setBusyId(null);
        return;
      }

      if (!isOfflineReport && !isHostReport && !isHostedReport && connectivity.isWifiDirectHost) {
        console.log('[Reports] Updating online report through host proxy');
        try {
          await api.put(`/reports/${id}/acknowledge`);
          await load(false);
          setBusyId(null);
          return;
        } catch (err) {
          console.error('[Reports] Failed to update through host:', err.message);
        }
      }

      if (isHostedReport || isOfflineReport || isHostReport) {
        await updateOfflineReportStatus(id, 'ACKNOWLEDGED', user);
        await load(false);
      } else {
        await api.put(`/reports/${id}/acknowledge`);
        await load(false);
      }
    } catch (err) {
      console.error('[Reports] Acknowledge error:', err);
      Alert.alert('Error', 'Failed to acknowledge report. Please check your connection.');
    } finally {
      setBusyId(null);
    }
  };

  const updateStatus = async (id, status, isOfflineReport, isHostReport, isHostedReport) => {
    try {
      if (busyId === id) return;

      const isHosting = isProxyActive();
      // Allow update if hosting OR if connected to a host (fromHost reports)
      if (!isHosting && isHostedReport && !isHostReport) {
        Alert.alert('Not Hosting', 'You cannot update hosted reports when you are not hosting the group.');
        return;
      }

      setBusyId(id);

      const connectivity = await checkConnectivity();

      if (!isOfflineReport && !isHostReport && !isHostedReport && connectivity.connected) {
        // CRITICAL FIX: Use the shared API base URL which might be from discovery
        const backendUrl = getApiBaseUrl();
        console.log('[Reports] Updating status directly to backend:', backendUrl);

        let headers = {};
        try {
          const userInfoStr = await AsyncStorage.getItem('userInfo');
          if (userInfoStr) {
            const userInfo = JSON.parse(userInfoStr);
            if (userInfo.token) {
              headers['Authorization'] = `Bearer ${userInfo.token}`;
            }
          }
        } catch (e) {
          console.error('[Reports] Error retrieving token:', e);
        }

        await axios.put(`${backendUrl}/reports/${id}/status`, { status }, {
          timeout: 5000,
          headers: headers
        });

        setReports(prev => prev.map(r => {
          if (r._id !== id) return r;
          const sh = Array.isArray(r.statusHistory) ? [...r.statusHistory] : [];
          const exists = sh.some(h => h.status === status && h.updatedBy && h.updatedBy._id === user?._id);
          if (!exists) {
            sh.push({
              status,
              updatedBy: {
                _id: user?._id,
                firstName: user?.firstName,
                lastName: user?.lastName,
                role: user?.role
              },
              updatedAt: new Date().toISOString(),
              timestamp: new Date().toISOString(),
              syncedToBackend: true
            });
          }
          return { ...r, status, statusHistory: sh };
        }));

        if (isProxyActive()) {
          const shared = hostedReports.find(hr => hr._id === id);
          if (shared) {
            const sh = Array.isArray(shared.statusHistory) ? [...shared.statusHistory] : [];
            const exists = sh.some(h => h.status === status && h.updatedBy && h.updatedBy._id === user?._id);
            if (!exists) {
              sh.push({
                status,
                updatedBy: {
                  _id: user?._id,
                  firstName: user?.firstName,
                  lastName: user?.lastName,
                  role: user?.role
                },
                updatedAt: new Date().toISOString(),
                timestamp: new Date().toISOString(),
                syncedToBackend: true
              });
              await updateHostedReport(id, { status, statusHistory: sh });
              try {
                updateHostedReportInMemory(id, { status, statusHistory: sh });
                broadcastHostedStatusUpdate(id);
              } catch (e) { }
            }
          }
        }

        await load(false);
        setBusyId(null);
        return;
      }

      if (!isOfflineReport && !isHostReport && !isHostedReport && connectivity.isWifiDirectHost) {
        console.log('[Reports] Updating online report through host proxy');
        try {
          await api.put(`/reports/${id}/status`, { status });
          await load(false);
          setBusyId(null);
          return;
        } catch (err) {
          console.error('[Reports] Failed to update through host:', err.message);
        }
      }

      if (isHostedReport || isOfflineReport || isHostReport) {
        await updateOfflineReportStatus(id, status, user);
        await load(false);
      } else {
        await api.put(`/reports/${id}/status`, { status });
        await load(false);
      }
    } catch (err) {
      console.error('[Reports] Update status error:', err);
      Alert.alert('Error', 'Failed to update status. Please check your connection.');
    } finally {
      setBusyId(null);
    }
  };

  const toggleViewMode = () => {
    if (busyId === 'toggle') return;
    setBusyId('toggle');

    setTodayPage(1);
    setEarlierPage(1);

    if (viewMode === 'online') {
      setViewMode('host');
    } else if (viewMode === 'host') {
      setViewMode('history');
    } else {
      setViewMode('online');
    }

    setTimeout(() => setBusyId(null), 300);
  };

  const getViewModeIcon = () => {
    switch (viewMode) {
      case 'online':
        return { name: 'cloud-done', color: '#4caf50' };
      case 'host':
        return { name: 'wifi', color: '#2196f3' };
      case 'history':
        return { name: 'time', color: '#9c27b0' };
      default:
        return { name: 'cloud-done', color: '#4caf50' };
    }
  };

  const getViewModeLabel = () => {
    switch (viewMode) {
      case 'online':
        return 'Online';
      case 'host':
        return 'Host';
      case 'history':
        return 'My Reports';
      default:
        return 'Online';
    }
  };

  const fetchReporterInfo = async (reportUser) => {
    const reporterId = typeof reportUser === 'string' ? reportUser : reportUser?._id;
    if (!reporterId) {
      Alert.alert('Error', 'Reporter information not available.');
      return;
    }

    try {
      setLoadingReporter(true);
      setShowContactModal(true);

      const { data } = await api.get(`/users/profile/${reporterId}`);
      setSelectedReporter(data);
    } catch (err) {
      console.error('[Reports] Error fetching reporter info:', err);
      Alert.alert('Error', 'Could not fetch reporter contact details.');
      setShowContactModal(false);
    } finally {
      setLoadingReporter(false);
    }
  };

  const renderItem = ({ item }) => {
    const isSyncing = syncingReports.has(item._id);

    // 1. Determine the source/type of report
    const isHostReport = item.fromHost === true;
    const isHostedReport = item.hostedInGroup === true;
    // An offline report is one that is specifically local and not from a host or being hosted for others
    const isOfflineReport = (item.isOffline === true || String(item._id).startsWith('offline_')) && !isHostReport && !isHostedReport;

    // 2. Determine if it needs sync (only for My Reports or Hosted reports)
    const needsSync = !(item.syncedToBackend || item.synced) && (isOfflineReport || isHostedReport) && viewMode !== 'online';

    // 3. Highlight from map navigation
    const isHighlighted = item._id === highlightId;

    return (
      <Pressable
        onPress={() => handleCardPress(item)}
        style={[
          styles.card,
          isOfflineReport && styles.offlineCard,
          isHostReport && styles.hostCard,
          isHostedReport && styles.hostedCard,
          isHighlighted && styles.highlightedCard
        ]}
      >
        {/* MY REPORTS (OFFLINE) BADGE */}
        {isOfflineReport && viewMode !== 'online' && (
          <View style={styles.rowBetween}>
            <View style={styles.offlineBadge}>
              <Ionicons name="cloud-offline" size={14} color="#fff" />
              <Text style={styles.offlineBadgeText}>
                {(item.syncedToBackend || item.synced) ? 'Synced to Backend' : 'Pending Sync'}
              </Text>
            </View>
            {needsSync && !isSyncing && (
              <TouchableOpacity
                style={styles.syncNowBtn}
                onPress={() => syncSingleReport(item._id)}
              >
                <Ionicons name="sync" size={14} color="#2196f3" />
                <Text style={styles.syncNowText}>Sync Now</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* HOST REPORT BADGE (Received from someone else) */}
        {isHostReport && (
          <View style={styles.hostBadge}>
            <Ionicons name="wifi" size={14} color="#fff" />
            <Text style={styles.hostBadgeText}>
              From Host (Wi-Fi Direct)
            </Text>
          </View>
        )}

        {/* HOSTED REPORT BADGE (I am the host) */}
        {isHostedReport && viewMode !== 'online' && (
          <View style={styles.rowBetween}>
            <View style={styles.hostedBadge}>
              <Ionicons name="radio" size={14} color="#fff" />
              <Text style={styles.hostedBadgeText}>
                Hosted in Group {(item.syncedToBackend || item.synced) ? '• Synced Online' : '• Pending Sync'}
              </Text>
            </View>
            {needsSync && (
              <TouchableOpacity
                style={[styles.syncNowBtn, isSyncing && styles.syncNowBtnDisabled]}
                onPress={() => syncSingleReport(item._id)}
                disabled={isSyncing}
              >
                {isSyncing ? (
                  <ActivityIndicator size="small" color="#aaa" />
                ) : (
                  <Ionicons name="sync" size={14} color="#2196f3" />
                )}
                <Text style={[styles.syncNowText, isSyncing && styles.syncNowTextDisabled]}>
                  {isSyncing ? 'Syncing...' : 'Sync Now'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {isSyncing && (
          <View style={styles.syncingBadge}>
            <ActivityIndicator size="small" color="#fff" />
            <Text style={styles.syncingText}>Syncing...</Text>
          </View>
        )}

        <View style={styles.row}>
          <Text style={[styles.type, { color: typeColor(item.type) }]}>{item.type} Emergency</Text>
          <View style={{ alignItems: 'flex-end' }}>
            <View style={[styles.status, { backgroundColor: statusColor(item.status) }]}>
              <Text style={styles.statusText}>{item.status}</Text>
            </View>
            {['Teacher', 'Admin', 'Security Personnel'].includes(user?.role) && (
              <TouchableOpacity
                style={styles.contactInfoBtn}
                onPress={() => fetchReporterInfo(item.user)}
              >
                <Ionicons name="call" size={12} color="#2196f3" />
                <Text style={styles.contactInfoBtnText}>Contact Info</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <Text style={styles.time}>
          Reported: {new Date(item.createdAt).toLocaleString()}
        </Text>

        {item.user && (
          <Text style={styles.reporter}>
            Reporter: {item.user.lastName}, {item.user.firstName} ({item.user.role})
          </Text>
        )}

        {item.description && (
          <Text style={styles.description} numberOfLines={2}>
            {item.description}
          </Text>
        )}

        <View style={styles.badgesRow}>
          {(() => {
            const sh = Array.isArray(item.statusHistory) ? item.statusHistory : [];
            const ack = sh.filter((h) => h.status === 'ACKNOWLEDGED');
            const resp = sh.filter((h) => h.status === 'RESPONDING');
            const reso = sh.filter((h) => h.status === 'RESOLVED');
            const resolvers = reso
              .map((h) => h.updatedBy)
              .filter(Boolean)
              .map((u) => `${u.lastName}, ${u.firstName}`)
              .join(', ');
            return (
              <>
                <View style={[styles.badge, { backgroundColor: '#ffe082' }]}>
                  <Text style={[styles.badgeTitle, { color: '#c77800' }]}>ACKNOWLEDGE</Text>
                  <Text style={styles.badgeSubLabel}>by</Text>
                  <View style={styles.badgeSubContainer}>
                    <View style={styles.badgeIconRow}>
                      <Ionicons name="people" size={16} color="#333" />
                      <Text style={styles.badgeCount}>{ack.length}</Text>
                    </View>
                    <Text style={styles.badgeSubLabel}>People</Text>
                  </View>
                </View>
                <View style={[styles.badge, { backgroundColor: '#bbdefb' }]}>
                  <Text style={[styles.badgeTitle, { color: '#1565c0' }]}>RESPONDED</Text>
                  <Text style={styles.badgeSubLabel}>by</Text>
                  <View style={styles.badgeSubContainer}>
                    <View style={styles.badgeIconRow}>
                      <Ionicons name="people" size={14} color="#333" />
                      <Text style={styles.badgeCount}>{resp.length}</Text>
                    </View>
                    <Text style={styles.badgeSubLabel}>Authorize Personnel</Text>
                  </View>
                </View>
                <View style={[styles.badge, { backgroundColor: '#c8e6c9' }]}>
                  <Text style={[styles.badgeTitle, { color: '#2e7d32' }]}>RESOLVED</Text>
                  <Text style={styles.badgeSubText}>{resolvers || '—'}</Text>
                </View>
              </>
            );
          })()}
        </View>

        <View style={styles.actions}>
          {(() => {
            if (item.status === 'RESOLVED') return null;
            const has = (st) =>
              Array.isArray(item.statusHistory) &&
              item.statusHistory.some((h) => h.status === st && h.updatedBy && h.updatedBy._id === user?._id);
            const isStaff = ['Teacher', 'Admin', 'Security Personnel'].includes(user?.role || '');
            let label = null;
            let onPress = null;
            let style = styles.ackBtn;
            if (!has('ACKNOWLEDGED')) {
              label = 'ACKNOWLEDGE';
              onPress = () => acknowledge(item._id, isOfflineReport, isHostReport, isHostedReport);
              style = styles.ackBtn;
            } else if (isStaff && !has('RESPONDING')) {
              label = 'RESPONDING';
              onPress = () => updateStatus(item._id, 'RESPONDING', isOfflineReport, isHostReport, isHostedReport);
              style = [styles.ackBtn, { backgroundColor: '#42a5f5' }];
            } else if (isStaff && !has('RESOLVED')) {
              label = 'RESOLVE';
              onPress = () =>
                Alert.alert('Confirm', 'Mark this report as resolved?', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'OK', onPress: () => updateStatus(item._id, 'RESOLVED', isOfflineReport, isHostReport, isHostedReport) },
                ]);
              style = [styles.ackBtn, { backgroundColor: '#66bb6a' }];
            }
            if (!label) return null;
            return (
              <TouchableOpacity
                style={style}
                onPress={onPress}
                disabled={busyId === item._id || isSyncing}
              >
                {busyId === item._id ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.ackText}>{label}</Text>
                )}
              </TouchableOpacity>
            );
          })()}
        </View>
      </Pressable>
    );
  };

  let displayReports = [];
  const isHosting = isProxyActive();

  if (viewMode === 'online') {
    displayReports = reports;
  } else if (viewMode === 'host') {
    // Correct logic for Host view mode:
    if (isHosting) {
      // 1. If I am the HOST, show reports I am hosting for others (hostedInGroup === true)
      displayReports = hostedReports.filter(r => r.hostedInGroup === true);
    } else if (isConnectedToHost) {
      // 2. If I am a CLIENT, show reports fetched from the host (fromHost === true)
      displayReports = hostReports.filter(r => r.fromHost === true);
    } else {
      // 3. Not hosting and not connected - show my own hosted reports from history if any
      displayReports = hostedReports.filter(r => r.hostedInGroup === true);
    }
  } else if (viewMode === 'history') {
    displayReports = offlineReports;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const allTodayReports = displayReports.filter((r) => new Date(r.createdAt) >= today);
  const allEarlierReports = displayReports.filter((r) => new Date(r.createdAt) < today);

  const todayReports = allTodayReports.slice(0, todayPage * ITEMS_PER_PAGE);
  const earlierReports = allEarlierReports.slice(0, earlierPage * ITEMS_PER_PAGE);

  const hasMoreToday = allTodayReports.length > todayReports.length;
  const hasMoreEarlier = allEarlierReports.length > earlierReports.length;

  // Calculate unsynced count from actual stored offline reports, not display state
  const getUnsyncedCount = async () => {
    try {
      const storedOffline = await getStoredOfflineReports();
      const hostedReportsLocal = await getHostedReports();
      return storedOffline.filter(r => !r.syncedToBackend).length +
        hostedReportsLocal.filter(r => !r.syncedToBackend).length;
    } catch {
      return 0;
    }
  };

  const [unsyncedCount, setUnsyncedCount] = useState(0);

  useEffect(() => {
    if (viewMode === 'history') {
      getUnsyncedCount().then(setUnsyncedCount);
    }
  }, [viewMode, offlineReports]);

  const sectionListRef = useRef(null);
  useEffect(() => {
    if (highlightId && initialLoadComplete && !isLoading) {
      // 1. Search in ALL reports first to see where it SHOULD be
      const tIndexFull = allTodayReports.findIndex(r => r._id === highlightId);
      const eIndexFull = allEarlierReports.findIndex(r => r._id === highlightId);

      // 2. Handle pagination if it's not in the visible slice
      if (tIndexFull !== -1 && tIndexFull >= todayReports.length) {
        setTodayPage(Math.ceil((tIndexFull + 1) / ITEMS_PER_PAGE));
        return; // Wait for next render with updated slice
      }
      if (eIndexFull !== -1 && eIndexFull >= earlierReports.length) {
        setEarlierPage(Math.ceil((eIndexFull + 1) / ITEMS_PER_PAGE));
        return; // Wait for next render with updated slice
      }

      // 3. Now search in the VISIBLE slices
      let sectionIndex = -1;
      let itemIndex = -1;

      const tIndex = todayReports.findIndex(r => r._id === highlightId);
      if (tIndex !== -1) {
        sectionIndex = 0;
        itemIndex = tIndex;
      } else {
        const eIndex = earlierReports.findIndex(r => r._id === highlightId);
        if (eIndex !== -1) {
          sectionIndex = 1;
          itemIndex = eIndex;
        }
      }

      if (sectionIndex !== -1 && sectionListRef.current) {
        const scrollTimer = setTimeout(() => {
          try {
            // Safety check: is the index still valid for the current data?
            const targetSection = sectionIndex === 0 ? todayReports : earlierReports;
            if (itemIndex >= 0 && itemIndex < targetSection.length) {
              sectionListRef.current.scrollToLocation({
                sectionIndex,
                itemIndex,
                animated: true,
                viewOffset: 100
              });
            }
          } catch (err) {
            console.log('[Reports] Scroll failed:', err);
          }
        }, 800);
        return () => clearTimeout(scrollTimer);
      }
    }
  }, [highlightId, initialLoadComplete, isLoading, todayReports.length, earlierReports.length]);

  const iconData = getViewModeIcon();

  const isLoading = !initialLoadComplete && (
    (viewMode === 'online' && loadingOnline) ||
    (viewMode === 'host' && loadingHost) ||
    (viewMode === 'history' && loadingHistory)
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Emergency Reports</Text>
        <TouchableOpacity
          style={[styles.viewModeIndicator, { borderColor: iconData.color }]}
          onPress={toggleViewMode}
        >
          <Ionicons
            name={iconData.name}
            size={16}
            color={iconData.color}
          />
          <Text style={[styles.viewModeText, { color: iconData.color }]}>
            {getViewModeLabel()}
          </Text>
        </TouchableOpacity>
      </View>

      {viewMode === 'online' && isOffline && (
        <View style={styles.offlineNotice}>
          <Ionicons name="information-circle" size={20} color="#ff9800" />
          <Text style={styles.offlineNoticeText}>
            You're offline. Showing cached online reports. Connect to see updates.
          </Text>
        </View>
      )}

      {viewMode === 'host' && isHosting && (
        <View style={[styles.offlineNotice, { backgroundColor: '#e8f5e9', borderColor: '#4caf50' }]}>
          <Ionicons name="radio" size={20} color="#4caf50" />
          <Text style={[styles.offlineNoticeText, { color: '#2e7d32' }]}>
            Reports hosted in your Wi-Fi Direct group. These are shared with connected clients.
          </Text>
        </View>
      )}

      {viewMode === 'host' && !isHosting && isConnectedToHost && (
        <View style={[styles.offlineNotice, { backgroundColor: '#e3f2fd', borderColor: '#2196f3' }]}>
          <Ionicons name="wifi" size={20} color="#2196f3" />
          <Text style={[styles.offlineNoticeText, { color: '#1565c0' }]}>
            Showing reports from Wi-Fi Direct host. These are shared from the host device.
          </Text>
        </View>
      )}

      {viewMode === 'history' && (
        <View style={[styles.offlineNotice, { backgroundColor: '#f3e5f5', borderColor: '#9c27b0' }]}>
          <Ionicons name="time" size={20} color="#9c27b0" />
          <Text style={[styles.offlineNoticeText, { color: '#6a1b9a' }]}>
            All reports submitted by you. {unsyncedCount > 0 ? `${unsyncedCount} pending sync.` : 'All synced.'}
          </Text>
        </View>
      )}

      {isLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color="#2196f3" />
          <Text style={styles.loadingText}>
            Loading {viewMode} reports...
          </Text>
        </View>
      )}

      <SectionList
        ref={sectionListRef}
        sections={[
          { title: 'Today', data: todayReports, hasMore: hasMoreToday, pageType: 'today' },
          { title: 'Earlier', data: earlierReports, hasMore: hasMoreEarlier, pageType: 'earlier' },
        ]}
        keyExtractor={(item, index) => `${item._id}_${index}`}
        renderItem={renderItem}
        renderSectionHeader={({ section }) => {
          if (section.data.length === 0) return null;
          return (
            <View style={styles.stickyHeader}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
            </View>
          );
        }}
        renderSectionFooter={({ section }) => {
          if (!section.hasMore) return null;
          return (
            <TouchableOpacity
              style={styles.loadMoreButton}
              onPress={() => {
                if (section.pageType === 'today') {
                  setTodayPage(prev => prev + 1);
                } else {
                  setEarlierPage(prev => prev + 1);
                }
              }}
            >
              <Ionicons name="chevron-down-circle-outline" size={20} color="#2196f3" />
              <Text style={styles.loadMoreText}>Load More {section.title} Reports</Text>
            </TouchableOpacity>
          );
        }}
        stickySectionHeadersEnabled
        contentContainerStyle={{ paddingBottom: 20 }}
        onScrollToIndexFailed={(info) => {
          console.log('[Reports] Scroll to index failed, retrying...', info.index);
          const wait = setTimeout(() => {
            if (sectionListRef.current) {
              sectionListRef.current.scrollToLocation({
                sectionIndex: info.highestMeasuredFrameIndex > 0 ? 1 : 0,
                itemIndex: info.index,
                animated: true,
                viewOffset: 100
              });
            }
          }, 500);
          return () => clearTimeout(wait);
        }}
        ListEmptyComponent={
          !isLoading && (
            <View style={styles.emptyState}>
              <Ionicons name="document-text-outline" size={48} color="#ccc" />
              <Text style={styles.emptyText}>
                {viewMode === 'online' && 'No online reports'}
                {viewMode === 'host' && (isHosting ? 'No hosted reports in this group' : 'No host reports')}
                {viewMode === 'history' && 'No reports submitted yet'}
              </Text>
              {viewMode === 'online' && isOffline && (
                <Text style={styles.emptySubText}>
                  Connect to internet to see reports
                </Text>
              )}
              {viewMode === 'host' && !isHosting && (
                <Text style={styles.emptySubText}>
                  Connect to Wi-Fi Direct host to see shared reports
                </Text>
              )}
              {viewMode === 'host' && isHosting && (
                <Text style={styles.emptySubText}>
                  Reports submitted by clients will appear here
                </Text>
              )}
              {viewMode === 'history' && (
                <Text style={styles.emptySubText}>
                  Submit your first emergency report to see it here
                </Text>
              )}
            </View>
          )
        }
      />

      <ReporterContactModal
        visible={showContactModal}
        onClose={() => setShowContactModal(false)}
        reporter={selectedReporter}
        loading={loadingReporter}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 22, fontWeight: 'bold' },
  viewModeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  viewModeText: { fontSize: 13, fontWeight: 'bold', marginLeft: 6 },
  offlineNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff3e0',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#ffb300'
  },
  offlineNoticeText: { flex: 1, fontSize: 13, color: '#e65100', marginLeft: 8 },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    backgroundColor: '#e3f2fd',
    borderRadius: 8,
    marginBottom: 12,
  },
  loadingText: {
    marginLeft: 8,
    fontSize: 13,
    color: '#1565c0',
    fontWeight: '600',
  },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#424242' },
  stickyHeader: { backgroundColor: '#fff', paddingVertical: 6 },
  card: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10
  },
  offlineCard: {
    backgroundColor: '#fafafa',
    borderColor: '#ff9800',
    borderWidth: 2
  },
  hostCard: {
    backgroundColor: '#f5f9ff',
    borderColor: '#2196f3',
    borderWidth: 2
  },
  hostedCard: {
    backgroundColor: '#f1f8f4',
    borderColor: '#4caf50',
    borderWidth: 2
  },
  highlightedCard: {
    borderColor: '#4caf50',
    borderWidth: 3,
    backgroundColor: '#f1f8e9',
    elevation: 6,
    shadowColor: '#4caf50',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ff9800',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 8
  },
  offlineBadgeText: { color: '#fff', fontSize: 11, fontWeight: 'bold', marginLeft: 4 },
  hostBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2196f3',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 8
  },
  hostBadgeText: { color: '#fff', fontSize: 11, fontWeight: 'bold', marginLeft: 4 },
  hostedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4caf50',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 8
  },
  hostedBadgeText: { color: '#fff', fontSize: 11, fontWeight: 'bold', marginLeft: 4 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  syncNowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2196f3'
  },
  syncNowText: { color: '#2196f3', fontSize: 11, fontWeight: 'bold', marginLeft: 4 },
  syncNowBtnDisabled: {
    borderColor: '#e0e0e0',
    backgroundColor: '#f5f5f5',
  },
  syncNowTextDisabled: {
    color: '#aaa',
  },
  syncingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2196f3',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 8
  },
  syncingText: { color: '#fff', fontSize: 11, fontWeight: 'bold', marginLeft: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  type: { fontSize: 16, fontWeight: 'bold' },
  status: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  time: { fontSize: 12, color: '#666', marginTop: 6 },
  reporter: { fontSize: 12, color: '#444', marginTop: 2 },
  description: { fontSize: 12, color: '#666', marginTop: 4, fontStyle: 'italic' },
  badgesRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  badge: { flex: 1, marginRight: 6, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 8 },
  badgeTitle: { fontSize: 11, fontWeight: 'bold', textAlign: 'center' },
  badgeSubRow: { flexDirection: 'column', alignItems: 'center', marginTop: 2 },
  badgeSubText: { fontSize: 11, color: '#333', marginLeft: 4 },
  badgeSubContainer: { alignItems: 'center', marginTop: 4 },
  badgeIconRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  badgeCount: { fontSize: 13, fontWeight: 'bold', color: '#333' },
  badgeSubLabel: { fontSize: 11, color: '#555', marginTop: 2, textAlign: 'center' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 },
  ackBtn: { backgroundColor: '#ffb300', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  ackText: { color: '#fff', fontWeight: 'bold' },
  loadMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e3f2fd',
    padding: 12,
    borderRadius: 8,
    marginVertical: 8,
    marginHorizontal: 4,
  },
  loadMoreText: {
    fontSize: 14,
    color: '#2196f3',
    fontWeight: '600',
    marginLeft: 8,
  },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 16, color: '#999', marginTop: 12, fontWeight: '600' },
  emptySubText: { fontSize: 13, color: '#bbb', marginTop: 4, textAlign: 'center', paddingHorizontal: 40 },
  contactInfoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#e3f2fd',
    borderWidth: 1,
    borderColor: '#bbdefb',
  },
  contactInfoBtnText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#2196f3',
    marginLeft: 4,
  },
});

export default ReportsScreen;