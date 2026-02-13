import React, { useEffect, useRef, useState } from 'react';
import { View, Image, StyleSheet, Dimensions, Animated, PanResponder, TouchableOpacity, Text } from 'react-native';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import io from 'socket.io-client';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

const MAP_IMAGE = require('../../assets/splash-icon.png'); // placeholder, replace with actual blueprint image

function resolveSocketURL() {
  let base = 'http://localhost:5000';
  const hostUri = Constants?.expoConfig?.hostUri || Constants?.debuggerHost;
  if (hostUri) {
    const ip = hostUri.split(':')[0];
    if (ip && ip !== 'localhost') {
      base = `http://${ip}:5000`;
    }
  }
  if (Platform.OS === 'android' && (!hostUri || base.includes('localhost'))) {
    base = 'http://10.0.2.2:5000';
  }
  return base;
}

const Map2D = ({ highlightId, focusTo, onConfirmLocation }) => {
  const scale = useRef(new Animated.Value(1)).current;
  const translate = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const currentTransRef = useRef({ x: 0, y: 0 });
  const [showConfirm, setShowConfirm] = useState(false);
  const [pulses, setPulses] = useState([]);
  const [socket, setSocket] = useState(null);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: Animated.event(
        [null, { dx: translate.x, dy: translate.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: () => {
        setShowConfirm(true);
      },
    })
  ).current;

  const confirmLocation = () => {
    setShowConfirm(false);
    if (onConfirmLocation) {
      const { width, height } = containerSize;
      const centerXpx = width / 2;
      const centerYpx = height / 2;
      const tx = currentTransRef.current.x;
      const ty = currentTransRef.current.y;
      const mapXpx = centerXpx - tx;
      const mapYpx = centerYpx - ty;
      const xPct = Math.max(0, Math.min(100, (mapXpx / width) * 100));
      const yPct = Math.max(0, Math.min(100, (mapYpx / height) * 100));
      onConfirmLocation({ xPct, yPct });
    }
  };

  const socketURL = resolveSocketURL();

  useEffect(() => {
    const s = io(socketURL, { transports: ['websocket'] });
    setSocket(s);
    api.get('/reports/active')
      .then(({ data }) => setPulses(data))
      .catch(() => { });
    s.on('reports:active', (data) => setPulses(data));
    s.on('report:created', (report) => {
      setPulses((prev) => {
        if (prev.find((r) => r._id === report._id)) return prev;
        return [...prev, report];
      });
    });
    s.on('report:updated', (report) => {
      setPulses((prev) => {
        const others = prev.filter((r) => r._id !== report._id);
        if (report.status !== 'RESOLVED') {
          return [...others, report];
        }
        return others;
      });
    });
    return () => {
      s.disconnect();
    };
  }, []);

  // Track translate value continuously
  React.useEffect(() => {
    const sub = translate.addListener((v) => {
      currentTransRef.current = { x: v.x, y: v.y };
    });
    return () => translate.removeListener(sub);
  }, []);
  // When highlightId is provided and pulses update, center to that pulse
  useEffect(() => {
    if (!highlightId || !pulses || pulses.length === 0) return;
    const target = pulses.find((p) => p._id === highlightId);
    if (target?.location?.x != null && target?.location?.y != null) {
      animateToCenter(target.location.x, target.location.y);
    }
  }, [highlightId, pulses, containerSize]);

  // Focus to a given coordinate (percentage) by translating so the target sits at center
  const animateToCenter = (xPct, yPct) => {
    const { width, height } = containerSize;
    if (!width || !height) return;
    const targetX = (xPct / 100) * width;
    const targetY = (yPct / 100) * height;
    const centerX = width / 2;
    const centerY = height / 2;
    const tx = centerX - targetX;
    const ty = centerY - targetY;
    Animated.timing(translate, {
      toValue: { x: tx, y: ty },
      duration: 350,
      useNativeDriver: false,
    }).start();
  };

  useEffect(() => {
    if (focusTo && typeof focusTo.x === 'number' && typeof focusTo.y === 'number') {
      animateToCenter(focusTo.x, focusTo.y);
    }
  }, [focusTo, containerSize]);

  return (
    <View style={styles.container} onLayout={(e) => {
      const { width, height } = e.nativeEvent.layout;
      setContainerSize({ width, height });
    }}>
      <Animated.View
        style={[
          styles.mapWrapper,
          { transform: [{ scale }, { translateX: translate.x }, { translateY: translate.y }] },
        ]}
        {...panResponder.panHandlers}
      >
        <View>
          <Image source={MAP_IMAGE} style={styles.mapImage} resizeMode="contain" />

          {/* Fixed center marker */}
          <View style={[styles.centerMarker]} />

          {/* Pulses */}
          {pulses.map((p) => {
            const isHighlighted = highlightId && p._id === highlightId;
            const size = isHighlighted ? 36 : 28;
            return (
              <View
                key={p._id}
                style={[
                  styles.pulseOuter,
                  {
                    left: `${p.location?.x || 50}%`,
                    top: `${p.location?.y || 50}%`,
                    width: size,
                    height: size,
                  },
                ]}
              >
                <View style={styles.pulseInner} />
              </View>
            );
          })}
        </View>
      </Animated.View>

      {showConfirm && (
        <View style={styles.confirmPanel}>
          <Text style={styles.confirmText}>Confirm this as your emergency location?</Text>
          <View style={styles.confirmActions}>
            <TouchableOpacity style={styles.confirmBtn} onPress={confirmLocation}>
              <Text style={styles.confirmBtnText}>Confirm</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowConfirm(false)}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  mapWrapper: { flex: 1 },
  mapImage: { width: '100%', height: '100%' },
  centerMarker: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#1976d2',
    marginLeft: -8,
    marginTop: -8,
    borderWidth: 2,
    borderColor: '#fff',
    elevation: 2,
  },
  pulseOuter: {
    position: 'absolute',
    marginLeft: -14,
    marginTop: -14,
    borderRadius: 999,
    backgroundColor: 'rgba(244, 67, 54, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pulseInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#f44336',
  },
  confirmPanel: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 12,
    elevation: 3,
  },
  confirmText: { fontSize: 14, color: '#333', marginBottom: 10 },
  confirmActions: { flexDirection: 'row', justifyContent: 'flex-end' },
  confirmBtn: { backgroundColor: '#d32f2f', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, marginLeft: 8 },
  confirmBtnText: { color: '#fff', fontWeight: 'bold' },
  cancelBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: '#ccc' },
  cancelBtnText: { color: '#555' },
});

export default Map2D;
