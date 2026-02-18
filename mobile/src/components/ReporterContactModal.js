import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, ActivityIndicator, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const ReporterContactModal = ({ visible, onClose, reporter, loading }) => {
    const [activeTab, setActiveTab] = useState('personal'); // 'personal' or 'emergency'

    if (!visible) return null;

    const handleCall = (number) => {
        if (!number) return;
        Linking.openURL(`tel:${number}`);
    };

    const renderContent = () => {
        if (loading) {
            return (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#2196f3" />
                    <Text style={styles.loadingText}>Fetching reporter details...</Text>
                </View>
            );
        }

        if (!reporter) return null;

        if (activeTab === 'personal') {
            const pinfo = reporter.personalInfo || {};
            return (
                <View style={styles.tabContent}>
                    <View style={styles.infoRow}>
                        <Text style={styles.label}>Full Name:</Text>
                        <Text style={styles.value}>{reporter.firstName} {reporter.lastName}</Text>
                    </View>
                    <View style={styles.infoRow}>
                        <Text style={styles.label}>Role:</Text>
                        <Text style={styles.value}>{reporter.role}</Text>
                    </View>
                    <View style={styles.divider} />
                    <View style={styles.infoRow}>
                        <Text style={styles.label}>Grade:</Text>
                        <Text style={styles.value}>{pinfo.levelGroup || 'N/A'}</Text>
                    </View>
                    <View style={styles.infoRow}>
                        <Text style={styles.label}>Year Level:</Text>
                        <Text style={styles.value}>{pinfo.gradeLevel || 'N/A'}</Text>
                    </View>
                    <View style={styles.infoRow}>
                        <Text style={styles.label}>Strand / Course:</Text>
                        <Text style={styles.value}>{pinfo.strandCourse || 'N/A'}</Text>
                    </View>
                    <View style={styles.infoRow}>
                        <View style={styles.labelRow}>
                            <Text style={styles.label}>Phone Number:</Text>
                            {pinfo.contactNumber && (
                                <TouchableOpacity onPress={() => handleCall(pinfo.contactNumber)} style={styles.callIconBtn}>
                                    <Ionicons name="call" size={14} color="#2196f3" />
                                    <Text style={styles.callLabelText}>Call</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                        <Text style={styles.value}>{pinfo.contactNumber || 'N/A'}</Text>
                    </View>
                </View>
            );
        } else {
            const econtact = reporter.emergencyContact || {};
            return (
                <View style={styles.tabContent}>
                    <View style={styles.infoRow}>
                        <Text style={styles.label}>Contact Person:</Text>
                        <Text style={styles.value}>{econtact.name || 'N/A'}</Text>
                    </View>
                    <View style={styles.infoRow}>
                        <Text style={styles.label}>Relationship:</Text>
                        <Text style={styles.value}>{econtact.relation || 'N/A'}</Text>
                    </View>
                    <View style={styles.infoRow}>
                        <View style={styles.labelRow}>
                            <Text style={styles.label}>Phone Number:</Text>
                            {econtact.number && (
                                <TouchableOpacity onPress={() => handleCall(econtact.number)} style={styles.callIconBtn}>
                                    <Ionicons name="call" size={14} color="#2196f3" />
                                    <Text style={styles.callLabelText}>Call</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                        <Text style={styles.value}>{econtact.number || 'N/A'}</Text>
                    </View>
                    <View style={styles.infoRow}>
                        <Text style={styles.label}>Address:</Text>
                        <Text style={styles.value}>{econtact.address || 'N/A'}</Text>
                    </View>
                </View>
            );
        }
    };

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <View style={styles.header}>
                        <Text style={styles.headerTitle}>Reporter Contact Info</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <Ionicons name="close" size={24} color="#666" />
                        </TouchableOpacity>
                    </View>

                    {!loading && reporter && (
                        <View style={styles.tabBar}>
                            <TouchableOpacity
                                style={[styles.tab, activeTab === 'personal' && styles.activeTab]}
                                onPress={() => setActiveTab('personal')}
                            >
                                <Text style={[styles.tabText, activeTab === 'personal' && styles.activeTabText]}>Personal</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.tab, activeTab === 'emergency' && styles.activeTab]}
                                onPress={() => setActiveTab('emergency')}
                            >
                                <Text style={[styles.tabText, activeTab === 'emergency' && styles.activeTabText]}>Emergency</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    <ScrollView style={styles.scrollContent}>
                        {renderContent()}
                    </ScrollView>

                    <TouchableOpacity style={styles.doneBtn} onPress={onClose}>
                        <Text style={styles.doneBtnText}>Done</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalContent: {
        backgroundColor: '#fff',
        borderRadius: 16,
        width: '100%',
        maxHeight: '80%',
        overflow: 'hidden',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#333',
    },
    closeBtn: {
        padding: 5,
    },
    tabBar: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    tab: {
        flex: 1,
        paddingVertical: 12,
        alignItems: 'center',
    },
    activeTab: {
        borderBottomWidth: 3,
        borderBottomColor: '#2196f3',
    },
    tabText: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#999',
    },
    activeTabText: {
        color: '#2196f3',
    },
    scrollContent: {
        padding: 20,
    },
    tabContent: {
        paddingBottom: 20,
    },
    infoRow: {
        marginBottom: 15,
    },
    labelRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    label: {
        fontSize: 12,
        color: '#777',
    },
    value: {
        fontSize: 16,
        color: '#333',
        fontWeight: '500',
    },
    callIconBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#e3f2fd',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#bbdefb',
    },
    callLabelText: {
        fontSize: 11,
        fontWeight: 'bold',
        color: '#2196f3',
        marginLeft: 4,
    },
    divider: {
        height: 1,
        backgroundColor: '#eee',
        marginVertical: 10,
    },
    loadingContainer: {
        padding: 40,
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 15,
        color: '#666',
    },
    doneBtn: {
        backgroundColor: '#2196f3',
        margin: 20,
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
    },
    doneBtnText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 16,
    },
});

export default ReporterContactModal;
