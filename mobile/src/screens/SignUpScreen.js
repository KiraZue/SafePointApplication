import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Image, ImageBackground } from 'react-native';
import api from '../services/api';

const SignUpScreen = ({ navigation }) => {
  const [step, setStep] = useState('code');
  const [userCode, setUserCode] = useState('');
  const [userInfo, setUserInfo] = useState(null);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const lookup = async () => {
    if (!userCode || userCode.length !== 7) {
      Alert.alert('Error', 'Enter valid 7-character user code');
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.get(`/users/lookup/${userCode}`);
      setUserInfo(data);
      setStep('confirm');
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || 'User not found');
    } finally {
      setLoading(false);
    }
  };

  const confirmMe = () => setStep('setPassword');

  const setPwd = async () => {
    if (!password || password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    try {
      await api.post('/users/register-password', { userCode, password });
      Alert.alert('Success', 'Password set. You can now log in.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to set password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ImageBackground source={require('../../assets/SafePoint-assets/BGPHONE.png')} style={styles.bg}>
      <View style={styles.container}>
        <Image source={require('../../assets/SafePoint-assets/Logo.png')} style={styles.heroLogo} />
        <Text style={styles.appTitle}>SAFE POINT</Text>
        {step === 'code' && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>REGISTER YOUR ACCOUNT</Text>
            </View>
            <Text style={styles.inputLabel}>Enter Your User Code</Text>
            <TextInput
              style={styles.input}
              value={userCode}
              onChangeText={setUserCode}
              autoCapitalize="characters"
              maxLength={7}
              placeholder="ENTER CODE"
              placeholderTextColor="#777"
            />
            <TouchableOpacity style={[styles.ctaBtn, styles.primaryBtn]} onPress={lookup} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaText}>CONTINUE</Text>}
            </TouchableOpacity>
          </View>
        )}
        {step === 'confirm' && userInfo && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>CONFIRM YOUR IDENTITY</Text>
            </View>
            <Text style={styles.info}>Full Name: {userInfo.lastName}, {userInfo.firstName} {userInfo.middleName}</Text>
            <Text style={styles.info}>Role: {userInfo.role}</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }}>
              <TouchableOpacity style={[styles.ctaBtn, styles.primaryBtn, { flex: 1, marginRight: 6 }]} onPress={confirmMe}>
                <Text style={styles.ctaText}>CONFIRM</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.ctaBtn, styles.secondaryBtn, { flex: 1, marginLeft: 6 }]} onPress={() => setStep('code')}>
                <Text style={styles.ctaText}>NOT ME</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        {step === 'setPassword' && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>SET YOUR PASSWORD</Text>
            </View>
            <Text style={styles.inputLabel}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="ENTER PASSWORD"
              placeholderTextColor="#777"
            />
            <TouchableOpacity style={[styles.ctaBtn, styles.primaryBtn]} onPress={setPwd} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaText}>FINISH SIGN UP</Text>}
            </TouchableOpacity>
          </View>
        )}
      </View>
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  bg: { flex: 1, resizeMode: 'cover' },
  container: { flex: 1, padding: 25, justifyContent: 'center', gap: 8 },
  heroLogo: { width: 140, height: 140, resizeMode: 'contain', alignSelf: 'center' },
  appTitle: { fontSize: 28, fontWeight: 'bold', color: '#1B3F6E', textAlign: 'center', letterSpacing: 2, marginBottom: 6 },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 20, paddingBottom: 28, elevation: 8, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10 },
  cardHeader: { alignItems: 'center', marginBottom: 10 },
  cardTitle: { fontSize: 13, fontWeight: 'bold', color: '#1B3F6E', textAlign: 'center', letterSpacing: 1 },
  inputLabel: { fontSize: 12, color: '#1B3F6E', fontWeight: '600', marginTop: 8 },
  input: { borderWidth: 2, borderColor: '#1B3F6E', borderRadius: 25, paddingVertical: 10, paddingHorizontal: 16, marginTop: 6, textAlign: 'center', color: '#1B3F6E' },
  ctaBtn: { height: 52, borderRadius: 25, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  primaryBtn: { backgroundColor: '#CC1B1B' },
  secondaryBtn: { backgroundColor: '#1B3F6E' },
  ctaText: { color: '#fff', fontSize: 18, fontWeight: 'bold', letterSpacing: 1 },
  info: { fontSize: 14, color: '#333', marginBottom: 4, textAlign: 'center' },
});

export default SignUpScreen;

