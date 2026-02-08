import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, SectionList, TouchableOpacity, Alert, ActivityIndicator, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import api, { BASE_URL } from '../services/api';
import { useNavigation } from '@react-navigation/native';
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
  removeHostedReport,
  updateHostedReport
} from '../services/offline';
import NetInfo from '@react-native-community/netinfo';
import { isProxyActive } from '../services/ProxyServer';
import io from 'socket.io-client';

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
  const [loadingOffline, setLoadingOffline] = useState(false);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [todayPage, setTodayPage] = useState(1);
  const [earlierPage, setEarlierPage] = useState(1);
  const [longPressedReport, setLongPressedReport] = useState(null);
  const [reportToUnshare, setReportToUnshare] = useState(null);
  const longPressTimerRef = useRef(null);
  const isLongPressingRef = useRef(false);
  const socketRef = useRef(null);
  const { user } = useAuth();
  const navigation = useNavigation();
  const loadingRef = useRef(false);
  const lastLoadTimeRef = useRef(0);
  const lastSyncTimeRef = useRef(0);
  const LOAD_DEBOUNCE_MS = 3000;
  const SYNC_DEBOUNCE_MS = 15000;
  const ITEMS_PER_PAGE = 20;

  const checkConnectivity = async () => {
    const netInfo = await NetInfo.fetch();
    const connected = netInfo.isConnected && netInfo.isInternetReachable;
    
    const isWifiDirectHost = BASE_URL.includes('192.168.49.1');
    
    setIsOffline(!connected && !isWifiDirectHost);
    setIsConnectedToHost(isWifiDirectHost);
    
    return { connected, isWifiDirectHost };
  };

  // Socket.io setup for real-time updates on shared reports
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
        
        // Listen for report updates
        socket.on('report:updated', async (updatedReport) => {
          console.log('[Socket] Report updated:', updatedReport._id);
          
          const hosted = await getHostedReports();
          const isShared = hosted.some(r => r._id === updatedReport._id && (r.sharedFromOnline || r._isPersistentShare));
          
          if (isShared) {
            // CRITICAL: Update while preserving persistence flags
            const existingReport = hosted.find(r => r._id === updatedReport._id);
            await updateHostedReport(updatedReport._id, {
              ...updatedReport,
              sharedFromOnline: existingReport.sharedFromOnline,
              _isPersistentShare: existingReport._isPersistentShare,
              sharedAt: existingReport.sharedAt
            });
            await loadHostedReports();
            console.log('[Socket] Updated shared report with preserved flags:', updatedReport._id);
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
      
      if (connectivity.isWifiDirectHost && !BASE_URL.includes('localhost')) {
        console.log('[Reports] Fetching online reports from host');
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
          console.error('[Reports] Failed to fetch from host:', err.message);
        }
      }
      
      if (connectivity.connected) {
        const { data } = await api.get('/reports', { timeout: 5000 });
        setReports(data);
        
        for (const onlineReport of data) {
          await updateSyncedOfflineReport(onlineReport);
        }
        
        return true;
      }
      
      return false;
    } catch (err) {
      console.error('[Reports] Failed to load online reports:', err.message);
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
        console.log('[Reports] Loaded host reports:', hostOffline.length);
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
      console.log('[Reports] Loaded hosted reports:', hosted.length);
      
      // Log persistence flags for debugging
      const persistentCount = hosted.filter(r => r._isPersistentShare).length;
      if (persistentCount > 0) {
        console.log('[Reports] Persistent shared reports:', persistentCount);
      }
      
      setHostedReports(hosted);
      return true;
    } catch (err) {
      console.error('[Reports] Failed to load hosted reports:', err.message);
      return false;
    }
  };

  const loadOfflineReports = async () => {
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
      setLoadingOffline(true);
      const localOffline = await getStoredOfflineReports();
      
      setOfflineReports(prev => {
        const prevJson = JSON.stringify(prev);
        const newJson = JSON.stringify(localOffline);
        if (prevJson !== newJson) {
          return localOffline;
        }
        return prev;
      });
    } catch (err) {
      console.error('[Reports] Failed to load offline reports:', err);
    } finally {
      setLoadingOffline(false);
      loadingRef.current = false;
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

      const unsyncedReports = offlineReports.filter(r => !r.syncedToBackend && r.isOffline);
      
      if (unsyncedReports.length === 0) {
        return;
      }

      console.log(`[Sync] Starting: ${unsyncedReports.length} reports`);
      
      for (const report of unsyncedReports) {
        setSyncingReports(prev => new Set(prev).add(report._id));
        
        try {
          const location = {};
          if (report.latitude !== undefined && report.longitude !== undefined) {
            location.latitude = report.latitude;
            location.longitude = report.longitude;
          }
          if (report.location?.x !== undefined) location.x = report.location.x;
          if (report.location?.y !== undefined) location.y = report.location.y;
          if (report.location?.description) location.description = report.location.description;
          
          const reportData = {
            type: report.type,
            location: location,
            description: report.description || '',
            imageUri: report.imageUri || null,
            user: report.user,
            createdAt: report.createdAt,
            status: report.status || 'REPORTED',
            statusHistory: report.statusHistory || [],
            syncedFromOffline: true
          };
          
          await api.post('/reports', reportData, { timeout: 15000 });
          await syncOfflineReportsToBackend([report._id]);
          
        } catch (err) {
          console.error('[Sync] Failed:', err.message);
        } finally {
          setSyncingReports(prev => {
            const newSet = new Set(prev);
            newSet.delete(report._id);
            return newSet;
          });
        }
      }
      
      await loadOfflineReports();
      
    } catch (err) {
      console.error('[Sync] Error:', err);
    }
  };

  const load = async (showLoading = true) => {
    if (loadingRef.current && showLoading) {
      return;
    }
    
    const connectivity = await checkConnectivity();
    
    await loadOfflineReports();
    
    const isHosting = isProxyActive();
    if (isHosting) {
      await loadHostedReports();
    }
    
    if (connectivity.connected) {
      console.log('[Reports] Loading online reports (has internet)');
      const success = await loadOnlineReports(showLoading);
      if (success) {
        await syncOfflineReports();
      }
    }
    
    if (connectivity.isWifiDirectHost) {
      console.log('[Reports] Loading host reports (connected to Wi-Fi Direct)');
      await loadHostReports();
    }
    
    if (!initialLoadComplete) {
      setInitialLoadComplete(true);
    }
  };

  useEffect(() => {
    load(true);
    
    const timer = setInterval(() => load(false), 15000);
    
    return () => clearInterval(timer);
  }, [isConnectedToHost]);

  const [busyId, setBusyId] = useState(null);

  const handleLongPressStart = (report) => {
    const isHosting = isProxyActive();
    
    if (!isHosting || viewMode !== 'online') {
      return;
    }
    
    const alreadyHosted = hostedReports.some(r => r._id === report._id);
    if (alreadyHosted) {
      return;
    }
    
    isLongPressingRef.current = false;
    
    longPressTimerRef.current = setTimeout(() => {
      isLongPressingRef.current = true;
      setLongPressedReport(report);
    }, 2500);
  };

  const handleLongPressEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleCardPress = (item) => {
    if (!isLongPressingRef.current) {
      navigation.navigate('Home', { 
        highlightId: item._id, 
        report: item,
        latitude: item.latitude || item.location?.latitude,
        longitude: item.longitude || item.location?.longitude
      });
    }
    isLongPressingRef.current = false;
  };

  const confirmHostReport = async () => {
    if (!longPressedReport) return;
    
    try {
      console.log('[Host] Manually sharing online report:', longPressedReport._id);
      
      // CRITICAL: Add with _isPersistentShare = true for manual shares
      await addHostedReport({
        ...longPressedReport,
        _id: longPressedReport._id,
        latitude: longPressedReport.location?.latitude || 50,
        longitude: longPressedReport.location?.longitude || 50,
        location: longPressedReport.location,
        user: longPressedReport.user,
        createdAt: longPressedReport.createdAt,
        status: longPressedReport.status,
        statusHistory: longPressedReport.statusHistory || [],
        syncedToBackend: true,
        synced: true,
        hostedFromOnline: true,
        sharedFromOnline: true,
        _isPersistentShare: true, // CRITICAL: Mark as persistent
        sharedAt: new Date().toISOString()
      });
      
      await loadHostedReports();
      
      Alert.alert(
        'Report Shared',
        'This report is now shared with connected clients in your Wi-Fi Direct group and will receive real-time updates.',
        [{ text: 'OK' }]
      );
      
      setLongPressedReport(null);
    } catch (error) {
      console.error('[Host] Failed to share report:', error);
      Alert.alert('Error', 'Failed to share report. Please try again.');
      setLongPressedReport(null);
    }
  };

  const handleUnsharePress = (report) => {
    setReportToUnshare(report);
  };

  const confirmUnshare = async () => {
    if (!reportToUnshare) return;
    
    try {
      console.log('[Host] Unsharing report:', reportToUnshare._id);
      
      await removeHostedReport(reportToUnshare._id);
      await loadHostedReports();
      
      Alert.alert(
        'Report Unshared',
        'This report is no longer shared with your Wi-Fi Direct group.',
        [{ text: 'OK' }]
      );
      
      setReportToUnshare(null);
    } catch (error) {
      console.error('[Host] Failed to unshare report:', error);
      Alert.alert('Error', 'Failed to unshare report. Please try again.');
      setReportToUnshare(null);
    }
  };

  const acknowledge = async (id, isOfflineReport, isHostReport, isHostedReport) => {
    try {
      if (busyId === id) return;
      setBusyId(id);
      
      const connectivity = await checkConnectivity();
      
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
      setBusyId(id);
      
      const connectivity = await checkConnectivity();
      
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
    setTodayPage(1);
    setEarlierPage(1);
    
    if (viewMode === 'online') {
      setViewMode('host');
    } else if (viewMode === 'host') {
      setViewMode('offline');
    } else {
      setViewMode('online');
    }
  };

  const getViewModeIcon = () => {
    switch (viewMode) {
      case 'online':
        return { name: 'cloud-done', color: '#4caf50' };
      case 'host':
        return { name: 'wifi', color: '#2196f3' };
      case 'offline':
        return { name: 'cloud-offline', color: '#ff9800' };
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
      case 'offline':
        return 'Offline';
      default:
        return 'Online';
    }
  };

  const renderItem = ({ item }) => {
    const isSyncing = syncingReports.has(item._id);
    const isOfflineReport = item.isOffline && !item.fromHost && !item.hostedInGroup;
    const isHostReport = item.fromHost;
    const isHostedReport = item.hostedInGroup;
    const isSharedFromOnline = item.sharedFromOnline === true;
    const isPersistentShare = item._isPersistentShare === true;
    const isHosting = isProxyActive();
    
    const isBeingHosted = isHosting && viewMode === 'online' && hostedReports.some(r => r._id === item._id);
    
    return (
      <Pressable
        onPressIn={() => {
          if (isHosting && viewMode === 'online') {
            handleLongPressStart(item);
          }
        }}
        onPressOut={() => {
          handleLongPressEnd();
        }}
        onPress={() => handleCardPress(item)}
        style={[
          styles.card,
          isOfflineReport && styles.offlineCard,
          isHostReport && styles.hostCard,
          isHostedReport && !isSharedFromOnline && styles.hostedCard,
          isSharedFromOnline && styles.sharedCard,
          isBeingHosted && styles.beingHostedCard
        ]}
      >
        {isOfflineReport && (
          <View style={styles.offlineBadge}>
            <Ionicons name="cloud-offline" size={14} color="#fff" />
            <Text style={styles.offlineBadgeText}>
              {item.syncedToBackend ? 'Synced to Backend' : 'Pending Sync'}
            </Text>
          </View>
        )}

        {isHostReport && (
          <View style={styles.hostBadge}>
            <Ionicons name="wifi" size={14} color="#fff" />
            <Text style={styles.hostBadgeText}>
              From Host (Wi-Fi Direct)
            </Text>
          </View>
        )}

        {isHostedReport && !isSharedFromOnline && (
          <View style={styles.hostedBadge}>
            <Ionicons name="radio" size={14} color="#fff" />
            <Text style={styles.hostedBadgeText}>
              Hosted in Group {item.syncedToBackend ? '• Synced Online' : '• Pending Sync'}
            </Text>
          </View>
        )}

        {isSharedFromOnline && (
          <View style={styles.sharedBadge}>
            <Ionicons name="share-social" size={14} color="#fff" />
            <Text style={styles.sharedBadgeText}>
              Shared from Online • Real-time Updates {isPersistentShare ? '• Persistent' : ''}
            </Text>
            {isHosting && viewMode === 'host' && isPersistentShare && (
              <TouchableOpacity 
                onPress={() => handleUnsharePress(item)}
                style={styles.unshareButton}
              >
                <Ionicons name="close-circle" size={18} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        )}

        {isBeingHosted && (
          <View style={styles.beingHostedBadge}>
            <Ionicons name="share-social" size={14} color="#fff" />
            <Text style={styles.beingHostedBadgeText}>
              Sharing with Group
            </Text>
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
          <View style={[styles.status, { backgroundColor: statusColor(item.status) }]}>
            <Text style={styles.statusText}>{item.status}</Text>
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
    if (isHosting) {
      displayReports = hostedReports.filter(r => r.hostedInGroup === true);
    } else {
      displayReports = hostReports.filter(r => r.fromHost === true);
    }
  } else if (viewMode === 'offline') {
    displayReports = offlineReports.filter(r => !r.fromHost && !r.hostedInGroup);
  }
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const allTodayReports = displayReports.filter((r) => new Date(r.createdAt) >= today);
  const allEarlierReports = displayReports.filter((r) => new Date(r.createdAt) < today);
  
  const todayReports = allTodayReports.slice(0, todayPage * ITEMS_PER_PAGE);
  const earlierReports = allEarlierReports.slice(0, earlierPage * ITEMS_PER_PAGE);
  
  const hasMoreToday = allTodayReports.length > todayReports.length;
  const hasMoreEarlier = allEarlierReports.length > earlierReports.length;

  const offlineCount = offlineReports.filter(r => !r.syncedToBackend && !r.fromHost && !r.hostedInGroup).length;
  const sharedCount = hostedReports.filter(r => r._isPersistentShare).length;
  const iconData = getViewModeIcon();

  const isLoading = !initialLoadComplete && (
    (viewMode === 'online' && loadingOnline) || 
    (viewMode === 'host' && loadingHost) || 
    (viewMode === 'offline' && loadingOffline)
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

      {isHosting && viewMode === 'online' && (
        <View style={[styles.offlineNotice, { backgroundColor: '#e8f5e9', borderColor: '#4caf50' }]}>
          <Ionicons name="information-circle" size={20} color="#4caf50" />
          <Text style={[styles.offlineNoticeText, { color: '#2e7d32' }]}>
            Long-press any report for 2.5s to share it with your Wi-Fi Direct group. {sharedCount > 0 && `Currently sharing ${sharedCount} report${sharedCount > 1 ? 's' : ''}.`}
          </Text>
        </View>
      )}
      
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
            Reports hosted in your Wi-Fi Direct group. Shared reports receive real-time updates. Tap 'X' to unshare.
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
      
      {viewMode === 'offline' && (
        <View style={styles.offlineNotice}>
          <Ionicons name="cloud-offline" size={20} color="#ff9800" />
          <Text style={[styles.offlineNoticeText, { color: '#e65100' }]}>
            Showing your offline reports. {offlineCount > 0 ? `${offlineCount} pending sync.` : 'All synced.'}
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
        ListEmptyComponent={
          !isLoading && (
            <View style={styles.emptyState}>
              <Ionicons name="document-text-outline" size={48} color="#ccc" />
              <Text style={styles.emptyText}>
                {viewMode === 'online' && 'No online reports'}
                {viewMode === 'host' && (isHosting ? 'No hosted reports in this group' : 'No host reports')}
                {viewMode === 'offline' && 'No offline reports'}
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
                  Reports submitted by clients or shared online reports will appear here
                </Text>
              )}
            </View>
          )
        }
      />

      {longPressedReport && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Ionicons name="share-social" size={48} color="#4caf50" />
            <Text style={styles.modalTitle}>Share This Report?</Text>
            <Text style={styles.modalText}>
              Share this {longPressedReport.type} emergency report with connected clients in your Wi-Fi Direct group? It will receive real-time updates from the backend.
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={() => setLongPressedReport(null)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalConfirmButton]}
                onPress={confirmHostReport}
              >
                <Text style={styles.modalConfirmText}>Share Report</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {reportToUnshare && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Ionicons name="close-circle" size={48} color="#f44336" />
            <Text style={styles.modalTitle}>Stop Sharing Report?</Text>
            <Text style={styles.modalText}>
              Stop sharing this {reportToUnshare.type} emergency report with your Wi-Fi Direct group? Clients will no longer see updates.
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={() => setReportToUnshare(null)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: '#f44336' }]}
                onPress={confirmUnshare}
              >
                <Text style={styles.modalConfirmText}>Stop Sharing</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
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
  sharedCard: {
    backgroundColor: '#fff9e6',
    borderColor: '#ffa726',
    borderWidth: 2
  },
  beingHostedCard: {
    backgroundColor: '#fef5e7',
    borderColor: '#f39c12',
    borderWidth: 2
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
  sharedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffa726',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 8
  },
  sharedBadgeText: { color: '#fff', fontSize: 11, fontWeight: 'bold', marginLeft: 4, flex: 1 },
  unshareButton: {
    marginLeft: 8,
    padding: 2
  },
  beingHostedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f39c12',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 8
  },
  beingHostedBadgeText: { color: '#fff', fontSize: 11, fontWeight: 'bold', marginLeft: 4 },
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
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    maxWidth: 400,
    width: '100%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  modalText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalCancelButton: {
    backgroundColor: '#f5f5f5',
  },
  modalConfirmButton: {
    backgroundColor: '#4caf50',
  },
  modalCancelText: {
    color: '#666',
    fontWeight: '600',
    fontSize: 14,
  },
  modalConfirmText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
});

export default ReportsScreen;