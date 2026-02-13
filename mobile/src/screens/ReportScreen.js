import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api, { BASE_URL, resolveBaseURL } from '../services/api';
import { useNavigation, useRoute } from '@react-navigation/native';
import { addOfflineReport, addHostedReport } from '../services/offline';
import { useAuth } from '../context/AuthContext';
import NetInfo from '@react-native-community/netinfo';
import { isProxyActive, addHostedReportToMemory, broadcastHostedStatusUpdate } from '../services/ProxyServer';
import { DeviceEventEmitter } from 'react-native';

const ReportScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { user } = useAuth();
  const { type, presetLocation } = route.params;
  const [loading, setLoading] = useState(false);

  const handleSendReport = async () => {
    setLoading(true);
    try {
      const location = presetLocation ? { x: presetLocation.x, y: presetLocation.y } : { x: 50, y: 50 };
      const reportData = {
        type,
        location: {
          ...location,
          latitude: location.latitude || 50,
          longitude: location.longitude || 50
        },
        user: {
          _id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role
        }
      };

      const netInfo = await NetInfo.fetch();
      const hasInternet = netInfo.isConnected && netInfo.isInternetReachable;
      const isWifiDirectHost = BASE_URL.includes('192.168.49.1');
      const isHosting = isProxyActive();

      console.log('[Report] ═══════════════════════════════════════');
      console.log('[Report] Connection Diagnostics:');
      console.log('[Report]   User:', user.firstName, user.lastName);
      console.log('[Report]   hasInternet:', hasInternet);
      console.log('[Report]   isWifiDirectHost:', isWifiDirectHost);
      console.log('[Report]   isHosting:', isHosting);
      console.log('[Report]   baseUrl:', BASE_URL);
      console.log('[Report] ═══════════════════════════════════════');

      // ============================================
      // PRIORITY: DIRECT INTERNET SUBMISSION
      // ============================================
      if (!isHosting && hasInternet) {
        console.log('[Report] 🔷 PRIORITY: DIRECT BACKEND SUBMISSION');

        try {
          const backendUrl = resolveBaseURL();
          console.log('[Report] Attempting direct submission to:', backendUrl);

          let headers = {
            'Content-Type': 'application/json'
          };

          const userInfoStr = await AsyncStorage.getItem('userInfo');
          if (userInfoStr) {
            const userInfo = JSON.parse(userInfoStr);
            if (userInfo.token) {
              headers['Authorization'] = `Bearer ${userInfo.token}`;
            }
          }

          const response = await axios.post(`${backendUrl}/reports`, reportData, {
            headers: headers,
            timeout: 10000
          });

          console.log('[Report] ✓✓✓ SUCCESS: Saved to backend via direct connection:', response.data._id);

          Alert.alert(
            "Emergency Reported",
            "Help is on the way. Report sent directly to headquarters.",
            [{ text: "OK", onPress: () => navigation.navigate('Home') }]
          );
          setLoading(false);
          return;

        } catch (error) {
          console.error('[Report] Direct submission failed:', error.message);
          console.log('[Report] Falling back to P2P/Offline paths...');
          // Fall through to other cases
        }
      }

      // ============================================
      // CASE 1: CONNECTED TO HOST (Client in Wi-Fi Direct group)
      // ============================================
      if (isWifiDirectHost && !isHosting) {
        console.log('[Report] 🔷 CASE 1: CONNECTED TO HOST (CLIENT)');

        try {
          const tempId = `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

          const reportPayload = {
            _id: tempId,
            type: reportData.type,
            location: {
              latitude: location.latitude || 50,
              longitude: location.longitude || 50,
              x: location.x,
              y: location.y
            },
            description: '',
            imageUri: null,
            user: reportData.user,
            createdAt: new Date().toISOString(),
            status: 'REPORTED',
            statusHistory: []
          };

          console.log('[Report] Sending to host P2P endpoint...');

          const controller = new AbortController();
          const timeoutMs = 20000;

          const timeoutId = setTimeout(() => {
            console.log('[Report] Fetch timeout - aborting request');
            controller.abort();
          }, timeoutMs);

          let response;

          try {
            response = await fetch(`${BASE_URL}/p2p/report`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              body: JSON.stringify({
                type: 'emergency_report',
                payload: reportPayload
              }),
              signal: controller.signal
            });

            clearTimeout(timeoutId);
            console.log('[Report] Response received, status:', response.status);

          } catch (fetchError) {
            clearTimeout(timeoutId);
            console.log('[Report] Fetch error:', fetchError.name, fetchError.message);

            if (fetchError.name === 'AbortError') {
              throw new Error('Request timeout');
            }
            throw fetchError;
          }

          if (!response) {
            throw new Error('No response received from host');
          }

          if (response.ok) {
            let responseData;
            try {
              const responseText = await response.text();
              if (responseText && responseText.trim()) {
                responseData = JSON.parse(responseText);
                console.log('[Report] ✓✓✓ SUCCESS: Report sent to host:', responseData);
              } else {
                console.log('[Report] ✓✓✓ SUCCESS: Report sent (empty response body)');
              }
            } catch (parseError) {
              console.log('[Report] ✓✓✓ SUCCESS: Report sent (HTTP', response.status, 'received)');
            }

            Alert.alert(
              "Report Sent to Host",
              "Your emergency report has been received by the host device and shared with the group.",
              [{ text: "OK", onPress: () => navigation.navigate('Home') }]
            );
            setLoading(false);
            return;

          } else {
            let errorText = 'Unknown error';
            try {
              errorText = await response.text();
            } catch (e) {
              errorText = `HTTP ${response.status}`;
            }

            console.error('[Report] Host rejected request:', response.status, errorText);
            throw new Error(`Host rejected: ${response.status} - ${errorText}`);
          }

        } catch (error) {
          console.error('[Report] ❌ P2P submission failed:', error.message);

          let errorMessage = "Failed to send report to host. Please try again.";
          let errorTitle = "Submission Failed";

          if (error.message === 'Request timeout') {
            errorMessage = "Request timed out. The host may be busy or unreachable. Please try again.";
          } else if (error.message.includes('Network request failed')) {
            errorMessage = "Network error. Please check your Wi-Fi Direct connection and try again.";
            errorTitle = "Connection Error";
          } else if (error.message.includes('Host rejected')) {
            errorMessage = `The host returned an error: ${error.message}. Please try again or contact the host.`;
            errorTitle = "Host Error";
          } else if (error.message.includes('Failed to fetch')) {
            errorMessage = "Cannot reach the host. Please verify your Wi-Fi Direct connection.";
            errorTitle = "Connection Error";
          }

          Alert.alert(
            errorTitle,
            errorMessage,
            [
              {
                text: "Try Again",
                onPress: () => {
                  setLoading(false);
                  setTimeout(() => handleSendReport(), 100);
                }
              },
              {
                text: "Cancel",
                style: "cancel",
                onPress: () => {
                  setLoading(false);
                  navigation.navigate('Home');
                }
              }
            ]
          );
          return;
        }
      }

      // ============================================
      // CASE 2: HOSTING WITH INTERNET (Online/Hosting)
      // ============================================
      if (isHosting && hasInternet) {
        console.log('[Report] 🔷 CASE 2: HOSTING WITH INTERNET');

        try {
          console.log('[Report] Submitting to backend...');

          const response = await api.post('/reports', reportData, { timeout: 10000 });
          console.log('[Report] ✓ Saved to backend:', response.data._id);

          console.log('[Report] Adding to hosted group for sharing...');

          const hostedReport = await addHostedReport({
            ...response.data,
            _id: response.data._id,
            latitude: response.data.location?.latitude || location.latitude || 50,
            longitude: response.data.location?.longitude || location.longitude || 50,
            location: response.data.location,
            user: response.data.user,
            createdAt: response.data.createdAt,
            status: response.data.status,
            statusHistory: response.data.statusHistory || [],
            syncedToBackend: true,
            hostedFromOnline: false
          });

          // Add to proxy memory for immediate availability to clients
          try {
            addHostedReportToMemory({
              ...hostedReport,
              hostedInGroup: true,
              fromHost: false
            });
            console.log('[Report] ✓ Added to proxy memory');
          } catch (e) {
            console.error('[Report] Failed to add to proxy memory:', e);
          }

          // Emit event to refresh UI
          try {
            DeviceEventEmitter.emit('HOSTED_REPORTS_CHANGED');
          } catch (e) { }

          console.log('[Report] ✓✓✓ SUCCESS: Saved to backend AND auto-shared');

          Alert.alert(
            "Emergency Reported",
            "Report saved online and shared with connected devices in your Wi-Fi Direct group.",
            [{ text: "OK", onPress: () => navigation.navigate('Home') }]
          );
          setLoading(false);
          return;
        } catch (error) {
          console.error('[Report] Backend submission failed:', error.message);
          console.log('[Report] Falling through to CASE 4 (hosting offline)...');
        }
      }

      // ============================================
      // CASE 3: ONLINE ONLY (No hosting, has internet)
      // ============================================
      if (!isHosting && hasInternet && !isWifiDirectHost) {
        console.log('[Report] 🔷 CASE 3: ONLINE ONLY');

        try {
          console.log('[Report] Submitting to backend...');

          const response = await api.post('/reports', reportData, { timeout: 10000 });
          console.log('[Report] ✓✓✓ SUCCESS: Saved to backend:', response.data._id);

          Alert.alert(
            "Emergency Reported",
            "Help is on the way. Please stay safe.",
            [{ text: "OK", onPress: () => navigation.navigate('Home') }]
          );
          setLoading(false);
          return;
        } catch (error) {
          console.error('[Report] Backend submission failed:', error.message);

          console.log('[Report] 🔄 FALLBACK: Storing offline');

          const offlineReport = await addOfflineReport({
            ...reportData,
            latitude: location.latitude || 50,
            longitude: location.longitude || 50,
            syncedToBackend: false
          });

          Alert.alert(
            "Stored Offline",
            "Failed to submit report to backend. Your report has been saved and will be submitted when connection is restored.",
            [{ text: "OK", onPress: () => navigation.navigate('Home') }]
          );
          setLoading(false);
          return;
        }
      }

      // ============================================
      // CASE 4: HOSTING WITHOUT INTERNET (Offline hosting)
      // ============================================
      if (isHosting && !hasInternet) {
        console.log('[Report] 🔷 CASE 4: HOSTING OFFLINE (HOST USER)');

        try {
          console.log('[Report] Adding to hosted group...');

          const tempId = `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

          const hostedReportData = {
            _id: tempId,
            type: reportData.type,
            location: {
              latitude: location.latitude || 50,
              longitude: location.longitude || 50,
              x: location.x,
              y: location.y
            },
            description: '',
            imageUri: null,
            user: reportData.user,
            createdAt: new Date().toISOString(),
            status: 'REPORTED',
            statusHistory: [],
            latitude: location.latitude || 50,
            longitude: location.longitude || 50,
            syncedToBackend: false,
            hostedFromOnline: false
          };

          const hostedReport = await addHostedReport(hostedReportData);

          console.log('[Report] ✓ Stored in hosted group:', hostedReport._id);

          try {
            addHostedReportToMemory({
              ...hostedReport,
              hostedInGroup: true,
              fromHost: false
            });
            broadcastHostedStatusUpdate(hostedReport._id);
            console.log('[Report] ✓ Added to proxy memory and broadcasted to clients');
          } catch (e) {
            console.error('[Report] Failed to add to proxy memory:', e);
          }

          try {
            DeviceEventEmitter.emit('HOSTED_REPORTS_CHANGED');
            console.log('[Report] ✓ Emitted HOSTED_REPORTS_CHANGED event');
          } catch (e) {
            console.error('[Report] Failed to emit event:', e);
          }

          console.log('[Report] ✓✓✓ SUCCESS: Report fully stored and shared');

          Alert.alert(
            'Stored in Hosted Group',
            'Your emergency report is saved and shared with connected clients. Will sync to backend when online.',
            [{ text: "OK", onPress: () => navigation.navigate('Home') }]
          );
          setLoading(false);
          return;
        } catch (error) {
          console.error('[Report] Hosted storage error:', error);
          Alert.alert("Error", "Failed to store report. Please try again.");
          setLoading(false);
          return;
        }
      }

      // ============================================
      // FALLBACK: Store offline on this device
      // ============================================
      console.log('[Report] 🔷 FALLBACK: Storing offline (completely disconnected)');

      const offlineReport = await addOfflineReport({
        ...reportData,
        latitude: location.latitude || 50,
        longitude: location.longitude || 50,
        syncedToBackend: false
      });

      console.log('[Report] ✓ Stored offline:', offlineReport._id);

      Alert.alert(
        'Stored Offline',
        'Your emergency report has been saved and will be submitted when connection is restored.',
        [{ text: "OK", onPress: () => navigation.navigate('Home') }]
      );

    } catch (error) {
      console.error('[Report] ❌ UNEXPECTED ERROR:', error);

      Alert.alert(
        "Error",
        "An unexpected error occurred. Please try again or call emergency hotline.",
        [{ text: "OK", onPress: () => setLoading(false) }]
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.warningIcon}>!</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.alertBox}>
          <Text style={styles.alertTitle}>CONFIRM EMERGENCY</Text>
          <Text style={styles.alertText}>
            You are about to report an <Text style={{ fontWeight: 'bold', color: '#d32f2f' }}>{type}</Text> emergency.
          </Text>
          <Text style={styles.alertText}>
            Location: Building A, Room 201
          </Text>
          <Text style={styles.instructionText}>
            Please confirm if you require immediate assistance.
          </Text>
        </View>

        <TouchableOpacity
          style={styles.confirmButton}
          onPress={handleSendReport}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.confirmButtonText}>CONFIRM & SEND ALERT</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => navigation.goBack()}
          disabled={loading}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    alignItems: 'center',
    marginTop: 50,
    marginBottom: 20,
  },
  warningIcon: {
    fontSize: 80,
    fontWeight: 'bold',
    color: '#d32f2f',
    borderWidth: 5,
    borderColor: '#d32f2f',
    borderRadius: 60,
    width: 100,
    height: 100,
    textAlign: 'center',
    textAlignVertical: 'center',
    lineHeight: 90,
  },
  content: {
    padding: 20,
    alignItems: 'center',
  },
  alertBox: {
    backgroundColor: '#ffebee',
    padding: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ef9a9a',
    marginBottom: 30,
    width: '100%',
  },
  alertTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#c62828',
    marginBottom: 10,
    textAlign: 'center',
  },
  alertText: {
    fontSize: 16,
    color: '#333',
    marginBottom: 5,
    textAlign: 'center',
  },
  instructionText: {
    fontSize: 14,
    color: '#666',
    marginTop: 10,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  confirmButton: {
    backgroundColor: '#d32f2f',
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 30,
    width: '100%',
    alignItems: 'center',
    marginBottom: 15,
    elevation: 3,
  },
  confirmButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  cancelButton: {
    paddingVertical: 15,
    width: '100%',
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#757575',
    fontSize: 16,
  }
});

export default ReportScreen;