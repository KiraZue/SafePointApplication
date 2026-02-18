import React from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, Dimensions, ScrollView, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EMERGENCY_TYPES, FLOORS } from '../constants/mapData';

const { width } = Dimensions.get('window');

// Emergency Type Selection Modal
export const EmergencyTypeModal = ({ visible, onClose, onSelect }) => (
    <Modal visible={visible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Select Emergency Type</Text>
                <View style={styles.typeGrid}>
                    {EMERGENCY_TYPES.map((type) => (
                        <TouchableOpacity
                            key={type.id}
                            style={[styles.typeButton, { backgroundColor: type.color }]}
                            onPress={() => onSelect(type.id)}
                        >
                            <Image
                                source={type.icon}
                                style={styles.typeIconImage}
                                resizeMode="contain"
                                resizeMethod="resize"
                            />
                            <Text style={styles.typeLabel}>{type.name}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
                <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                    <Text style={styles.closeButtonText}>Cancel</Text>
                </TouchableOpacity>
            </View>
        </View>
    </Modal>
);

// Floor Selection Modal
export const FloorSelectionModal = ({ visible, buildingName, onSelect, onSkip }) => (
    <Modal visible={visible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Select Floor</Text>
                <Text style={styles.buildingLabel}>{buildingName}</Text>
                <ScrollView style={styles.optionsList}>
                    {FLOORS.map((floor) => (
                        <TouchableOpacity
                            key={floor}
                            style={styles.optionButton}
                            onPress={() => onSelect(floor)}
                        >
                            <Text style={styles.optionText}>{floor}</Text>
                            <Ionicons name="chevron-forward" size={24} color="#666" />
                        </TouchableOpacity>
                    ))}
                </ScrollView>
                <TouchableOpacity style={styles.skipButton} onPress={onSkip}>
                    <Text style={styles.skipButtonText}>Skip</Text>
                </TouchableOpacity>
            </View>
        </View>
    </Modal>
);

// Room Selection Modal
export const RoomSelectionModal = ({ visible, buildingName, floorName, onSelect, onSkip }) => (
    <Modal visible={visible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Select Room</Text>
                <Text style={styles.buildingLabel}>{buildingName} - {floorName}</Text>
                <ScrollView style={styles.optionsList}>
                    {['Room 101', 'Room 102', 'Room 103', 'Room 104', 'Room 105'].map((room) => (
                        <TouchableOpacity
                            key={room}
                            style={styles.optionButton}
                            onPress={() => onSelect(room)}
                        >
                            <Text style={styles.optionText}>{room}</Text>
                            <Ionicons name="chevron-forward" size={24} color="#666" />
                        </TouchableOpacity>
                    ))}
                </ScrollView>
                <TouchableOpacity style={styles.skipButton} onPress={onSkip}>
                    <Text style={styles.skipButtonText}>Skip</Text>
                </TouchableOpacity>
            </View>
        </View>
    </Modal>
);

// Report Selection Modal (For locations with multiple reports)
export const ReportSelectionModal = ({ visible, reports, buildingName, onSelect, onClose }) => (
    <Modal visible={visible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
                <View style={styles.selectionHeader}>
                    <Text style={styles.modalTitle}>Active Reports</Text>
                    <Text style={styles.buildingLabel}>{buildingName}</Text>
                </View>
                <ScrollView style={styles.optionsList}>
                    {reports.map((report) => (
                        <TouchableOpacity
                            key={report._id}
                            style={styles.reportItem}
                            onPress={() => onSelect(report)}
                        >
                            <View style={styles.reportItemLeft}>
                                <View style={[styles.typeBadge, { backgroundColor: EMERGENCY_TYPES.find(t => t.id === report.type || t.name === report.type)?.color || '#666' }]}>
                                    <Text style={styles.typeBadgeText}>{report.type}</Text>
                                </View>
                                <Text style={styles.reportTime}>{new Date(report.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                            </View>
                            <View style={styles.reportItemRight}>
                                <Text style={styles.reporterName}>{report.user?.firstName} {report.user?.lastName}</Text>
                                <Ionicons name="chevron-forward" size={20} color="#999" />
                            </View>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
                <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                    <Text style={styles.closeButtonText}>Close</Text>
                </TouchableOpacity>
            </View>
        </View>
    </Modal>
);

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        width: width * 0.9,
        maxHeight: '80%',
        backgroundColor: 'white',
        borderRadius: 20,
        padding: 20,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 5,
    },
    modalTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 20,
        color: '#333',
    },
    buildingLabel: {
        fontSize: 16,
        color: '#666',
        marginBottom: 15,
    },
    typeGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 12,
        marginBottom: 20,
    },
    typeButton: {
        width: (width * 0.9 - 60) / 2,
        padding: 15,
        borderRadius: 12,
        alignItems: 'center',
    },
    typeIconImage: {
        width: 40,
        height: 40,
        marginBottom: 8,
    },
    typeLabel: {
        color: 'white',
        fontWeight: 'bold',
        textAlign: 'center',
        fontSize: 12,
    },
    optionsList: {
        width: '100%',
        maxHeight: 300,
    },
    optionButton: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    optionText: {
        fontSize: 16,
        color: '#333',
    },
    closeButton: {
        marginTop: 15,
        padding: 12,
        borderRadius: 8,
        backgroundColor: '#e0e0e0',
        width: '100%',
        alignItems: 'center',
    },
    closeButtonText: {
        color: '#333',
        fontSize: 16,
        fontWeight: '600',
    },
    skipButton: {
        marginTop: 15,
        padding: 12,
        borderRadius: 8,
        backgroundColor: '#4CAF50',
        width: '100%',
        alignItems: 'center',
    },
    skipButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
    },
    selectionHeader: {
        width: '100%',
        alignItems: 'center',
        marginBottom: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        paddingBottom: 10,
    },
    reportItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 15,
        paddingHorizontal: 5,
        borderBottomWidth: 1,
        borderBottomColor: '#f5f5f5',
    },
    reportItemLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    reportItemRight: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    typeBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        marginRight: 10,
    },
    typeBadgeText: {
        color: 'white',
        fontSize: 10,
        fontWeight: 'bold',
    },
    reportTime: {
        fontSize: 12,
        color: '#666',
        fontWeight: '500',
    },
    reporterName: {
        fontSize: 14,
        color: '#333',
        fontWeight: '600',
        marginRight: 8,
    },
});
