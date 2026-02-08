import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Platform, ActivityIndicator, PermissionsAndroid, ToastAndroid, DeviceEventEmitter } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { CameraView, Camera } from 'expo-camera';
import QRCode from 'react-native-qrcode-svg';
import * as IntentLauncher from 'expo-intent-launcher';
import { 
  initialize, 
  startDiscoveringPeers, 
  stopDiscoveringPeers, 
  subscribeOnPeersUpdates, 
  unsubscribeFromPeersUpdates, 
  subscribeOnConnectionInfoUpdates, 
  unsubscribeFromConnectionInfoUpdates, 
  connect, 
  createGroup, 
  removeGroup, 
  getAvailablePeers, 
  getConnectionInfo 
} from 'react-native-wifi-p2p';
import * as Location from 'expo-location';
import api, { BASE_URL, initApiConfig, updateApiConfig, setWifiDirectConnection } from '../services/api';
import { hasPending, getPendingCount, clearIfAllSent, syncToBackend, drainClientToHost } from '../services/offline';
import Constants from 'expo-constants';
import { useAuth } from '../context/AuthContext';

let Proxy = null;
const ensureProxy = () => {
  if (Proxy) return true;
  try {
    Proxy = require('../services/ProxyServer');
    return true;
  } catch {
    return false;
  }
};

let wifiP2PInitialized = false;
let discoveringActive = false;
let hostingActive = false;

const WifiDirectScreen = () => {
  const navigation = useNavigation();
  const { user } = useAuth();
  const [mode, setMode] = useState(null);
  const [peers, setPeers] = useState([]);
  const [connected, setConnected] = useState(false);
  const [connectionInfo, setConnectionInfo] = useState(null);
  const [hasPermission, setHasPermission] = useState(null);
  const [scanned, setScanned] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [hintVisible, setHintVisible] = useState(true);
  const [hostStartTs, setHostStartTs] = useState(null);
  const [setupMs, setSetupMs] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [lanUrl, setLanUrl] = useState(BASE_URL);
  const [peerIdentities, setPeerIdentities] = useState({});
  const [hostReady, setHostReady] = useState(false);
  const hostDeviceName = Constants?.deviceName || 'This Device';
  const proxySetRef = React.useRef(false);
 
  const isBackendReachable = async () => {
    try {
      const root = BASE_URL.replace(/\/api$/, '');
      const urls = [
        `${root}/api/health`,
        `${root}/health`,
        `${root}`
      ];
      for (let i = 0; i < urls.length; i++) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 4000);
          const res = await fetch(urls[i], { method: 'GET', signal: controller.signal });
          clearTimeout(timeout);
          if (res && res.status >= 200 && res.status < 300) return true;
        } catch (e) {}
      }
      return false;
    } catch {
      return false;
    }
  };

  // Identify self when connected as client
  useEffect(() => {
    if (connected && mode === 'connect' && user?.fullName) {
       const timer = setTimeout(async () => {
          try {
            const targetUrl = BASE_URL.includes('192.168.49.1') ? BASE_URL : 'http://192.168.49.1:8080';
            if (targetUrl !== BASE_URL) {
               await updateApiConfig(targetUrl);
            }
            await api.post('/p2p/identify', {
               fullName: user.fullName,
               deviceName: hostDeviceName
            });
            console.log('[Client] Sent identity to host');
          } catch(e) { console.log('Identity send failed', e); }
       }, 3000);
       return () => clearTimeout(timer);
    }
  }, [connected, mode, user?.fullName, hostDeviceName]);

  // Listen for peer identities (Host side)
  useEffect(() => {
     const sub = DeviceEventEmitter.addListener('P2P_PEER_IDENTIFY', (data) => {
        if (data && data.deviceName && data.fullName) {
           console.log('[Host] Received peer identity:', data.fullName);
           setPeerIdentities(prev => ({ ...prev, [data.deviceName]: data.fullName }));
        }
     });
     return () => sub.remove();
  }, []);

  useEffect(() => {
    (async () => {
      // Runtime permissions (Android 13+: NEARBY_WIFI_DEVICES + Fine Location)
      try {
        if (Platform.OS === 'android') {
          if (Platform.Version >= 33) {
            const nearbyResult = await PermissionsAndroid.request('android.permission.NEARBY_WIFI_DEVICES');
            if (nearbyResult !== PermissionsAndroid.RESULTS.GRANTED) {
              Alert.alert('Permission Required', 'Nearby WiFi Devices permission is needed for Wi-Fi Direct');
            }
          }
          const locationResult = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
          if (locationResult !== PermissionsAndroid.RESULTS.GRANTED) {
            Alert.alert('Permission Required', 'Location permission is needed for Wi-Fi Direct');
          }
        }
      } catch (permErr) {
        console.log('Permission request error:', permErr);
      }

      // Initialize Wi-Fi P2P (guard to avoid "initialized once" error)
      if (!wifiP2PInitialized) {
        try {
          await initialize();
          wifiP2PInitialized = true;
          setIsSupported(true);
          console.log('[WiFi Direct] Initialized successfully');
        } catch (e) {
          if (e && e.message && e.message.includes('initialized once')) {
            wifiP2PInitialized = true;
            setIsSupported(true);
            console.log('[WiFi Direct] Already initialized');
          } else {
            console.log("Wi-Fi Direct not supported or failed to initialize:", e);
            setIsSupported(false);
            return;
          }
        }
      } else {
        setIsSupported(true);
      }
        
      // Request Camera Permissions
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
      
      // Request Location Permissions
      let { status: locationStatus } = await Location.requestForegroundPermissionsAsync();
      if (locationStatus !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required for Wi-Fi Direct');
      }
    })();

    // Restore ongoing session state on remount
    const checkConnection = async () => {
      try {
        const info = await getConnectionInfo();
        console.log('Initial Connection Info:', info);
        if (info && info.groupFormed) {
          setConnectionInfo(info);
          setConnected(true);
          
          if (info.isGroupOwner) {
            setMode('host');
            hostingActive = true;
            setHostReady(true);
          } else {
            setMode('connect');
            discoveringActive = true;
            setIsDiscovering(true);
          }
        } else {
          if (hostingActive) setMode('host');
          if (discoveringActive) { setMode('connect'); setIsDiscovering(true); }
        }
      } catch (e) {
        console.log('Error checking initial connection:', e);
      }
    };
    
    checkConnection();

    setLanUrl(BASE_URL);

    if (!isSupported) return;

    // Subscriptions
    const peersSubscription = subscribeOnPeersUpdates(({ devices }) => {
      console.log('Peers updated:', devices.length, 'devices');
      setPeers(devices);
    });

    const connectionSubscription = subscribeOnConnectionInfoUpdates(async (info) => {
      console.log('Connection Info Update:', info);
      setConnectionInfo(info);
      setConnected(info.groupFormed);
      
      if (info.groupFormed) {
        if (info.isGroupOwner) {
           setMode('host');
           hostingActive = true;
           
           // Sync to backend if available
           try {
             const ok = await isBackendReachable();
             if (ok) {
               console.log('[Host] Backend reachable, syncing...');
               await syncToBackend();
             }
           } catch {}
        } else {
           setMode('connect');
           
           // CRITICAL FIX: Wait longer for host proxy and network to fully stabilize
           console.log('[Client] Waiting for host proxy to start and network to stabilize...');
           await new Promise(r => setTimeout(r, 7000));
           
           try {
             if (!proxySetRef.current) {
               const proxyUrl = 'http://192.168.49.1:8080';
               
               // Retry proxy connection up to 10 times with longer intervals
               let reachable = false;
               for (let attempt = 0; attempt < 10; attempt++) {
                 try {
                   const controller = new AbortController();
                   const timeout = setTimeout(() => controller.abort(), 4000);
                   const res = await fetch(`${proxyUrl}/api/health`, { 
                     signal: controller.signal,
                     method: 'GET'
                   });
                   clearTimeout(timeout);
                   
                   if (res && res.status >= 200 && res.status < 400) {
                     reachable = true;
                     console.log(`[Client] Proxy reachable on attempt ${attempt + 1}`);
                     break;
                   }
                 } catch (e) {
                   console.log(`[Client] Proxy check attempt ${attempt + 1} failed:`, e.message);
                 }
                 
                 if (!reachable && attempt < 9) {
                   await new Promise(r => setTimeout(r, 2500));
                 }
               }
               
               if (reachable) {
                 await updateApiConfig(proxyUrl);
                 setWifiDirectConnection(true); // CRITICAL: Set connection tracking
                 proxySetRef.current = true;
                 if (Platform.OS === 'android') {
                   ToastAndroid.show('Connected to host proxy', ToastAndroid.SHORT);
                 }
                 console.log('[Client] Successfully connected to host proxy');
                 try { await drainClientToHost(proxyUrl); } catch {}
               } else {
                 console.log('[Client] Host proxy unreachable after all attempts');
                 if (Platform.OS === 'android') {
                   ToastAndroid.show('Host proxy unreachable. Staying offline.', ToastAndroid.LONG);
                 }
               }
             }
           } catch(e) { 
             console.log('[Client] Proxy URL update failed', e); 
           }
        }
        
        if (hostStartTs && setupMs == null) {
          try { setSetupMs(Date.now() - hostStartTs); } catch {}
        }
      } else {
         // Disconnected
         setConnected(false);
         setWifiDirectConnection(false); // CRITICAL: Reset connection tracking
         proxySetRef.current = false;
         setHostReady(false);
      }
    });

    return () => {
      try {
        if (peersSubscription && typeof peersSubscription.remove === 'function') {
          peersSubscription.remove();
        } else if (peersSubscription) {
          unsubscribeFromPeersUpdates(peersSubscription);
        }
      } catch {}
      try {
        if (connectionSubscription && typeof connectionSubscription.remove === 'function') {
          connectionSubscription.remove();
        } else if (connectionSubscription) {
          unsubscribeFromConnectionInfoUpdates(connectionSubscription);
        }
      } catch {}
    };
  }, []);

  const openWifiSettings = async () => {
    try {
      if (Platform.OS === 'android') {
        await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.WIFI_SETTINGS);
      }
    } catch {}
  };

  const openLocationSettings = async () => {
    try {
      if (Platform.OS === 'android') {
        await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.LOCATION_SOURCE_SETTINGS);
      }
    } catch {}
  };

  // CRITICAL FIX: Open system Wi-Fi Direct settings
  const openWifiDirectSettings = async () => {
    try {
      if (Platform.OS === 'android') {
        // Try to open Wi-Fi Direct settings (varies by Android version)
        try {
          await IntentLauncher.startActivityAsync('android.settings.WIFI_SETTINGS');
        } catch {
          // Fallback to regular WiFi settings
          await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.WIFI_SETTINGS);
        }
      }
    } catch (e) {
      console.log('Failed to open Wi-Fi Direct settings:', e);
    }
  };

  const handleHost = async () => {
    Alert.alert(
      'Confirm Hosting',
      'Are you sure you want to start hosting a group?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Start Hosting', 
          onPress: async () => {
            setMode('host');
            setHostReady(false);
            try {
              // Comprehensive cleanup with delays
              try { 
                await stopDiscoveringPeers(); 
                await new Promise(r => setTimeout(r, 800));
              } catch (e) {}
              
              try { 
                await removeGroup(); 
                await new Promise(r => setTimeout(r, 1200));
              } catch (e) {}
              
              setIsDiscovering(false);
              setHostStartTs(Date.now());
              setSetupMs(null);
              hostingActive = true;
              
              if (Platform.OS === 'android') {
                ToastAndroid.show('Creating Wi-Fi Direct Group...', ToastAndroid.SHORT);
              }
              
              // Create group with retry
              let created = false;
              for (let i = 0; i < 3 && !created; i++) {
                try {
                  await createGroup();
                  created = true;
                  console.log('[Host] Group created successfully');
                } catch (e) {
                  console.log(`[Host] Group creation attempt ${i + 1} failed:`, e);
                  if (i < 2) await new Promise(res => setTimeout(res, 1500));
                }
              }
              
              if (!created) {
                throw new Error('Failed to create group after retries');
              }
              
              if (Platform.OS === 'android') {
                ToastAndroid.show('Wi-Fi Direct Group Created', ToastAndroid.SHORT);
              }
              
              // CRITICAL: Wait for initial network stabilization
              console.log('[Host] Waiting for initial network stabilization...');
              await new Promise(r => setTimeout(r, 4000));
              
              // Poll for group formation with more attempts
              let groupFormed = false;
              for (let i = 0; i < 15; i++) {
                const info = await getConnectionInfo();
                setConnectionInfo(info);
                console.log(`[Host] Group formation check ${i + 1}/15:`, info.groupFormed);
                
                if (info.groupFormed) {
                  setConnected(true);
                  groupFormed = true;
                  
                  if (hostStartTs && setupMs == null) {
                    try { setSetupMs(Date.now() - hostStartTs); } catch {}
                  }
                  
                  // CRITICAL: Wait longer for Wi-Fi Direct network to stabilize
                  console.log('[Host] Group formed! Waiting for network interface to fully stabilize...');
                  await new Promise(r => setTimeout(r, 5000));
                  
                  // CRITICAL FIX: Start proxy with verification
                  let proxyStarted = false;
                  try { 
                    if (ensureProxy() && Proxy?.canStartProxy && Proxy.canStartProxy()) {
                      console.log('[Host] Starting proxy server...');
                      if (Platform.OS === 'android') {
                        ToastAndroid.show('Starting proxy server...', ToastAndroid.SHORT);
                      }
                      
                      proxyStarted = await Proxy.startProxyServer();
                      
                      if (proxyStarted && Proxy.isProxyActive && Proxy.isProxyActive()) {
                        console.log('[Host] Proxy server verified active');
                        setHostReady(true);
                        if (Platform.OS === 'android') {
                          ToastAndroid.show('✓ Host ready! Clients can connect now.', ToastAndroid.LONG);
                        }
                      } else {
                        console.log('[Host] Proxy server failed to start or verify');
                        if (Platform.OS === 'android') {
                          ToastAndroid.show('⚠ Warning: Proxy may not be accessible', ToastAndroid.LONG);
                        }
                      }
                    } else {
                      if (Platform.OS === 'android') {
                        ToastAndroid.show('Proxy not supported in Expo Go', ToastAndroid.LONG);
                      } else {
                        Alert.alert('Proxy Unavailable', 'Use a custom dev client to enable proxy.');
                      }
                    }
                  } catch(e) { 
                    console.log('[Host] Proxy start error:', e);
                    if (Platform.OS === 'android') {
                      ToastAndroid.show('⚠ Proxy failed to start', ToastAndroid.SHORT);
                    }
                  }
                  
                  // Sync to backend if available (even if proxy failed)
                  try {
                    const ok = await isBackendReachable();
                    if (ok) {
                      console.log('[Host] Backend reachable, syncing...');
                      await syncToBackend();
                      if (Platform.OS === 'android') {
                        ToastAndroid.show('Synced to backend', ToastAndroid.SHORT);
                      }
                    }
                  } catch {}
                  
                  break;
                }
                
                await new Promise((res) => setTimeout(res, 1500));
              }
              
              if (!groupFormed) {
                throw new Error('Group did not form within timeout');
              }
              
            } catch (err) {
              console.error('[Host] Host error:', err);
              if (Platform.OS === 'android') {
                ToastAndroid.show(`Failed: ${err.message}`, ToastAndroid.LONG);
              } else {
                Alert.alert('Error', err.message);
              }
              hostingActive = false;
              setMode(null);
              setConnected(false);
              setHostReady(false);
            }
          }
        }
      ]
    );
  };

  const handleConnectMode = async () => {
    setMode('connect');
    try {
      await startDiscoveringPeers();
      setIsDiscovering(true);
      discoveringActive = true;
      console.log('[Client] Discovery started');
      
      // Initial peer refresh
      const refreshPeers = async () => {
        try {
          const devices = await getAvailablePeers();
          setPeers(devices.devices);
          console.log('[Client] Found', devices.devices.length, 'peers');
        } catch (e) {}
      };

      refreshPeers();
      
    } catch (err) {
      console.error('[Client] Discovery error:', err);
      Alert.alert('Error', 'Failed to start discovery. Make sure Location is enabled.');
      setMode(null);
    }
  };
  
  // Effect to manage peer polling when in connect or host mode
  useEffect(() => {
    let interval;
    if ((mode === 'connect' && discoveringActive) || (mode === 'host' && hostingActive) || connected) {
      interval = setInterval(async () => {
        try {
          const devices = await getAvailablePeers();
          setPeers(devices.devices);
        } catch (e) {}
      }, 4000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [mode, discoveringActive, hostingActive, connected]);

  const connectWithTimeout = async (address, ms) => {
    return await Promise.race([
      connect(address),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))
    ]);
  };

  const diagnoseWifiDirect = async () => {
    let initialized = wifiP2PInitialized;
    let locationEnabled = true;
    let discovering = isDiscovering || discoveringActive;
    let peersCount = peers.length;
    let formed = !!connectionInfo?.groupFormed;
    let ready = hostReady;
    try {
      const ps = await Location.getProviderStatusAsync();
      locationEnabled = !!ps?.locationServicesEnabled;
    } catch {}
    try {
      const info = await getConnectionInfo();
      formed = !!info?.groupFormed;
    } catch {}
    const msg = [
      `Initialized: ${initialized}`,
      `Location: ${locationEnabled}`,
      `Discovering: ${discovering}`,
      `Peers: ${peersCount}`,
      `Group Formed: ${formed}`,
      `Mode: ${mode || 'none'}`,
      `Host Ready: ${ready}`
    ].join('\n');
    Alert.alert('Wi‑Fi Direct Diagnostics', msg);
  };

  const repairWifiDirect = async () => {
    try { await removeGroup(); } catch {}
    try { await stopDiscoveringPeers(); } catch {}
    await new Promise(r => setTimeout(r, 800));
    try { await startDiscoveringPeers(); } catch {}
    setIsDiscovering(true);
    discoveringActive = true;
    Alert.alert('Wi‑Fi Direct', 'Discovery restarted. Try connecting again.');
  };

  const autoConnectToHost = async () => {
    if (connecting) return;
    try {
      setConnecting(true);
      if (Platform.OS === 'android') {
        ToastAndroid.show('Searching for host...', ToastAndroid.SHORT);
      }
      
      // Don't stop discovery yet - we need it to find hosts
      await new Promise(r => setTimeout(r, 1000));
      
      let result = null;
      try { result = await getAvailablePeers(); } catch {}
      const raw = (result && Array.isArray(result.devices)) ? result.devices : [];
      const isP2P = (p) => {
        const name = String(p.deviceName || '');
        const type = String(p.primaryDeviceType || '');
        return name.startsWith('DIRECT-') || type.startsWith('10-');
      };
      const candidates = raw.filter(isP2P);
      const sorted = candidates.sort((a, b) => {
        const an = String(a.deviceName || '');
        const bn = String(b.deviceName || '');
        const ago = a.isGroupOwner ? 0 : 1;
        const bgo = b.isGroupOwner ? 0 : 1;
        const ad = (an.startsWith('DIRECT-') || an.toLowerCase().includes('direct')) ? 0 : 1;
        const bd = (bn.startsWith('DIRECT-') || bn.toLowerCase().includes('direct')) ? 0 : 1;
        const as = a.status === 3 ? 0 : 1;
        const bs = b.status === 3 ? 0 : 1;
        return (ago - bgo) || (ad - bd) || (as - bs) || an.localeCompare(bn);
      });
      
      console.log('[Client] Found', sorted.length, 'potential hosts');
      
      for (let i = 0; i < sorted.length && i < 6; i++) {
        const p = sorted[i];
        if (!p?.deviceAddress) continue;
        
        console.log(`[Client] Trying to connect to ${p.deviceName} (${p.deviceAddress})`);
        if (Platform.OS === 'android') {
          ToastAndroid.show(`Trying ${p.deviceName}...`, ToastAndroid.SHORT);
        }
        
        try {
          // Stop discovery before connecting
          if (i === 0) {
            try { await stopDiscoveringPeers(); } catch {}
            await new Promise(r => setTimeout(r, 800));
          }
          
          await connectWithTimeout(p.deviceAddress, 8000);
          
          for (let k = 0; k < 10; k++) {
            const info = await getConnectionInfo();
            setConnectionInfo(info);
            if (info?.groupFormed) { 
              setConnected(true); 
              if (Platform.OS === 'android') {
                ToastAndroid.show('✓ Auto-connected successfully!', ToastAndroid.SHORT);
              }
              console.log('[Client] Auto-connected to', p.deviceName);
              return; 
            }
            await new Promise(r => setTimeout(r, 600));
          }
        } catch (e) {
          console.log(`[Client] Failed to connect to ${p.deviceName}:`, e.message);
        }
        
        try { await removeGroup(); } catch {}
        await new Promise(r => setTimeout(r, 600));
      }
      
      try { await startDiscoveringPeers(); } catch {}
      setIsDiscovering(true);
      discoveringActive = true;
      Alert.alert('Wi‑Fi Direct', 'Could not auto-connect. Select a device manually or scan QR.');
    } finally {
      setConnecting(false);
    }
  };

  const connectToDevice = async (deviceAddress) => {
    if (connecting) return;
    if (connected || connectionInfo?.groupFormed) {
      if (Platform.OS === 'android') {
        ToastAndroid.show('Already connected. Disconnect first.', ToastAndroid.SHORT);
      }
      return;
    }
    
    try {
      setConnecting(true);
      
      // Cleanup sequence
      try { 
        await removeGroup();
        await new Promise(r => setTimeout(r, 1000));
      } catch {}
      
      // Check location
      try {
        const ps = await Location.getProviderStatusAsync();
        if (!ps?.locationServicesEnabled) {
          Alert.alert('Enable Location', 'Location services must be enabled for Wi‑Fi Direct.', [
            { text: 'Open Settings', onPress: () => openLocationSettings() },
            { text: 'OK' }
          ]);
          return;
        }
      } catch {}
      
      if (Platform.OS === 'android') {
        ToastAndroid.show('Connecting...', ToastAndroid.SHORT);
      }
      
      console.log('[Client] Attempting to connect to', deviceAddress);
      
      // Connect with MORE retries and LONGER timeouts
      let connected = false;
      for (let attempt = 0; attempt < 10; attempt++) {
        try {
          // Stop discovery only on first attempt
          if (attempt === 0) {
            try { 
              await stopDiscoveringPeers();
              await new Promise(r => setTimeout(r, 1000));
            } catch {}
          }
          
          console.log(`[Client] Connection attempt ${attempt + 1}/10`);
          await connectWithTimeout(deviceAddress, 10000);
          
          // Wait LONGER and check more times
          for (let check = 0; check < 20; check++) {
            await new Promise(r => setTimeout(r, 800));
            
            const info = await getConnectionInfo();
            setConnectionInfo(info);
            
            if (info?.groupFormed) {
              setConnected(true);
              connected = true;
              
              console.log('[Client] Successfully connected!');
              if (Platform.OS === 'android') {
                ToastAndroid.show('✓ Connected successfully!', ToastAndroid.SHORT);
              }
              return; // Success!
            }
          }
          
        } catch (err) {
          console.log(`[Client] Connection attempt ${attempt + 1} failed:`, err.message);
        }
        
        if (!connected && attempt < 9) {
          // Cleanup before retry
          try { await removeGroup(); } catch {}
          await new Promise(r => setTimeout(r, 2000));
        }
      }
      
      // CRITICAL FIX: All attempts failed - show clear message with option to open system settings
      console.log('[Client] Connection failed after all attempts');
      
      Alert.alert(
        'Connection Failed',
        'Could not connect to the host device.\n\nPossible solutions:\n• Ensure the host is ready (shows "Host Ready: ✓ Yes")\n• Try connecting manually from Wi-Fi settings\n• Make sure you\'re within range',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Open Wi-Fi Settings',
            onPress: () => openWifiDirectSettings()
          }
        ]
      );
      
      // Restart discovery
      try { await startDiscoveringPeers(); } catch {}
      setIsDiscovering(true);
      discoveringActive = true;
      
    } catch (err) {
      console.error('[Client] Connect error:', err);
      if (Platform.OS === 'android') {
        ToastAndroid.show(`Error: ${err.message}`, ToastAndroid.SHORT);
      }
    } finally {
      setConnecting(false);
    }
  };

  const handleBarCodeScanned = async ({ type, data }) => {
    setScanned(true);
    setShowScanner(false);
    
    try {
      let hostDeviceAddress = null;
      let hostName = null;
      let fullName = null;
      let backendUrl = null;
      
      try {
        const parsed = JSON.parse(data);
        if (parsed.deviceAddress) hostDeviceAddress = parsed.deviceAddress;
        if (parsed.name) hostName = parsed.name;
        if (parsed.fullName) fullName = parsed.fullName;
        if (parsed.backendUrl) backendUrl = parsed.backendUrl;

        // Sync Backend URL if present
        if (backendUrl) {
           if (backendUrl.startsWith('http')) {
              await updateApiConfig(backendUrl);
           } else {
              const match = backendUrl.match(/http:\/\/([^:]+):/);
              if (match && match[1]) {
                await updateApiConfig(match[1]);
              }
           }
           console.log('[Client] Backend URL synced from QR');
           if (Platform.OS === 'android') {
              ToastAndroid.show(`Backend synced`, ToastAndroid.SHORT);
           }
        }
      } catch (e) {
        // Not JSON, might be raw address
        if (data.includes(':')) {
          hostDeviceAddress = data;
        }
      }
      
      // CRITICAL FIX: Direct connection with device address from QR
      if (hostDeviceAddress && hostDeviceAddress.includes(':')) {
        console.log('[Client] Connecting directly to address from QR:', hostDeviceAddress);
        
        Alert.alert(
          'Connect to Host?',
          `Connect to ${fullName || hostName || 'this device'}?`,
          [
            { text: 'Cancel', onPress: () => setScanned(false), style: 'cancel' },
            { 
              text: 'Connect', 
              onPress: () => connectToDevice(hostDeviceAddress)
            }
          ]
        );
        return;
      }
      
      // Fallback: Name-based search (less reliable)
      if (hostName) {
        if (!isDiscovering && !discoveringActive) {
          handleConnectMode();
        }
        
        if (Platform.OS === 'android') {
          ToastAndroid.show(`Searching for ${fullName || hostName}...`, ToastAndroid.SHORT);
        }

        // Search for device by name
        let found = false;
        for (let i = 0; i < 12; i++) {
           try {
              const result = await getAvailablePeers();
              const raw = result.devices;
              const avail = raw.filter(p => p.status === 3);
              const currentPeers = avail.length ? avail : raw;
              setPeers(currentPeers);
              
              let match = currentPeers.find(p => p.deviceName === hostName);
              
              if (!match) {
                 match = currentPeers.find(p => 
                    p.deviceName?.toLowerCase() === hostName?.toLowerCase()
                 );
              }

              if (match && match.deviceAddress) {
                 found = true;
                 console.log('[Client] Found host via name search:', match.deviceName);
                 connectToDevice(match.deviceAddress);
                 break;
              }
           } catch (e) { 
             console.log('[Client] Peer scan error:', e); 
           }
           
           if (!found) await new Promise(r => setTimeout(r, 2000));
        }

        if (!found) {
          Alert.alert(
            'Host Not Found',
            `Could not find "${fullName || hostName}".\n\nTry:\n• Moving closer to the host\n• Ensuring host is ready\n• Manually selecting from available devices`,
            [
              { text: 'OK', onPress: () => setScanned(false) }
            ]
          );
        }
        return;
      }
      
      if (Platform.OS === 'android') {
        ToastAndroid.show('Invalid QR Code', ToastAndroid.SHORT);
      } else {
        Alert.alert('Error', 'Invalid QR Code - missing device address');
      }
    } catch (err) {
      console.log('[Client] QR scan error:', err);
      if (Platform.OS === 'android') {
        ToastAndroid.show('Scan Error', ToastAndroid.SHORT);
      }
    }
  };

  const getQRData = () => {
     // CRITICAL FIX: Include device address in QR for direct connection
     let deviceAddress = null;
     if (connectionInfo?.groupOwnerAddress) {
       const addrObj = connectionInfo.groupOwnerAddress;
       deviceAddress = typeof addrObj === 'string' ? addrObj : addrObj?.hostAddress;
     }
     
     let backendUrlToShare = BASE_URL;
     if ((mode === 'host' || hostingActive) && ensureProxy() && Proxy?.isProxyActive && Proxy.isProxyActive()) {
        backendUrlToShare = 'http://192.168.49.1:8080';
     }
     
    return JSON.stringify({
      name: hostDeviceName,
      fullName: user?.fullName || 'Host',
      deviceAddress: deviceAddress, // Include MAC address for direct connection
      backendUrl: backendUrlToShare
    });
  };

  if (showScanner) {
    return (
      <View style={styles.container}>
        <CameraView
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
          barcodeScannerSettings={{
            barcodeTypes: ["qr"],
          }}
          style={StyleSheet.absoluteFillObject}
        />
        <TouchableOpacity style={styles.closeScannerBtn} onPress={() => setShowScanner(false)}>
          <Ionicons name="close" size={30} color="#fff" />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Wi-Fi Direct Connectivity</Text>
        {connected && (
          <Ionicons name="wifi" size={24} color="#4caf50" style={{ marginLeft: 'auto' }} />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {!mode ? (
          <View style={styles.selectionContainer}>
            <Text style={styles.description}>
              Share emergency data offline by connecting directly to other devices.
            </Text>
            {hintVisible && (
              <View style={styles.hintCard}>
                <Text style={styles.hintTitle}>Enable Wi‑Fi and Location</Text>
                <Text style={styles.hintText}>Wi‑Fi Direct requires Wi‑Fi and Location to be turned on.</Text>
                <View style={styles.hintActions}>
                  <TouchableOpacity style={[styles.hintBtn, { backgroundColor: '#2b4266' }]} onPress={openWifiSettings}>
                    <Ionicons name="wifi" size={18} color="#fff" />
                    <Text style={styles.hintBtnText}>Wi‑Fi Settings</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.hintBtn, { backgroundColor: '#1976d2' }]} onPress={openLocationSettings}>
                    <Ionicons name="location" size={18} color="#fff" />
                    <Text style={styles.hintBtnText}>Location Settings</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.hintDismiss} onPress={() => setHintVisible(false)}>
                    <Ionicons name="close" size={18} color="#999" />
                    <Text style={styles.hintDismissText}>Dismiss</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            
            <TouchableOpacity
              style={[styles.modeCard, (connected || isDiscovering || hostingActive || discoveringActive || (connectionInfo?.groupFormed)) ? { opacity: 0.5 } : null]}
              onPress={() => {
                if (connected || isDiscovering || hostingActive || discoveringActive || (connectionInfo?.groupFormed)) return;
                handleHost();
              }}
            >
              <View style={[styles.iconCircle, { backgroundColor: '#e3f2fd' }]}>
                <Ionicons name="wifi" size={32} color="#1976d2" />
              </View>
              <Text style={styles.modeTitle}>HOST</Text>
              <Text style={styles.modeDesc}>Create a group and share data with others.</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modeCard, (connected || isDiscovering || hostingActive || discoveringActive || (connectionInfo?.groupFormed)) ? { opacity: 0.5 } : null]}
              onPress={() => {
                if (connected || isDiscovering || hostingActive || discoveringActive || (connectionInfo?.groupFormed)) return;
                handleConnectMode();
              }}
            >
              <View style={[styles.iconCircle, { backgroundColor: '#e8f5e9' }]}>
                <Ionicons name="search" size={32} color="#2e7d32" />
              </View>
              <Text style={styles.modeTitle}>CONNECT</Text>
              <Text style={styles.modeDesc}>Find and connect to a host nearby.</Text>
            </TouchableOpacity>

            <View style={styles.lanCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <Ionicons name="server" size={20} color="#1976d2" />
                <Text style={[styles.hintTitle, { marginLeft: 8 }]}>LAN Connectivity</Text>
              </View>
              <Text style={styles.hintText}>Current backend: {lanUrl}</Text>
              <View style={styles.hintActions}>
                <TouchableOpacity style={[styles.hintBtn, { backgroundColor: '#1976d2' }]} onPress={async () => { await initApiConfig(); setTimeout(() => setLanUrl(BASE_URL), 500); }}>
                  <Ionicons name="refresh" size={18} color="#fff" />
                  <Text style={styles.hintBtnText}>Retry LAN Detection</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : mode === 'host' ? (
          <View style={styles.hostContainer}>
            <View style={styles.statusCard}>
              <Text style={styles.statusTitle}>Hosting Status</Text>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: connected ? '#4caf50' : '#bdbdbd' }]} />
                <Text style={styles.statusText}>{connected ? 'Group Created' : 'Initializing...'}</Text>
              </View>
              {connectionInfo && (() => {
                const addrObj = connectionInfo.groupOwnerAddress;
                const addr = typeof addrObj === 'string' ? addrObj : addrObj?.hostAddress;
                return <Text style={styles.infoText}>Address: {addr || 'Waiting...'}</Text>;
              })()}
              <Text style={styles.infoText}>Host: {user?.fullName || hostDeviceName}</Text>
              <Text style={[styles.infoText, { fontWeight: 'bold', color: hostReady ? '#4caf50' : '#ff9800' }]}>
                Host Ready: {hostReady ? '✓ Yes - Clients can connect!' : '⏳ Initializing...'}
              </Text>
              <Text style={styles.infoText}>Setup time: {setupMs != null ? `${setupMs} ms` : '—'}</Text>
              
              <Text style={[styles.statusTitle, { marginTop: 16 }]}>Connected Peers</Text>
              {peers.filter(p => p.status === 0).length > 0 ? (
                 peers.filter(p => p.status === 0).map((p, i) => (
                   <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 2 }}>
                     <Ionicons name="person" size={14} color="#666" style={{ marginRight: 6 }} />
                     <Text style={styles.infoText}>
                        {peerIdentities[p.deviceName] || p.deviceName} 
                        {p.deviceAddress ? ` (${p.deviceAddress.substring(0,8)}...)` : ''}
                     </Text>
                   </View>
                 ))
              ) : (
                <Text style={[styles.infoText, { fontStyle: 'italic', color: '#999' }]}>
                  {connected ? (hostReady ? 'Waiting for clients to connect...' : 'Initializing proxy...') : 'Waiting for group...'}
                </Text>
              )}
            </View>

            {/* CRITICAL FIX: Only show QR when host is ready */}
            {hostReady && (
              <View style={styles.qrContainer}>
                <Text style={styles.qrLabel}>Scan to Connect</Text>
                <View style={styles.qrWrapper}>
                  <QRCode
                    value={getQRData()}
                    size={200}
                  />
                </View>
                <Text style={[styles.infoText, { marginTop: 12, textAlign: 'center', color: '#4caf50', fontWeight: 'bold' }]}>
                  Ready for scanning
                </Text>
              </View>
            )}
            
            {!hostReady && (
              <View style={styles.waitingContainer}>
                <ActivityIndicator size="large" color="#1976d2" />
                <Text style={styles.waitingText}>Please wait, preparing host...</Text>
                <Text style={styles.waitingSubText}>QR code will appear when ready</Text>
              </View>
            )}

            {/* UPDATED: Stop Hosting button with loading state */}
            <TouchableOpacity 
              style={[styles.actionBtn, { backgroundColor: '#d32f2f' }]} 
              onPress={async () => {
                if (stopping) return;
                setStopping(true);
                try {
                  if (ensureProxy() && Proxy?.stopProxyServer) {
                    try {
                      Proxy.stopProxyServer();
                      console.log('[Host] Proxy stopped');
                    } catch {}
                  }
                  
                  await removeGroup();
                  await new Promise(r => setTimeout(r, 1000));
                  console.log('[Host] Group removed');
                  
                  hostingActive = false;
                  setMode(null);
                  setConnected(false);
                  setIsDiscovering(false);
                  setConnectionInfo(null);
                  setHostReady(false);
                  
                  // CRITICAL: Reset API connection tracking
                  await initApiConfig();
                  setWifiDirectConnection(false);
                  
                  if (Platform.OS === 'android') {
                    ToastAndroid.show('Stopped hosting successfully', ToastAndroid.SHORT);
                  }
                } catch (e) {
                  console.log('[Host] Error removing group:', e);
                } finally {
                  setTimeout(() => setStopping(false), 500);
                }
              }}
              disabled={stopping}
            >
              {stopping ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.actionBtnText}>Stop Hosting</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.connectContainer}>
            {connected && connectionInfo ? (
               <View style={styles.statusCard}>
                   <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
                     <Text style={styles.statusTitle}>Connected to Host</Text>
                     <View style={[styles.statusDot, { backgroundColor: '#4caf50' }]} />
                   </View>
                   <Text style={[styles.infoText, {marginTop:8}]}>Host IP: {
                     (() => {
                        const addrObj = connectionInfo.groupOwnerAddress;
                        return typeof addrObj === 'string' ? addrObj : addrObj?.hostAddress || 'Unknown';
                     })()
                   }</Text>
                   <Text style={styles.infoText}>Status: Online</Text>
                   
                   {/* UPDATED: Disconnect button with loading state */}
                   <TouchableOpacity 
                      style={[styles.actionBtn, { backgroundColor: '#d32f2f', marginTop: 16 }]} 
                      onPress={async () => {
                        if (disconnecting) return;
                        setDisconnecting(true);
                        try {
                          await removeGroup();
                          await new Promise(r => setTimeout(r, 1000));
                          console.log('[Client] Disconnected');
                          
                          setConnected(false);
                          setMode(null);
                          setConnectionInfo(null);
                          hostingActive = false;
                          discoveringActive = false;
                          proxySetRef.current = false;
                          
                          // CRITICAL: Reset API connection tracking
                          await initApiConfig();
                          setWifiDirectConnection(false);
                          
                          if (Platform.OS === 'android') {
                            ToastAndroid.show('Disconnected successfully', ToastAndroid.SHORT);
                          }
                        } catch (e) {
                          console.log('[Client] Disconnect error:', e);
                        } finally {
                          setTimeout(() => setDisconnecting(false), 500);
                        }
                      }}
                      disabled={disconnecting}
                    >
                      {disconnecting ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={styles.actionBtnText}>Disconnect</Text>
                      )}
                    </TouchableOpacity>
               </View>
            ) : (
            <View style={styles.scanSection}>
              <TouchableOpacity style={styles.scanBtn} onPress={() => { if (connecting) return; setScanned(false); setShowScanner(true); }}>
                <Ionicons name="qr-code-outline" size={24} color="#fff" />
                <Text style={styles.scanBtnText}>Scan QR Code</Text>
              </TouchableOpacity>
            </View>
            )}

            <Text style={styles.sectionHeader}>Available Devices</Text>
            {(() => {
              const base = Array.isArray(peers) ? peers : [];
              const isP2P = (p) => {
                const name = String(p.deviceName || '');
                const type = String(p.primaryDeviceType || '');
                return name.startsWith('DIRECT-') || type.startsWith('10-');
              };
              const available = base.filter(p => p.status === 3 && isP2P(p));
              const list = available.length ? available : base.filter(isP2P);
              if (list.length === 0) {
                return (
              <View style={styles.emptyState}>
                <ActivityIndicator size="small" color="#666" />
                <Text style={styles.emptyText}>Searching for devices...</Text>
              </View>
              );
              }
              return list.map((peer, index) => (
                <TouchableOpacity key={index} style={[styles.peerItem, connecting ? { opacity: 0.6 } : null]} onPress={() => { if (connecting) return; connectToDevice(peer.deviceAddress); }}>
                  <View>
                    <Text style={styles.peerName}>{peer.deviceName}</Text>
                    <Text style={styles.peerAddress}>{peer.deviceAddress}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#ccc" />
                </TouchableOpacity>
              ));
            })()}
            
            <TouchableOpacity 
              style={[styles.actionBtn, { backgroundColor: '#2e7d32', marginTop: 12 }]} 
              onPress={autoConnectToHost}
              disabled={connecting}
            >
              <Text style={styles.actionBtnText}>
                {connecting ? 'Connecting...' : 'Auto Connect to Host'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.actionBtn, { backgroundColor: '#2b4266', marginTop: 12 }]} 
              onPress={diagnoseWifiDirect}
            >
              <Text style={styles.actionBtnText}>Diagnose Connection</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.actionBtn, { backgroundColor: '#1976d2', marginTop: 12 }]} 
              onPress={repairWifiDirect}
            >
              <Text style={styles.actionBtnText}>Repair & Restart Discovery</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.actionBtn, { backgroundColor: '#757575', marginTop: 20 }]} 
              onPress={async () => {
                try {
                  await stopDiscoveringPeers();
                  console.log('[Client] Discovery stopped');
                } catch (e) {
                  console.log('[Client] Error stopping discovery:', e);
                }
                discoveringActive = false;
                setIsDiscovering(false);
                setMode(null);
                setConnected(false);
                setConnectionInfo(null);
              }}
            >
              <Text style={styles.actionBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#fff', elevation: 2 },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', marginLeft: 16 },
  content: { padding: 16 },
  description: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 24 },
  hintCard: { width: '100%', backgroundColor: '#fff', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#eee', marginBottom: 16 },
  hintTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 6 },
  hintText: { fontSize: 12, color: '#666', marginBottom: 10 },
  hintActions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  hintBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, marginRight: 8, marginBottom: 8 },
  hintBtnText: { color: '#fff', fontSize: 12, fontWeight: 'bold', marginLeft: 6 },
  hintDismiss: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12 },
  hintDismissText: { color: '#999', fontSize: 12, marginLeft: 6 },
  selectionContainer: { alignItems: 'center' },
  modeCard: { width: '100%', backgroundColor: '#fff', padding: 20, borderRadius: 12, alignItems: 'center', marginBottom: 16, elevation: 2 },
  iconCircle: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  modeTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 4 },
  modeDesc: { fontSize: 12, color: '#666', textAlign: 'center' },
  lanCard: { width: '100%', backgroundColor: '#fff', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#eee', marginTop: 8 },
  hostContainer: { alignItems: 'center' },
  statusCard: { width: '100%', backgroundColor: '#fff', padding: 16, borderRadius: 12, marginBottom: 20, elevation: 2 },
  statusTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 8 },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  statusText: { fontSize: 14, color: '#333' },
  infoText: { fontSize: 12, color: '#666', marginTop: 4 },
  qrContainer: { alignItems: 'center', backgroundColor: '#fff', padding: 24, borderRadius: 16, elevation: 4, marginBottom: 24 },
  qrLabel: { fontSize: 16, fontWeight: 'bold', marginBottom: 16 },
  qrWrapper: { padding: 10, backgroundColor: '#fff' },
  waitingContainer: { alignItems: 'center', backgroundColor: '#fff', padding: 32, borderRadius: 16, elevation: 4, marginBottom: 24 },
  waitingText: { fontSize: 14, fontWeight: 'bold', color: '#666', marginTop: 16 },
  waitingSubText: { fontSize: 12, color: '#999', marginTop: 4 },
  actionBtn: { width: '100%', padding: 16, borderRadius: 12, alignItems: 'center' },
  actionBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  connectContainer: { width: '100%' },
  scanSection: { alignItems: 'center', marginBottom: 24 },
  scanBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#2b4266', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 30 },
  scanBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginLeft: 8 },
  sectionHeader: { fontSize: 16, fontWeight: 'bold', marginBottom: 12, color: '#333' },
  peerItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', padding: 16, borderRadius: 12, marginBottom: 10, elevation: 1 },
  peerName: { fontSize: 16, fontWeight: '600' },
  peerAddress: { fontSize: 12, color: '#888' },
  emptyState: { padding: 20, alignItems: 'center' },
  emptyText: { color: '#888', marginTop: 8 },
  closeScannerBtn: { position: 'absolute', top: 40, right: 20, padding: 10, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20 },
});

export default WifiDirectScreen;