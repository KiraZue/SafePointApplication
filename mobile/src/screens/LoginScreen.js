import React, { useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Image, ImageBackground } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '@react-navigation/native';

const LoginScreen = () => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const { login, loading } = useAuth();
  const navigation = useNavigation();

  const handleLogin = async () => {
    if (!identifier || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    const result = await login(identifier, password);
    if (!result.success) {
      Alert.alert('Error', result.message);
    }
  };

  /* SERVER SETTINGS MODAL */
  const [showSettings, setShowSettings] = useState(false);
  const [serverIp, setServerIp] = useState('');

  const handleSaveSettings = async () => {
    if (!serverIp) return;
    try {
      const { setCustomBaseURL } = require('../services/api');
      const newUrl = await setCustomBaseURL(serverIp);
      Alert.alert('Settings Saved', `Server URL set to:\n${newUrl}`);
      setShowSettings(false);
    } catch (e) {
      Alert.alert('Error', 'Failed to save settings');
    }
  };

  /* CONNECTION CHECK LOGIC - STABILIZED */
  const [isConnected, setIsConnected] = useState(false);
  const [checkingConnection, setCheckingConnection] = useState(true); // Start as checking
  const lastStatusRef = useRef(false);
  const consecutiveCountRef = useRef(0);

  const verifyConnection = async () => {
    setCheckingConnection(true);
    try {
      const { BASE_URL } = require('../services/api');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000); // 3s timeout
      const res = await fetch(`${BASE_URL.replace('/api', '')}/health`, {
        method: 'GET',
        signal: controller.signal
      });
      clearTimeout(timeout);
      const newStatus = res.ok;

      // Only change displayed status after 2 consecutive same results (debounce)
      if (newStatus === lastStatusRef.current) {
        consecutiveCountRef.current++;
      } else {
        consecutiveCountRef.current = 1;
        lastStatusRef.current = newStatus;
      }

      if (consecutiveCountRef.current >= 2) {
        setIsConnected(newStatus);
      }
    } catch (e) {
      if (lastStatusRef.current === false) {
        consecutiveCountRef.current++;
      } else {
        consecutiveCountRef.current = 1;
        lastStatusRef.current = false;
      }
      if (consecutiveCountRef.current >= 2) {
        setIsConnected(false);
      }
    } finally {
      setCheckingConnection(false);
    }
  };

  React.useEffect(() => {
    verifyConnection();
    const interval = setInterval(verifyConnection, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <ImageBackground source={require('../../assets/SafePoint-assets/BGPHONE.png')} style={styles.bg}>
      <View style={styles.container}>
        <Image source={require('../../assets/SafePoint-assets/Logo.png')} style={styles.heroLogo} />
        <Text style={styles.appTitle}>SAFE POINT</Text>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>OFFLINE SCHOOL SAFETY SYSTEM</Text>
          </View>

          <Text style={styles.inputLabel}>User Code or Full Name</Text>
          <TextInput
            style={styles.input}
            value={identifier}
            onChangeText={setIdentifier}
            autoCapitalize="none"
            placeholder="ENTER CODE/FULL NAME"
            placeholderTextColor="#777"
          />

          <Text style={styles.inputLabel}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="ENTER PASSWORD"
            placeholderTextColor="#777"
          />

          <TouchableOpacity style={[styles.ctaBtn, styles.loginBtn]} onPress={handleLogin} disabled={loading || !isConnected}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaText}>LOGIN</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={[styles.ctaBtn, styles.registerBtn]} onPress={() => navigation.navigate('SignUp')} disabled={!isConnected}>
            <Text style={styles.ctaText}>REGISTER</Text>
          </TouchableOpacity>


          {/* Connection Status Indicator - MOVED BELOW BUTTONS */}
          <View style={[styles.connectionBadge, { backgroundColor: isConnected ? '#e8f5e9' : (checkingConnection ? '#fff4e5' : '#ffebee') }]}>
            {checkingConnection ? (
              <ActivityIndicator size="small" color="#ffa000" style={{ marginRight: 8 }} />
            ) : (
              <View style={[styles.statusDot, { backgroundColor: isConnected ? '#4caf50' : '#f44336' }]} />
            )}
            <Text style={[styles.connectionText, { color: isConnected ? '#2e7d32' : (checkingConnection ? '#b45309' : '#c62828') }]}>
              {checkingConnection ? 'Connecting to Backend...' : (isConnected ? 'Connected to Server' : 'Disconnected / Server Not Found')}
            </Text>
          </View>

          {/* Server Settings - ONLY SHOW WHEN DISCONNECTED */}
          {!isConnected && (
            <TouchableOpacity
              style={styles.settingsLink}
              onPress={() => setShowSettings(true)}
            >
              <Text style={styles.settingsLinkText}>Server Settings</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* SETTINGS MODAL */}
        {showSettings && (
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Server Configuration</Text>
              <Text style={styles.modalDesc}>
                Enter the IP address of your backend server (e.g., 192.168.1.5).
              </Text>
              <TextInput
                style={styles.modalInput}
                value={serverIp}
                onChangeText={setServerIp}
                placeholder="192.168.x.x"
                keyboardType="numeric"
                autoCapitalize="none"
              />
              <View style={styles.modalButtons}>
                <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setShowSettings(false)}>
                  <Text style={styles.modalBtnTextCancel}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalBtnSave} onPress={async () => {
                  await handleSaveSettings();
                  // Reset consecutive count so re-check starts fresh
                  consecutiveCountRef.current = 0;
                  lastStatusRef.current = false;
                  setCheckingConnection(true);
                  verifyConnection();
                }}>
                  <Text style={styles.modalBtnTextSave}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </View>
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  bg: { flex: 1, resizeMode: 'cover' },
  container: { flex: 1, padding: 25, paddingTop: 0, justifyContent: 'center', gap: 8 },
  heroLogo: { width: 160, height: 160, resizeMode: 'contain', alignSelf: 'center' },
  appTitle: { fontSize: 28, fontWeight: 'bold', color: '#1B3F6E', textAlign: 'center', letterSpacing: 2, marginBottom: 4 },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 20, paddingBottom: 28, elevation: 8, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10 },
  cardHeader: { alignItems: 'center', marginBottom: 10 },
  cardTitle: { fontSize: 13, fontWeight: 'bold', color: '#1B3F6E', textAlign: 'center', letterSpacing: 1 },

  connectionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    marginTop: 16,
    alignSelf: 'center'
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6
  },
  connectionText: {
    fontSize: 12,
    fontWeight: '600'
  },

  inputLabel: { fontSize: 12, color: '#1B3F6E', fontWeight: '600', marginTop: 12 },
  input: { borderWidth: 2, borderColor: '#1B3F6E', borderRadius: 25, paddingVertical: 10, paddingHorizontal: 16, marginTop: 6, textAlign: 'center', color: '#1B3F6E' },
  ctaBtn: { height: 52, borderRadius: 25, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  loginBtn: { backgroundColor: '#CC1B1B', marginTop: 20 },
  registerBtn: { backgroundColor: '#CC1B1B' },
  ctaText: { color: '#fff', fontSize: 18, fontWeight: 'bold', letterSpacing: 1 },

  settingsLink: { marginTop: 10, alignSelf: 'center' },
  settingsLinkText: { color: '#888', textDecorationLine: 'underline', fontSize: 12 },

  modalOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20, zIndex: 999
  },
  modalContent: {
    backgroundColor: '#fff', width: '100%', borderRadius: 16, padding: 20, elevation: 5
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 10, color: '#1B3F6E' },
  modalDesc: { fontSize: 14, color: '#666', marginBottom: 15 },
  modalInput: {
    borderWidth: 1, borderColor: '#1B3F6E', borderRadius: 10, padding: 10, fontSize: 16, marginBottom: 20
  },
  modalButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  modalBtnCancel: { padding: 10 },
  modalBtnTextCancel: { color: '#666', fontWeight: 'bold' },
  modalBtnSave: { backgroundColor: '#1B3F6E', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10 },
  modalBtnTextSave: { color: '#fff', fontWeight: 'bold' }
});

export default LoginScreen;
