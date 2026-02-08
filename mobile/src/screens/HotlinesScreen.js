import React from 'react';
import { View, Text, StyleSheet, SectionList, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute } from '@react-navigation/native';

const CATEGORIES = {
  Medical: [
    { name: 'Department of Health', number: '027111001' },
    { name: 'Philippine Red Cross', number: '143' },
    { name: 'Aklan Mission Hospital Emergency', number: '0362683855' },
  ],
  Fire: [
    { name: 'Bureau of Fire Protection', number: '911' },
    { name: 'BFP Kalibo Fire Station', number: '2682143' },
  ],
  Police: [
    { name: '911 – National Emergency', number: '911' },
    { name: 'Kalibo Police Station', number: '0362682166' },
  ],
  Disaster: [
    { name: 'Kalibo MDRRMO / LGU', number: '2621741' },
    { name: 'Kalibo MDRRMO / LGU', number: '2684487' },
    { name: 'Kalibo MDRRMO / LGU', number: '09997783316' },
  ],
  Utilities: [
    { name: 'Electric/Water Provider Hotline', number: '911' },
  ],
  Other: [
    { name: 'Philippine Red Cross (02)', number: '0285278385' },
    { name: 'BFP Kalibo Fire Station - Red Cross', number: '143' },
  ],
};

const HotlinesScreen = () => {
  const call = (num) => Linking.openURL(`tel:${num}`);
  const route = useRoute();
  const activeType = route?.params?.activeType;

  const sectionsBase = Object.entries(CATEGORIES).map(([title, data]) => ({ title, data }));
  const sections = (() => {
    const preferred = activeType === 'Earthquake' ? 'Disaster' : activeType;
    if (!preferred || !CATEGORIES[preferred]) return sectionsBase;
    const first = sectionsBase.find((s) => s.title === preferred);
    const rest = sectionsBase.filter((s) => s.title !== activeType);
    return [first, ...rest];
  })();

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Emergency Hotlines</Text>
      <SectionList
        sections={sections}
        keyExtractor={(item, idx) => item.name + idx}
        stickySectionHeadersEnabled
        renderSectionHeader={({ section: { title } }) => (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{title}</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <View>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.number}>{item.number}</Text>
            </View>
            <TouchableOpacity style={styles.callBtn} onPress={() => call(item.number)}>
              <Text style={styles.callText}>CALL</Text>
            </TouchableOpacity>
          </View>
        )}
        contentContainerStyle={{ paddingBottom: 24 }}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 12 },
  section: { backgroundColor: '#fff', paddingVertical: 4 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 8, color: '#424242' },
  item: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  name: { fontSize: 14, color: '#333' },
  number: { fontSize: 12, color: '#777' },
  callBtn: { backgroundColor: '#2e7d32', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  callText: { color: '#fff', fontWeight: 'bold' },
});

export default HotlinesScreen;
