import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Dimensions, TextInput, Image, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import { getPendingCount, isAllSynced, clearAllOfflineData } from '../services/offline';

const screenWidth = Dimensions.get('window').width;

const Field = ({ label, value, onChangeText, editable }) => (
  <View style={{ marginBottom: 12 }}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <TextInput
      style={[styles.input, !editable ? styles.inputReadOnly : null]}
      value={value}
      onChangeText={onChangeText}
      editable={editable}
      placeholder={label}
      placeholderTextColor="#777"
    />
  </View>
);

const OptionsPicker = ({ label, value, options, onSelect, disabled }) => (
  <View style={{ marginBottom: 12 }}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <TouchableOpacity disabled={disabled} onPress={() => !disabled && onSelect(null)} activeOpacity={0.85}>
      <View style={[styles.input, styles.selector]}>
        <Text style={styles.selectorText}>{value || 'Select'}</Text>
        <Ionicons name="chevron-down" size={18} color="#333" />
      </View>
    </TouchableOpacity>
    {!disabled && Array.isArray(options) && options.length > 0 && (
      <View style={styles.optionList}>
        {options.map((opt) => (
          <TouchableOpacity key={opt} onPress={() => onSelect(opt)} style={styles.optionItem}>
            <Text style={styles.optionText}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </View>
    )}
  </View>
);

const ProfileSidebar = ({ visible, onClose, user, panelWidth }) => {
  const navigation = useNavigation();
  const width = panelWidth || Math.round(screenWidth * 0.85);
  const slide = useRef(new Animated.Value(width)).current;
  const [activeTab, setActiveTab] = useState('Emergency');
  const [editingEmergency, setEditingEmergency] = useState(false);
  const [editingPersonal, setEditingPersonal] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [clearingData, setClearingData] = useState(false);

  const [contactPerson, setContactPerson] = useState('');
  const [relation, setRelation] = useState('');
  const [contactNo, setContactNo] = useState('');
  const [contactAddress, setContactAddress] = useState('');

  const [levelGroup, setLevelGroup] = useState('');
  const [gradeLevel, setGradeLevel] = useState('');
  const [strandCourse, setStrandCourse] = useState('');
  const [personalContact, setPersonalContact] = useState('');

  useEffect(() => {
    Animated.spring(slide, { toValue: visible ? 0 : width, useNativeDriver: true, damping: 18, stiffness: 180 }).start();
  }, [visible, slide, width]);
  
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const { data } = await api.get('/users/me');
        const ec = data.emergencyContact || {};
        const p = data.personal || {};
        setContactPerson(ec.name || '');
        setRelation(ec.relation || '');
        setContactNo(ec.number || '');
        setContactAddress(ec.address || '');
        setLevelGroup(p.levelGroup || '');
        setGradeLevel(p.gradeLevel || '');
        setStrandCourse(p.strandCourse || '');
        setPersonalContact(p.contactNumber || '');
      } catch (err) {}
    };
    
    const loadPendingCount = async () => {
      const count = await getPendingCount();
      setPendingCount(count);
    };
    
    if (visible) {
      loadProfile();
      loadPendingCount();
      
      // Refresh pending count periodically
      const interval = setInterval(loadPendingCount, 3000);
      return () => clearInterval(interval);
    }
  }, [visible]);

  const levelOptions = ['HS', 'SHS', 'College'];
  const gradeMap = {
    HS: ['Grade 7', 'Grade 8', 'Grade 9', 'Grade 10'],
    SHS: ['Grade 11', 'Grade 12'],
    College: ['1st Year', '2nd Year', '3rd Year', '4th Year'],
  };
  const strandMap = {
    SHS: ['STEM', 'ABM', 'HUMSS'],
    College: ['BS in Nursing', 'BS in Radiologic Technology', 'BS in Medical Laboratory Science', 'BS in Pharmacy'],
  };

  const currentGradeOptions = levelGroup ? gradeMap[levelGroup] || [] : [];
  const currentStrandOptions = levelGroup && strandMap[levelGroup] ? strandMap[levelGroup] : [];

  const selectRelation = (opt) => setRelation(opt);
  const selectLevelGroup = (opt) => {
    setLevelGroup(opt);
    setGradeLevel('');
    setStrandCourse('');
  };
  
  const handleClearOfflineData = async () => {
    const allSynced = await isAllSynced();
    
    if (!allSynced) {
      Alert.alert(
        'Cannot Clear Data',
        `You have ${pendingCount} pending item(s) that haven't been synced yet. Please connect to the internet or a host to sync first.`,
        [{ text: 'OK' }]
      );
      return;
    }
    
    Alert.alert(
      'Clear Offline Data',
      'All offline data has been synced. Do you want to clear all offline data?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            setClearingData(true);
            const result = await clearAllOfflineData();
            setClearingData(false);
            
            if (result.success) {
              setPendingCount(0);
              Alert.alert('Success', result.message);
            } else {
              Alert.alert('Error', result.message);
            }
          }
        }
      ]
    );
  };
  
  const saveEmergency = async () => {
    const payload = { emergencyContact: { name: contactPerson, relation, number: contactNo, address: contactAddress } };
    const candidates = ['/users/profile', '/users/me', '/users/update-profile'];
    let success = false, lastErr;
    for (const ep of candidates) {
      try {
        await api.put(ep, payload);
        success = true;
        break;
      } catch (err) {
        lastErr = err;
      }
    }
    if (success) {
      Alert.alert('Success', 'Information updated');
      setEditingEmergency(false);
      try {
        const { data } = await api.get('/users/me');
        const ec = data.emergencyContact || {};
        setContactPerson(ec.name || '');
        setRelation(ec.relation || '');
        setContactNo(ec.number || '');
        setContactAddress(ec.address || '');
      } catch (err) {}
    } else {
      Alert.alert('Error', lastErr?.response?.data?.message || 'Failed to update');
    }
  };
  
  const savePersonal = async () => {
    const payload = { personal: { levelGroup, gradeLevel, strandCourse, contactNumber: personalContact } };
    const candidates = ['/users/profile', '/users/me', '/users/update-profile'];
    let success = false, lastErr;
    for (const ep of candidates) {
      try {
        await api.put(ep, payload);
        success = true;
        break;
      } catch (err) {
        lastErr = err;
      }
    }
    if (success) {
      Alert.alert('Success', 'Information updated');
      setEditingPersonal(false);
      try {
        const { data } = await api.get('/users/me');
        const p = data.personal || {};
        setLevelGroup(p.levelGroup || '');
        setGradeLevel(p.gradeLevel || '');
        setStrandCourse(p.strandCourse || '');
        setPersonalContact(p.contactNumber || '');
      } catch (err) {}
    } else {
      Alert.alert('Error', lastErr?.response?.data?.message || 'Failed to update');
    }
  };

  return (
    <Animated.View style={[styles.container, { width, transform: [{ translateX: slide }] }]}>
      <SafeAreaView edges={['top']} style={styles.headerSafe}>
        <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn} activeOpacity={0.85}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <View style={{ alignItems: 'center', flex: 1 }}>
          <Text style={styles.fullName}>{user?.lastName}, {user?.firstName} {user?.middleName || ''}</Text>
          <Text style={styles.roleText}>({user?.role || '—'})</Text>
        </View>
        <TouchableOpacity onPress={() => Alert.alert('Confirm', 'Do you want to logout?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Logout', style: 'destructive', onPress: user?.logout },
        ])} style={styles.logoutBtn} activeOpacity={0.85}>
          <Ionicons name="log-out-outline" size={22} color="#000" />
          <Text style={styles.logoutText}>Log out</Text>
        </TouchableOpacity>
        </View>
      </SafeAreaView>
      <SafeAreaView edges={['bottom']} style={{ flex: 1 }}>
        <View style={styles.tabs}>
          {['Settings', 'Emergency', 'Personal'].map((tab) => (
            <TouchableOpacity key={tab} onPress={() => setActiveTab(tab)} style={[styles.tabBtn, activeTab === tab ? styles.tabActive : null]} activeOpacity={0.85}>
              <Text style={[styles.tabText, activeTab === tab ? styles.tabTextActive : null]}>{tab}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <ScrollView contentContainerStyle={{ padding: 18 }}>
          {activeTab === 'Settings' && (
            <View>
              <Text style={styles.sectionTitle}>Settings</Text>
              
              <TouchableOpacity 
                style={styles.settingItem} 
                onPress={() => {
                  onClose();
                  navigation.navigate('WifiDirect');
                }}
              >
                <View style={styles.settingIcon}>
                  <Ionicons name="wifi" size={20} color="#2b4266" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingLabel}>Wi-Fi Direct Connectivity</Text>
                  <Text style={styles.settingDesc}>Connect to nearby devices offline</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#ccc" />
              </TouchableOpacity>
              
              <View style={styles.offlineDataCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                  <Ionicons name="cloud-offline" size={20} color="#666" />
                  <Text style={[styles.settingLabel, { marginLeft: 8 }]}>Offline Data</Text>
                </View>
                <Text style={styles.settingDesc}>
                  Pending items: {pendingCount}
                  {pendingCount > 0 && '\n(Connect to sync these items)'}
                </Text>
                
                <TouchableOpacity
                  style={[
                    styles.clearDataBtn,
                    (pendingCount > 0 || clearingData) && styles.clearDataBtnDisabled
                  ]}
                  onPress={handleClearOfflineData}
                  disabled={pendingCount > 0 || clearingData}
                >
                  {clearingData ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="trash-outline" size={18} color="#fff" />
                      <Text style={styles.clearDataText}>
                        {pendingCount > 0 ? 'Sync Required' : 'Clear All Data'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
                
                {pendingCount === 0 && (
                  <Text style={styles.allSyncedText}>✓ All data synced</Text>
                )}
              </View>
            </View>
          )}
          {activeTab === 'Emergency' && (
            <View>
              <Text style={styles.sectionTitle}>Emergency Contact Information</Text>
              <Field label="Contact Person" value={contactPerson} onChangeText={setContactPerson} editable={editingEmergency} />
              <OptionsPicker
                label="Relation"
                value={relation}
                options={editingEmergency ? ['Parent', 'Guardian', 'Family Member'] : []}
                onSelect={(opt) => selectRelation(opt ?? relation)}
                disabled={!editingEmergency}
              />
              <Field label="Contact No." value={contactNo} onChangeText={setContactNo} editable={editingEmergency} />
              <Field label="Contact Address" value={contactAddress} onChangeText={setContactAddress} editable={editingEmergency} />
              {!editingEmergency ? (
                <TouchableOpacity style={styles.editBtn} onPress={() => setEditingEmergency(true)} activeOpacity={0.85}>
                  <Text style={styles.editText}>EDIT</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.updateBtn} onPress={saveEmergency} activeOpacity={0.85}>
                  <Text style={styles.updateText}>UPDATE</Text>
                </TouchableOpacity>
              )}
              <Text style={styles.updateNote}>Update Emergency Information</Text>
            </View>
          )}
          {activeTab === 'Personal' && (
            <View>
              <Text style={styles.sectionTitle}>Personal Information</Text>
              <Field label="Full Name" value={`${user?.firstName || ''} ${user?.middleName || ''} ${user?.lastName || ''}`.trim()} onChangeText={() => {}} editable={false} />
              <OptionsPicker
                label="Grade/Year Level Group"
                value={levelGroup}
                options={editingPersonal ? levelOptions : []}
                onSelect={(opt) => selectLevelGroup(opt ?? levelGroup)}
                disabled={!editingPersonal}
              />
              <OptionsPicker
                label="Grade/Year Level"
                value={gradeLevel}
                options={editingPersonal ? currentGradeOptions : []}
                onSelect={(opt) => setGradeLevel(opt ?? gradeLevel)}
                disabled={!editingPersonal}
              />
              <OptionsPicker
                label="Strand/Course"
                value={strandCourse}
                options={editingPersonal ? currentStrandOptions : []}
                onSelect={(opt) => setStrandCourse(opt ?? strandCourse)}
                disabled={!editingPersonal || levelGroup === 'HS'}
              />
              <Field label="Contact No." value={personalContact} onChangeText={setPersonalContact} editable={editingPersonal} />
              {!editingPersonal ? (
                <TouchableOpacity style={styles.editBtn} onPress={() => setEditingPersonal(true)} activeOpacity={0.85}>
                  <Text style={styles.editText}>EDIT</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.updateBtn} onPress={savePersonal} activeOpacity={0.85}>
                  <Text style={styles.updateText}>UPDATE</Text>
                </TouchableOpacity>
              )}
              <Text style={styles.updateNote}>Update Personal Information</Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: { position: 'absolute', right: 0, top: 0, bottom: 0, backgroundColor: '#fff', elevation: 8, zIndex: 30, borderTopLeftRadius: 16, borderBottomLeftRadius: 16, overflow: 'hidden' },
  headerSafe: { backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee' },
  backBtn: { padding: 8 },
  fullName: { fontSize: 18, fontWeight: 'bold', color: '#000' },
  roleText: { fontSize: 14, color: '#666' },
  logoutBtn: { alignItems: 'center', paddingHorizontal: 8 },
  logoutText: { fontSize: 12, color: '#333' },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', color: '#000', marginTop: 10, marginBottom: 6 },
  fieldLabel: { fontSize: 12, color: '#333', marginBottom: 4 },
  input: { borderWidth: 2, borderColor: '#333', borderRadius: 20, paddingVertical: 10, paddingHorizontal: 12, textAlign: 'center' },
  inputReadOnly: { backgroundColor: '#f5f5f5' },
  selector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', textAlign: 'center'  },
  selectorText: { color: '#333', fontSize: 14, fontWeight: 'bold'},
  optionList: { marginTop: 6, borderWidth: 1, borderColor: '#ddd', borderRadius: 10, overflow: 'hidden' },
  optionItem: { paddingVertical: 10, paddingHorizontal: 12, backgroundColor: '#fafafa' },
  optionText: { color: '#333', fontSize: 14 },
  editBtn: { backgroundColor: '#2b4266', height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  editText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  updateBtn: { backgroundColor: '#2b4266', height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  updateText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  updateNote: { textAlign: 'center', color: '#666', marginTop: 6 },
  tabs: { flexDirection: 'row', justifyContent: 'space-around', borderBottomWidth: 1, borderBottomColor: '#eee', backgroundColor: '#fff' },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 3, borderBottomColor: '#2b4266' },
  tabText: { fontSize: 14, color: '#666', fontWeight: 'bold' },
  tabTextActive: { color: '#2b4266' },
  settingItem: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#fafafa', borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#eee' },
  settingIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#eef2f6', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  settingLabel: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  settingDesc: { fontSize: 12, color: '#666', marginTop: 2 },
  offlineDataCard: { padding: 16, backgroundColor: '#f9f9f9', borderRadius: 12, borderWidth: 1, borderColor: '#eee', marginTop: 8 },
  clearDataBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#d32f2f', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, marginTop: 12 },
  clearDataBtnDisabled: { backgroundColor: '#ccc' },
  clearDataText: { color: '#fff', fontSize: 14, fontWeight: 'bold', marginLeft: 6 },
  allSyncedText: { fontSize: 12, color: '#4caf50', marginTop: 8, textAlign: 'center', fontWeight: 'bold' },
});

export default ProfileSidebar;