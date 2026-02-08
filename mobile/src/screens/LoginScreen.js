import React, { useState } from 'react';
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

  return (
    <ImageBackground source={require('../../assets/SafePoint-assets/MobileBG.png')} style={styles.bg}>
      <View style={styles.container}>
        <Image source={require('../../assets/SafePoint-assets/Logo.png')} style={styles.heroLogo} />
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Image source={require('../../assets/SafePoint-assets/2log.png')} style={styles.miniLogo} />
            <Text style={styles.cardTitle}>YOUR GUIDE TO SAFETY</Text>
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

          <TouchableOpacity style={[styles.ctaBtn, styles.loginBtn]} onPress={handleLogin} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaText}>LOGIN</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={[styles.ctaBtn, styles.registerBtn]} onPress={() => navigation.navigate('SignUp')}>
            <Text style={styles.ctaText}>REGISTER</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  bg: { flex: 1, resizeMode: 'cover' },
  container: { flex: 1, padding: 25, paddingTop: 0, justifyContent: 'center', gap: 0},
  heroLogo: { width: 720, height: 360, resizeMode: 'contain', alignSelf: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 18,paddingBottom: 30, elevation: 6, bottom: 90},
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  miniLogo: { width: 90, height: 90, resizeMode: 'contain', marginBottom: -30},
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#1f1f1f', marginLeft: -35 },
  inputLabel: { fontSize: 12, color: '#333', marginTop: 12},
  input: { borderWidth: 2, borderColor: '#333', borderRadius: 20, paddingVertical: 10, paddingHorizontal: 12, marginTop: 6, textAlign: 'center' },
  ctaBtn: { height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  loginBtn: { backgroundColor: '#2b4266', marginTop: 20, borderRadius: 25, },
  registerBtn: { backgroundColor: '#2b4266', borderRadius: 25 },
  ctaText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});

export default LoginScreen;
