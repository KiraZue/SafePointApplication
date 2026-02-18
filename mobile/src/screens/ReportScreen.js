import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, TextInput, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api, { BASE_URL } from '../services/api';
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
  const { type, locationName, coordinates } = route.params || {};
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSendReport = async () => {
    if (loading) return; // Prevent double-send

    setLoading(true);
    try {
      const location = coordinates ? { x: coordinates.x, y: coordinates.y } : { x: 50, y: 50 };
      const reportData = {
        type: type.charAt(0).toUpperCase() + type.slice(1),
        message: message,
        location: {
          ...location,
          description: locationName,
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
      const isP2PConnected = BASE_URL.includes('192.168.49.1') || BASE_URL.includes(':8080');
      const isHosting = isProxyActive();

      console.log('[Report] Connection Diagnostics:', { hasInternet, isP2PConnected, isHosting });

      // 1. DIRECT BACKEND SUBMISSION
      if (!isHosting && hasInternet && !isP2PConnected) {
        try {
          const backendUrl = BASE_URL;
          let headers = { 'Content-Type': 'application/json' };
          const userInfoStr = await AsyncStorage.getItem('userInfo');
          if (userInfoStr) {
            const userInfo = JSON.parse(userInfoStr);
            if (userInfo.token) headers['Authorization'] = `Bearer ${userInfo.token}`;
          }

          const response = await axios.post(`${backendUrl}/reports`, reportData, {
            headers: headers,
            timeout: 10000
          });

          console.log('[Report] ✓ Direct SUCCESS:', response.data._id);
          Alert.alert("Emergency Reported", "Help is on the way.", [
            { text: "OK", onPress: () => navigation.replace('Home') }
          ]);
          setLoading(false);
          return;
        } catch (error) {
          console.log('[Report] Direct failed, falling back...');
        }
      }

      // 2. DUAL SUBMIT: ONLINE + CONNECTED TO HOST
      // User has internet AND is connected to a host → send to BOTH
      if (isP2PConnected && !isHosting && hasInternet) {
        try {
          // Send to backend first to get a real _id
          let backendReport = null;
          try {
            let headers = { 'Content-Type': 'application/json' };
            const userInfoStr = await AsyncStorage.getItem('userInfo');
            if (userInfoStr) {
              const userInfo = JSON.parse(userInfoStr);
              if (userInfo.token) headers['Authorization'] = `Bearer ${userInfo.token}`;
            }
            const backendRes = await axios.post(`${BASE_URL.replace(/:\d+\/api/, ':5000/api')}/reports`, reportData, {
              headers, timeout: 10000
            });
            backendReport = backendRes.data;
            console.log('[Report] ✓ Backend SUCCESS:', backendReport._id);
          } catch (backendErr) {
            console.log('[Report] Backend send failed (will still send to host):', backendErr.message);
          }

          // Also send to host proxy
          const tempId = backendReport?._id || `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const reportPayload = {
            _id: tempId,
            type: reportData.type,
            message: reportData.message,
            location: { ...location, description: locationName },
            user: reportData.user,
            createdAt: backendReport?.createdAt || new Date().toISOString(),
            status: 'REPORTED',
            statusHistory: [],
            syncedToBackend: !!backendReport
          };

          try {
            await fetch(`${BASE_URL}/p2p/report`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ type: 'emergency_report', payload: reportPayload })
            });
            console.log('[Report] ✓ Host SUCCESS');
          } catch (hostErr) {
            console.log('[Report] Host send failed:', hostErr.message);
          }

          Alert.alert("Emergency Reported", "Report sent to backend and host.", [
            { text: "OK", onPress: () => navigation.replace('Home') }
          ]);
          setLoading(false);
          return;
        } catch (error) {
          console.error('[Report] Dual submit failed:', error.message);
        }
      }

      // 3. CONNECTED TO HOST ONLY (CLIENT, no internet)
      if (isP2PConnected && !isHosting) {
        try {
          const tempId = `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const reportPayload = {
            _id: tempId,
            type: reportData.type,
            message: reportData.message,
            location: { ...location, description: locationName },
            user: reportData.user,
            createdAt: new Date().toISOString(),
            status: 'REPORTED',
            statusHistory: []
          };

          const response = await fetch(`${BASE_URL}/p2p/report`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'emergency_report', payload: reportPayload })
          });

          if (response.ok) {
            Alert.alert("Report Sent to Host", "Your report has been received by the host.", [
              { text: "OK", onPress: () => navigation.replace('Home') }
            ]);
            setLoading(false);
            return;
          }
          throw new Error('Host rejected request');
        } catch (error) {
          console.error('[Report] P2P failed:', error.message);
          Alert.alert("Submission Failed", "Failed to send to host. Please try again.", [
            { text: "OK", onPress: () => setLoading(false) }
          ]);
          return;
        }
      }

      // 3. HOSTING (Online or Offline)
      if (isHosting) {
        try {
          let backendReport = null;
          if (hasInternet) {
            try {
              const res = await api.post('/reports', reportData, { timeout: 10000 });
              backendReport = res.data;
            } catch (e) { console.log('[Report] Hosting-online backend sync failed'); }
          }

          const tempId = backendReport?._id || `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const hostedReportData = {
            ...reportData,
            _id: tempId,
            createdAt: backendReport?.createdAt || new Date().toISOString(),
            status: backendReport?.status || 'REPORTED',
            statusHistory: backendReport?.statusHistory || [],
            syncedToBackend: !!backendReport
          };

          const hostedReport = await addHostedReport(hostedReportData);
          addHostedReportToMemory({ ...hostedReport, hostedInGroup: true, fromHost: false });
          broadcastHostedStatusUpdate(hostedReport._id);
          DeviceEventEmitter.emit('HOSTED_REPORTS_CHANGED');

          Alert.alert("Emergency Reported", "Report saved and shared with your group.", [
            { text: "OK", onPress: () => navigation.replace('Home') }
          ]);
          setLoading(false);
          return;
        } catch (error) {
          console.error('[Report] Hosting save failed:', error);
        }
      }

      // 4. FALLBACK: STORE FULLY OFFLINE
      const offlineReport = await addOfflineReport({
        ...reportData,
        syncedToBackend: false
      });

      Alert.alert("Stored Offline", "Your report is saved and will sync when connected.", [
        { text: "OK", onPress: () => navigation.replace('Home') }
      ]);
      setLoading(false);

    } catch (error) {
      console.error('[Report] Unexpected error:', error);
      Alert.alert("Error", "An unexpected error occurred. Please try again.", [
        { text: "OK", onPress: () => setLoading(false) }
      ]);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.warningIcon}>!</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.alertBox}>
          <Text style={styles.alertTitle}>CONFIRM EMERGENCY</Text>
          <View style={styles.typeTag}>
            <Ionicons name="alert-circle" size={20} color="#d32f2f" />
            <Text style={styles.typeText}>{type}</Text>
          </View>

          <View style={styles.infoRow}>
            <Ionicons name="location" size={18} color="#666" />
            <Text style={styles.infoText}>{locationName || 'Current Location'}</Text>
          </View>

          <Text style={styles.label}>Emergency Details (Optional)</Text>
          <TextInput
            style={styles.messageInput}
            placeholder="Add any additional details here..."
            placeholderTextColor="#999"
            multiline
            numberOfLines={4}
            value={message}
            onChangeText={setMessage}
          />

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
      </ScrollView>
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
  scrollContent: {
    padding: 20,
    alignItems: 'center',
    paddingBottom: 40,
  },
  alertBox: {
    backgroundColor: '#fff',
    padding: 24,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#eee',
    marginBottom: 30,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  alertTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1a1a1a',
    marginBottom: 20,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  typeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffebee',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignSelf: 'center',
    marginBottom: 16,
  },
  typeText: {
    color: '#d32f2f',
    fontWeight: '700',
    fontSize: 16,
    marginLeft: 8,
    textTransform: 'uppercase',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  infoText: {
    color: '#666',
    fontSize: 15,
    marginLeft: 6,
    fontWeight: '500',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#444',
    marginBottom: 8,
  },
  messageInput: {
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    padding: 15,
    color: '#333',
    fontSize: 16,
    textAlignVertical: 'top',
    height: 100,
    borderWidth: 1,
    borderColor: '#eee',
    marginBottom: 20,
  },
  instructionText: {
    textAlign: 'center',
    color: '#666',
    fontSize: 14,
    lineHeight: 20,
    fontStyle: 'italic',
  },
  confirmButton: {
    backgroundColor: '#d32f2f',
    paddingVertical: 18,
    borderRadius: 15,
    width: '100%',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#d32f2f',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  confirmButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 1,
  },
  cancelButton: {
    paddingVertical: 15,
    width: '100%',
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ReportScreen;