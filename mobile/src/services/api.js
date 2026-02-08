import axios from 'axios';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import NetInfo from '@react-native-community/netinfo';

function resolveBaseURL() {
  let base = 'http://localhost:5000/api';
  const hostUri = Constants?.expoConfig?.hostUri || Constants?.debuggerHost;
  if (hostUri) {
    const ip = hostUri.split(':')[0];
    if (ip && ip !== 'localhost') {
      base = `http://${ip}:5000/api`;
    }
  }
  if (Platform.OS === 'android' && (!hostUri || base.includes('localhost'))) {
    base = 'http://10.0.2.2:5000/api';
  }
  return base;
}

export let BASE_URL = resolveBaseURL();

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

// Track Wi-Fi Direct connection state
let isWifiDirectConnected = false;

export const setWifiDirectConnection = (connected) => {
  isWifiDirectConnected = connected;
  console.log('[API] Wi-Fi Direct connection:', connected);
};

export const isConnectedToWifiDirect = () => {
  return isWifiDirectConnected;
};

export const initApiConfig = async () => {
  const oldBase = BASE_URL;
  BASE_URL = resolveBaseURL();
  api.defaults.baseURL = BASE_URL;
  
  // Reset Wi-Fi Direct connection if URL changed away from proxy
  if (oldBase.includes('192.168.49.1') && !BASE_URL.includes('192.168.49.1')) {
    isWifiDirectConnected = false;
  }
  
  console.log('[API] Initialized with BASE_URL:', BASE_URL);
};

export const updateApiConfig = (newBaseUrl) => {
  if (newBaseUrl) {
    const oldBase = BASE_URL;
    BASE_URL = newBaseUrl;
    api.defaults.baseURL = BASE_URL;
    
    // Update Wi-Fi Direct connection state based on URL
    if (newBaseUrl.includes('192.168.49.1')) {
      isWifiDirectConnected = true;
    } else if (oldBase.includes('192.168.49.1')) {
      isWifiDirectConnected = false;
    }
    
    console.log('[API] Updated BASE_URL to:', BASE_URL, '| Wi-Fi Direct:', isWifiDirectConnected);
  }
};

// Check actual connectivity
export const checkConnectivity = async () => {
  try {
    const netInfo = await NetInfo.fetch();
    const hasInternet = netInfo.isConnected && netInfo.isInternetReachable;
    const isWifiDirectHost = BASE_URL.includes('192.168.49.1');
    
    return {
      hasInternet,
      isWifiDirectHost,
      isWifiDirectConnected
    };
  } catch (e) {
    return {
      hasInternet: false,
      isWifiDirectHost: false,
      isWifiDirectConnected: false
    };
  }
};

export default api;