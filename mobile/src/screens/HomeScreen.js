import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing, Alert, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import Map2D from '../components/Map2D';
import ProfileSidebar from '../components/ProfileSidebar';
import api, { BASE_URL, isConnectedToWifiDirect } from '../services/api';
import io from 'socket.io-client';
import Constants from 'expo-constants';
import { Platform, Dimensions, TouchableWithoutFeedback } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { isProxyActive } from '../services/ProxyServer';
import * as Notifications from 'expo-notifications';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const HomeScreen = () => {
  const { user, logout } = useAuth();
  const navigation = useNavigation();
  const route = useRoute();
  const [showEmergencyTypes, setShowEmergencyTypes] = useState(false);
  const [latestAlert, setLatestAlert] = useState(null);
  const [socket, setSocket] = useState(null);
  const [isAlertVisible, setIsAlertVisible] = useState(true);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [showProfile, setShowProfile] = useState(false);
  const panelWidth = Math.round(Dimensions.get('window').width * 0.85);
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('OFFLINE');
  const [activeReportsCount, setActiveReportsCount] = useState(0);

  // Register for push notifications
  useEffect(() => {
    const registerForPushNotificationsAsync = async () => {
      if (!Constants.isDevice && Platform.OS !== 'web') {
        console.log('[Push] Must use physical device for Push Notifications. (Detected as Emulator/Simulator)');
        return;
      }

      try {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }

        if (finalStatus !== 'granted') {
          console.log('[Push] Failed to get push token for push notification!');
          return;
        }

        const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
        if (!projectId) {
          console.log('[Push] Project ID not found in config');
        }

        const token = (await Notifications.getExpoPushTokenAsync({
          projectId: projectId,
        })).data;

        console.log('[Push] Token:', token);

        // Save token to backend
        if (user && user._id) {
          console.log('[Push] Sending token to backend...');
          const res = await api.put('/users/profile', { pushToken: token });
          console.log('[Push] Backend response:', res.status);
        }

        if (Platform.OS === 'android') {
          Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#FF231F7C',
          });
        }
      } catch (error) {
        console.error('[Push] Registration error:', error);
      }
    };

    if (user) {
      registerForPushNotificationsAsync();
    }
  }, [user]);

  // Handle incoming notifications
  useEffect(() => {
    const notificationListener = Notifications.addNotificationReceivedListener(notification => {
      console.log('[Push] Notification received:', notification);
      // Optional: Refresh data if a new report comes in
      if (notification.request.content.data?.type === 'NEW_REPORT') {
        fetchActiveReports();
      }
    });

    const responseListener = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      console.log('[Push] Notification clicked:', data);

      if (data?.reportId) {
        navigation.navigate('Reports', { highlightId: data.reportId });
      }
    });

    return () => {
      notificationListener.remove();
      responseListener.remove();
    };
  }, []);

  const fetchActiveReports = async () => {
    try {
      const { data } = await api.get('/reports/unseen');
      if (data && typeof data.count === 'number') {
        setActiveReportsCount(data.count);
      }

      // Still fetch active reports for the latest alert display if needed
      const activeRes = await api.get('/reports/active');
      if (Array.isArray(activeRes.data) && activeRes.data.length > 0) {
        const latest = [...activeRes.data].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
        setLatestAlert(latest);
      } else {
        setLatestAlert(null);
      }
    } catch (e) {
      console.log('[Home] Error fetching active reports:', e);
    }
  };

  // Check connectivity status
  useEffect(() => {
    const checkConnectivity = async () => {
      try {
        const netInfo = await NetInfo.fetch();
        const hasInternet = netInfo.isConnected && netInfo.isInternetReachable;
        const isWifiDirectHost = BASE_URL.includes('192.168.49.1');
        const isHosting = isProxyActive();
        const isClientConnected = isConnectedToWifiDirect();

        // Determine connection status with new logic
        if (hasInternet && isHosting) {
          // Host user connected to backend and hosting
          setConnectionStatus('ONLINE/HOSTING');
          setIsConnected(true);
        } else if (!hasInternet && isHosting) {
          // Host user not connected to backend but hosting
          setConnectionStatus('HOSTING');
          setIsConnected(true);
        } else if (hasInternet && (isWifiDirectHost || isClientConnected)) {
          // Connected user connected to both backend and host
          setConnectionStatus('ONLINE/CONNECTED');
          setIsConnected(true);
        } else if (!hasInternet && (isWifiDirectHost || isClientConnected)) {
          // Connected user not connected to backend but connected to host
          setConnectionStatus('CONNECTED');
          setIsConnected(true);
        } else if (hasInternet && !isHosting && !isWifiDirectHost && !isClientConnected) {
          // Normal user connected to backend only
          setConnectionStatus('ONLINE');
          setIsConnected(true);
        } else {
          // Offline
          setConnectionStatus('OFFLINE');
          setIsConnected(false);
        }
      } catch (e) {
        console.log('Connectivity check error:', e);
        setConnectionStatus('OFFLINE');
        setIsConnected(false);
      }
    };

    checkConnectivity();
    const interval = setInterval(checkConnectivity, 3000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (latestAlert && latestAlert.status !== 'RESOLVED') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [latestAlert, pulseAnim]);

  const handleSOSPress = () => {
    setShowEmergencyTypes(!showEmergencyTypes);
  };

  const handleEmergencySelect = async (type) => {
    setShowEmergencyTypes(false);

    // Check if user can submit reports (online, connected to Wi-Fi Direct host, or hosting)
    const netInfo = await NetInfo.fetch();
    const hasInternet = netInfo.isConnected && netInfo.isInternetReachable;
    const isWifiDirectHost = BASE_URL.includes('192.168.49.1');
    const isHosting = isProxyActive();

    if (!hasInternet && !isWifiDirectHost && !isHosting) {
      Alert.alert(
        'No Connection',
        'You need to connect to the internet, host a Wi-Fi Direct group, or connect to a host to submit emergency reports.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Connect Now',
            onPress: () => navigation.navigate('WifiDirect')
          }
        ]
      );
      return;
    }

    navigation.navigate('Report', { type });
  };

  useFocusEffect(
    React.useCallback(() => {
      fetchActiveReports();
      console.log('HomeScreen focused, connecting to:', BASE_URL);
      let s = null;
      try {
        const socketUrl = BASE_URL.replace(/\/api$/, '');
        console.log('Socket URL:', socketUrl);
        s = io(socketUrl, {
          transports: ['websocket'],
          reconnection: true,
          reconnectionAttempts: 5,
          timeout: 10000,
          query: { token: user?.token }
        });
        setSocket(s);

        s.on('connect', () => {
          console.log('Socket connected for real-time alerts');
        });
        s.on('disconnect', () => {
          console.log('Socket disconnected');
        });
        s.on('connect_error', (err) => {
          console.log('Socket connection error:', err);
        });

        s.on('report:created', (report) => {
          setLatestAlert(report);
          // Increment unseen count when new report is created
          setActiveReportsCount(prev => prev + 1);
        });
        s.on('report:updated', (report) => setLatestAlert(report));
      } catch (e) {
        console.log('Socket init error:', e);
      }

      return () => {
        if (s) {
          console.log('HomeScreen blurred, disconnecting socket');
          s.disconnect();
        }
      };
    }, [user])
  );

  React.useEffect(() => {
    fetchActiveReports();
    const interval = setInterval(fetchActiveReports, 10000); // Poll every 10s
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    Animated.timing(overlayOpacity, { toValue: showProfile ? 0.25 : 0, duration: 200, useNativeDriver: true }).start();
  }, [showProfile, overlayOpacity]);

  const displayAlert = route?.params?.report || latestAlert;
  const iconColor = displayAlert?.status === 'RESOLVED' ? '#1976d2' : '#d32f2f';
  const alertTitle = (() => {
    if (!displayAlert?.type) return '';
    if (displayAlert.type === 'Medical') return '🚨 MEDICAL EMERGENCY ALERT';
    if (displayAlert.type === 'Fire') return '🚨 FIRE EMERGENCY ALERT';
    if (displayAlert.type === 'Earthquake') return '🚨 EARTHQUAKE ALERT';
    if (displayAlert.type === 'Security') return '🚨 SECURITY ALERT';
    if (displayAlert.type === 'Accident') return '🚨 ACCIDENT ALERT';
    return '🚨 OTHER EMERGENCY ALERT';
  })();
  const alertBody = (() => {
    if (!displayAlert?.type) return '';
    if (displayAlert.type === 'Medical') return 'A medical emergency has been reported.';
    if (displayAlert.type === 'Fire') return 'A fire emergency has been reported.';
    if (displayAlert.type === 'Earthquake') return 'An earthquake incident has been reported.';
    if (displayAlert.type === 'Security') return 'A security incident has been reported.';
    if (displayAlert.type === 'Accident') return 'An accident has been reported.';
    return 'An emergency situation has been reported.';
  })();
  const alertFooter = (() => {
    if (!displayAlert?.type) return '';
    if (displayAlert.type === 'Medical') return '⚠️ Immediate medical assistance is required. Please respond now.';
    if (displayAlert.type === 'Fire') return '⚠️ Immediate evacuation and fire response are required. Please respond now.';
    if (displayAlert.type === 'Earthquake') return '⚠️ Seek safe shelter immediately and follow emergency protocols.';
    return '⚠️ Immediate assistance may be required. Please stay alert and respond accordingly.';
  })();
  const reporterName = displayAlert?.user ? `${displayAlert.user.lastName}, ${displayAlert.user.firstName} (${displayAlert.user.role})` : 'Unknown';
  const locationText = displayAlert?.location?.x != null && displayAlert?.location?.y != null ? `x:${Math.round(displayAlert.location.x)} y:${Math.round(displayAlert.location.y)}` : 'Not specified';
  const timeText = displayAlert?.createdAt ? new Date(displayAlert.createdAt).toLocaleString() : '';

  const toggleAlertVisibility = () => {
    setIsAlertVisible(!isAlertVisible);
  };

  // Get connection status color and icon
  const getConnectionIcon = () => {
    if (connectionStatus === 'OFFLINE') {
      return { name: 'cloud-offline', color: '#bdbdbd' };
    } else if (connectionStatus.includes('HOSTING')) {
      return { name: 'wifi', color: '#4caf50' };
    } else if (connectionStatus.includes('CONNECTED')) {
      return { name: 'wifi', color: '#4caf50' };
    } else {
      return { name: 'cloud-done', color: '#4caf50' };
    }
  };

  const connectionIcon = getConnectionIcon();

  return (
    <SafeAreaView style={styles.container}>
      {/* Alert notification at top center */}
      {displayAlert && (
        <View style={styles.topAlertContainer}>
          <TouchableOpacity
            style={styles.topAlert}
            onPress={toggleAlertVisibility}
            activeOpacity={0.9}
          >
            <Animated.View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: iconColor,
                alignItems: 'center',
                justifyContent: 'center',
                transform: [{ scale: pulseAnim }],
                elevation: 6,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 3 },
                shadowOpacity: 0.3,
                shadowRadius: 4,
              }}
            >
              <Ionicons name="alert" size={32} color="#fff" />
            </Animated.View>
          </TouchableOpacity>
        </View>
      )}

      {/* Alert Details Box */}
      {displayAlert && isAlertVisible && (
        <View style={styles.alertDetailsContainer}>
          <View style={styles.alertBox}>
            <Text style={styles.alertTitle}>{alertTitle}</Text>
            <Text style={styles.alertLine}>{alertBody}</Text>
            <Text style={styles.alertLine}>Reporter: {reporterName}</Text>
            <Text style={styles.alertLine}>Location: {locationText}</Text>
            <Text style={styles.alertLine}>Time Reported: {timeText}</Text>
            <Text style={styles.alertFooter}>{alertFooter}</Text>
          </View>
        </View>
      )}

      {/* Header with Logo and Profile */}
      <View style={styles.header}>
        <Image
          source={require('../../assets/splash-icon.png')}
          style={styles.headerLogo}
        />
        <View style={styles.headerRight}>
          <View style={styles.userInfo}>
            <Text style={styles.headerName}>{user?.firstName} {user?.lastName}</Text>
            <Text style={styles.headerRole}>{user?.role}</Text>
          </View>
          <TouchableOpacity onPress={() => setShowProfile(true)} activeOpacity={0.85}>
            <View style={styles.profileIconContainer}>
              <Ionicons name="menu" size={32} color="#2b4266" />
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* Connection Indicator - Absolute Positioned below profile */}
      <View style={{
        position: 'absolute',
        top: 100,
        right: 16,
        alignItems: 'center',
        zIndex: 20
      }}>
        <Ionicons
          name={connectionIcon.name}
          size={24}
          color={connectionIcon.color}
        />
        <Text style={{
          fontSize: 9,
          color: connectionIcon.color,
          fontWeight: 'bold',
          textAlign: 'center'
        }}>
          {connectionStatus}
        </Text>
      </View>

      {/* Map Container */}
      <View style={styles.mapContainer}>
        <Map2D
          onConfirmLocation={async ({ xPct, yPct }) => {
            // Check connectivity before allowing location selection
            const netInfo = await NetInfo.fetch();
            const hasInternet = netInfo.isConnected && netInfo.isInternetReachable;
            const isWifiDirectHost = BASE_URL.includes('192.168.49.1');
            const isHosting = isProxyActive();

            if (!hasInternet && !isWifiDirectHost && !isHosting) {
              Alert.alert(
                'No Connection',
                'You need to connect to the internet, host a Wi-Fi Direct group, or connect to a host to submit emergency reports.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Connect Now',
                    onPress: () => navigation.navigate('WifiDirect')
                  }
                ]
              );
              return;
            }

            navigation.navigate('Report', { type: 'Other', presetLocation: { x: xPct, y: yPct } });
          }}
          highlightId={displayAlert?._id}
          focusTo={displayAlert?.location}
        />
      </View>

      {/* Profile Sidebar */}
      {showProfile && (
        <>
          <View style={styles.profileOverlay}>
            <TouchableWithoutFeedback onPress={() => setShowProfile(false)}>
              <Animated.View style={[styles.profileBackdrop, { right: panelWidth, opacity: overlayOpacity }]} />
            </TouchableWithoutFeedback>
          </View>
          <ProfileSidebar visible={showProfile} onClose={() => setShowProfile(false)} user={{ ...user, logout }} panelWidth={panelWidth} />
        </>
      )}

      {/* Emergency Action Bar - Bottom */}
      <View style={styles.actionBar}>
        {/* Curved background arcs */}
        <View style={styles.leftArc} />
        <View style={styles.rightArc} />
        <View style={styles.centerStrip} />

        {/* Emergency Hotlines - Left */}
        <View style={styles.leftButtonContainer}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => navigation.navigate('Hotlines', { activeType: displayAlert?.type })}
            activeOpacity={0.85}
          >
            <View style={styles.iconCircleWhite}>
              <Ionicons name="call" size={32} color="#2b4266" />
            </View>
            <Text style={styles.actionTextLight}>Emergency Hotlines</Text>
          </TouchableOpacity>
        </View>

        {/* SOS Button - Center */}
        <TouchableOpacity
          style={styles.sosButton}
          onPress={handleSOSPress}
          activeOpacity={0.85}
        >
          <View style={styles.sosCircle}>
            <Image
              source={require('../../assets/SafePoint-assets/SOS-icon.png')}
              style={{ width: 100, height: 100 }}
              resizeMode="contain"
            />
          </View>
        </TouchableOpacity>

        {/* Emergency Report - Right */}
        <View style={styles.rightButtonContainer}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={async () => {
              try {
                // Reset unseen reports count by updating lastSeenReport
                await api.put('/users/profile', { lastSeenReport: new Date() });
                setActiveReportsCount(0);
              } catch (e) {
                console.log('[Home] Error resetting unseen count:', e);
              }
              navigation.navigate('Reports');
            }}
            activeOpacity={0.85}
          >
            <View style={styles.iconCircleWhite}>
              <Ionicons name="alert-circle" size={32} color="#2b4266" />
              {activeReportsCount > 0 && (
                <View style={styles.badgeContainer}>
                  <Text style={styles.badgeText}>{activeReportsCount}</Text>
                </View>
              )}
            </View>
            <Text style={styles.actionTextLight}>Emergency Report</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Emergency Type Modal/Popup */}
      {showEmergencyTypes && (
        <View style={styles.popupContainer}>
          <View style={styles.popup}>
            <View style={styles.popupRow}>
              <TouchableOpacity
                style={styles.typeButton}
                onPress={() => handleEmergencySelect('Medical')}
              >
                <View style={[styles.iconCircle, { borderColor: '#e53935' }]}>
                  <Ionicons name="medkit" size={24} color="#e53935" />
                </View>
                <Text style={styles.typeText}>Medical</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.typeButton}
                onPress={() => handleEmergencySelect('Fire')}
              >
                <View style={[styles.iconCircle, { borderColor: '#f57c00' }]}>
                  <Ionicons name="flame" size={24} color="#f57c00" />
                </View>
                <Text style={styles.typeText}>Fire</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.typeButton}
                onPress={() => handleEmergencySelect('Earthquake')}
              >
                <View style={[styles.iconCircle, { borderColor: '#2e7d32' }]}>
                  <Ionicons name="pulse" size={24} color="#2e7d32" />
                </View>
                <Text style={styles.typeText}>Earthquake</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.popupRow}>
              <TouchableOpacity
                style={styles.typeButton}
                onPress={() => handleEmergencySelect('Security')}
              >
                <View style={[styles.iconCircle, { borderColor: '#fbc02d' }]}>
                  <Ionicons name="shield" size={24} color="#fbc02d" />
                </View>
                <Text style={styles.typeText}>Security</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.typeButton}
                onPress={() => handleEmergencySelect('Other')}
              >
                <View style={[styles.iconCircle, { borderColor: '#555' }]}>
                  <Ionicons name="ellipsis-horizontal" size={24} color="#555" />
                </View>
                <Text style={styles.typeText}>Other</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.typeButton}
                onPress={() => handleEmergencySelect('Accident')}
              >
                <View style={[styles.iconCircle, { borderColor: '#fb8c00' }]}>
                  <Ionicons name="accessibility-outline" size={24} color="#fb8c00" />
                </View>
                <Text style={styles.typeText}>Accident</Text>
              </TouchableOpacity>
            </View>
          </View>
          {/* Arrow pointing down to SOS button */}
          <View style={styles.arrowDown} />
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },

  // Alert notification at top center
  topAlertContainer: {
    position: 'absolute',
    top: 20,
    left: 0,
    right: 0,
    zIndex: 30,
    alignItems: 'center',
  },
  topAlert: {
    alignItems: 'center',
    justifyContent: 'center',
    top: 20,
    left: 0,
    right: 0,
    zIndex: 30,
    alignItems: 'center',
  },

  // Alert details box
  alertDetailsContainer: {
    position: 'absolute',
    top: 85,
    left: 16,
    right: 16,
    zIndex: 25,
  },
  alertBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 20,
    paddingHorizontal: 16,
    borderWidth: 2,
    borderColor: '#e53935',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  alertTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#c62828',
    textAlign: 'center',
    marginBottom: 8
  },
  alertLine: {
    fontSize: 12,
    color: '#333',
    textAlign: 'center',
    marginVertical: 2,
  },
  alertFooter: {
    fontSize: 12,
    color: '#c62828',
    textAlign: 'center',
    marginTop: 8,
    fontWeight: '600',
  },

  // Header
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerLogo: {
    width: 140,
    height: 45,
    resizeMode: 'contain',
    marginLeft: -50,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginRight: -10,
  },
  userInfo: {
    alignItems: 'flex-end',
  },
  headerName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2b4266',
  },
  headerRole: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  profileIconContainer: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Profile overlay
  profileOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 29
  },
  profileBackdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#000'
  },

  // Map
  mapContainer: {
    flex: 1,
    backgroundColor: '#e0e0e0',
  },

  // Action Bar - Bottom navigation
  actionBar: {
    height: 160,
    backgroundColor: 'transparent',
    position: 'relative',
  },
  leftArc: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    width: '50%',
    height: 160,
    backgroundColor: '#2b4266',
    borderTopRightRadius: 200,
    borderBottomRightRadius: 0,
  },
  rightArc: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: '50%',
    height: 160,
    backgroundColor: '#2b4266',
    borderTopLeftRadius: 200,
    borderBottomLeftRadius: 0,
  },
  centerStrip: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 60,
    backgroundColor: '#2b4266',
  },
  leftButtonContainer: {
    position: 'absolute',
    left: 15,
    bottom: 30,
    alignItems: 'center',
  },
  rightButtonContainer: {
    position: 'absolute',
    right: 15,
    bottom: 30,
    alignItems: 'center',
  },
  actionButton: {
    alignItems: 'center',
    width: 100,
  },
  iconCircleWhite: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    position: 'relative', // Add relative for absolute badge
  },
  badgeContainer: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#d32f2f',
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    elevation: 5,
    zIndex: 10,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
    paddingHorizontal: 4,
  },
  actionTextLight: {
    textAlign: 'center',
    fontSize: 11,
    color: '#fff',
    marginTop: 8,
    fontWeight: '600',
    lineHeight: 14,
  },

  // SOS Button
  sosButton: {
    alignItems: 'center',
    marginBottom: 50,
    position: 'absolute',
    left: '50%',
    marginLeft: -60,
    bottom: 20,
  },
  sosCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    borderWidth: 4,
    borderColor: '#d32f2f',
  },
  sosText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 4,
  },

  // Emergency Type Popup
  popupContainer: {
    position: 'absolute',
    bottom: 180,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 20,
  },
  popup: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 24,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    width: '85%',
    alignItems: 'center',
  },
  popupRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: 16,
  },
  typeButton: {
    alignItems: 'center',
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
    backgroundColor: '#fff',
  },
  typeText: {
    fontSize: 11,
    color: '#333',
    fontWeight: '600',
  },
  arrowDown: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 12,
    borderRightWidth: 12,
    borderBottomWidth: 0,
    borderTopWidth: 18,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: 'white',
    marginTop: -1,
    elevation: 8,
  },
});

export default HomeScreen;