import React from 'react';
import { View, Text, StyleSheet, SectionList, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

const CATEGORIES = {
  Medical: [
    { name: 'Department of Health', number: '027111001', icon: 'medical' },
    { name: 'Philippine Red Cross', number: '143', icon: 'add-circle' },
    { name: 'Aklan Mission Hospital Emergency', number: '0362683855', icon: 'pulse' },
  ],
  Fire: [
    { name: 'Bureau of Fire Protection', number: '911', icon: 'flame' },
    { name: 'BFP Kalibo Fire Station', number: '2682143', icon: 'bonfire' },
  ],
  Police: [
    { name: '911 – National Emergency', number: '911', icon: 'alert-circle' },
    { name: 'Kalibo Police Station', number: '0362682166', icon: 'shield-checkmark' },
  ],
  Disaster: [
    { name: 'Kalibo MDRRMO / LGU', number: '2621741', icon: 'warning' },
    { name: 'Kalibo MDRRMO / LGU', number: '2684487', icon: 'warning' },
    { name: 'Kalibo MDRRMO / LGU', number: '09997783316', icon: 'warning' },
  ],
  Utilities: [
    { name: 'Electric/Water Provider Hotline', number: '911', icon: 'flash' },
  ],
  Other: [
    { name: 'Philippine Red Cross (02)', number: '0285278385', icon: 'help-circle' },
    { name: 'BFP Kalibo Fire Station - Red Cross', number: '143', icon: 'help-circle' },
  ],
};

const CATEGORY_ICONS = {
  Medical: { icon: 'medical', color: '#DC2626', bgColor: '#FEE2E2' },
  Fire: { icon: 'flame', color: '#EA580C', bgColor: '#FFEDD5' },
  Police: { icon: 'shield-checkmark', color: '#2563EB', bgColor: '#DBEAFE' },
  Disaster: { icon: 'warning', color: '#CA8A04', bgColor: '#FEF3C7' },
  Utilities: { icon: 'flash', color: '#7C3AED', bgColor: '#EDE9FE' },
  Other: { icon: 'information-circle', color: '#059669', bgColor: '#D1FAE5' },
};

const HotlinesScreen = () => {
  const call = (num) => Linking.openURL(`tel:${num}`);
  const route = useRoute();
  const navigation = useNavigation();
  const activeType = route?.params?.activeType;

  const sectionsBase = Object.entries(CATEGORIES).map(([title, data]) => ({ title, data }));
  const sections = (() => {
    // Map activeType to appropriate category
    let preferred = activeType;
    if (activeType === 'Earthquake') {
      preferred = 'Disaster';
    } else if (activeType === 'Security') {
      preferred = 'Police';
    } else if (activeType === 'Accident') {
      preferred = 'Medical';
    }
    
    if (!preferred || !CATEGORIES[preferred]) return sectionsBase;
    const first = sectionsBase.find((s) => s.title === preferred);
    const rest = sectionsBase.filter((s) => s.title !== preferred);
    return [first, ...rest];
  })();

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={28} color="#111827" />
        </TouchableOpacity>
        <View style={styles.headerTextContainer}>
          <Text style={styles.title}>Emergency Hotlines</Text>
          <Text style={styles.subtitle}>24/7 Emergency Services</Text>
        </View>
      </View>

      {/* Quick Dial 911 Button */}
      <TouchableOpacity 
        style={styles.emergencyButton} 
        onPress={() => call('911')}
        activeOpacity={0.8}
      >
        <View style={styles.emergencyButtonContent}>
          <Ionicons name="call" size={32} color="#fff" />
          <View style={styles.emergencyButtonText}>
            <Text style={styles.emergencyButtonTitle}>Emergency Call</Text>
            <Text style={styles.emergencyButtonNumber}>911</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={24} color="#fff" />
      </TouchableOpacity>

      {/* Hotlines List */}
      <SectionList
        sections={sections}
        keyExtractor={(item, idx) => item.name + idx}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        renderSectionHeader={({ section: { title } }) => {
          const categoryStyle = CATEGORY_ICONS[title];
          // Map activeType to category for highlighting
          let mappedCategory = activeType;
          if (activeType === 'Earthquake') mappedCategory = 'Disaster';
          else if (activeType === 'Security') mappedCategory = 'Police';
          else if (activeType === 'Accident') mappedCategory = 'Medical';
          
          const isActiveSection = title === mappedCategory;
          return (
            <View style={[
              styles.sectionHeader,
              isActiveSection && styles.sectionHeaderHighlighted
            ]}>
              <View style={[styles.sectionIconContainer, { backgroundColor: categoryStyle.bgColor }]}>
                <Ionicons name={categoryStyle.icon} size={20} color={categoryStyle.color} />
              </View>
              <Text style={[
                styles.sectionTitle,
                isActiveSection && styles.sectionTitleHighlighted
              ]}>{title}</Text>
              {isActiveSection && (
                <View style={styles.suggestedBadge}>
                  <Text style={styles.suggestedBadgeText}>SUGGESTED</Text>
                </View>
              )}
            </View>
          );
        }}
        renderItem={({ item, section }) => {
          const categoryStyle = CATEGORY_ICONS[section.title];
          // Map activeType to category for highlighting
          let mappedCategory = activeType;
          if (activeType === 'Earthquake') mappedCategory = 'Disaster';
          else if (activeType === 'Security') mappedCategory = 'Police';
          else if (activeType === 'Accident') mappedCategory = 'Medical';
          
          const isActiveSection = section.title === mappedCategory;
          return (
            <TouchableOpacity 
              style={[
                styles.item,
                isActiveSection && styles.itemHighlighted
              ]}
              onPress={() => call(item.number)}
              activeOpacity={0.7}
            >
              <View style={styles.itemLeft}>
                <View style={[styles.itemIconContainer, { backgroundColor: categoryStyle.bgColor }]}>
                  <Ionicons name={item.icon} size={22} color={categoryStyle.color} />
                </View>
                <View style={styles.itemTextContainer}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <View style={styles.numberContainer}>
                    <Ionicons name="call-outline" size={14} color="#6B7280" />
                    <Text style={styles.itemNumber}>{item.number}</Text>
                  </View>
                </View>
              </View>
              <View style={[styles.callButton, { backgroundColor: categoryStyle.color }]}>
                <Ionicons name="call" size={18} color="#fff" />
              </View>
            </TouchableOpacity>
          );
        }}
        contentContainerStyle={styles.listContent}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#F9FAFB',
  },
  
  // Header Styles
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  headerTextContainer: {
    flex: 1,
  },
  title: { 
    fontSize: 24, 
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
    fontWeight: '500',
  },

  // Emergency 911 Button
  emergencyButton: {
    backgroundColor: '#DC2626',
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 16,
    borderRadius: 20,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  emergencyButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  emergencyButtonText: {
    marginLeft: 16,
  },
  emergencyButtonTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    opacity: 0.9,
  },
  emergencyButtonNumber: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    marginTop: 2,
    letterSpacing: 1,
  },

  // Section Header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#F9FAFB',
  },
  sectionHeaderHighlighted: {
    backgroundColor: '#FEF3C7',
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
    paddingLeft: 16,
  },
  sectionIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  sectionTitle: { 
    fontSize: 18, 
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.3,
    flex: 1,
  },
  sectionTitleHighlighted: {
    color: '#92400E',
  },
  suggestedBadge: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  suggestedBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  // List Item
  item: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: '#fff',
    marginBottom: 1,
  },
  itemHighlighted: {
    backgroundColor: '#FFFBEB',
    borderLeftWidth: 3,
    borderLeftColor: '#F59E0B',
    paddingLeft: 17,
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  itemIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  itemTextContainer: {
    flex: 1,
  },
  itemName: { 
    fontSize: 15, 
    color: '#111827',
    fontWeight: '600',
    marginBottom: 4,
  },
  numberContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemNumber: { 
    fontSize: 14, 
    color: '#6B7280',
    marginLeft: 4,
    fontWeight: '500',
  },
  callButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  
  listContent: { 
    paddingBottom: 24,
  },
});

export default HotlinesScreen;