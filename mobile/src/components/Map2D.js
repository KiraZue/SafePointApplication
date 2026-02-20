import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { View, Image, Text, StyleSheet, Dimensions, TouchableOpacity } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  useAnimatedProps,
  withRepeat,
  Easing
} from 'react-native-reanimated';
import Svg, { Path, G, Text as SvgText } from 'react-native-svg';
import { BUILDINGS, SVG_WIDTH, SVG_HEIGHT, BASE_WIDTH, BASE_HEIGHT, EMERGENCY_TYPES } from '../constants/mapData';

const AnimatedPath = Animated.createAnimatedComponent(Path);

// Waypoints for evacuation routes (SVG coordinates 2000x1300)
const FIRE_PATH = "M372.5 57.5164L606.5 47.0164M606.5 47.0164L616 284.516M606.5 47.0164L967.5 29.0164M616 284.516H734.5M616 284.516V407.016L130 486.016V565.016M967.5 29.0164L1560.5 0.516388L1608.5 118.016C1608.5 118.016 1604.23 407.213 1601.5 592.516C1601.32 629.319 1595.93 645.666 1570.5 662.016C1510.45 674.432 1488.26 695.672 1465.5 754.516C1452.14 784.439 1439.01 788.871 1410 784.516M967.5 29.0164L971 132.516L992.5 175.016L999 314.516L981 344.516L995 707.516H1360V870.516M928.5 708.516V870.516H1360M1360 870.516H1410M734.5 284.516L947 269.016L956.5 359.016L981 368.016M734.5 284.516L739.5 418.016H983.356M130 565.016V740.016L0.5 746.016M130 565.016H0.5V746.016M0.5 746.016V908.016M646.5 105.016L967.5 96.0164H1391L1410 910.516M657.5 708.516H993.5";
const EARTHQUAKE_PATH = "M376.5 56.0178L610 46.5178M610 46.5178L618.5 286.518C618.5 286.518 689.804 283.07 735.5 281.018M610 46.5178L970 30.0178L1568 0.517761L1609 117.018L1604 618.518M735.5 281.018C821.206 277.168 955 272.018 955 272.018C955 272.018 961.497 351.998 960.5 360.518C959.503 369.038 968.867 373.945 986 370.018L987.645 424.518M735.5 281.018L740 420.518H986.5M661.5 711.518H931M932.5 872.518H1362M118 745.018H2.49994V569.018H133.5L135 488.018L622 412.518L618.5 288.518M644.5 107.518L1395 95.0178L1412.5 777.518H1473.5M0.499939 876.018L2.49994 747.018M932 711.518H997.812M1179.5 711.518H998.23M998 711.018L990 502.518H1039.5M987.645 425.518L990 501.518M970 31.0178L973.5 133.018L995 176.018L1001 317.018L984.5 346.018L986 369.018M133.5 727.518V570.518M931 856.518V712.518M1363.5 872.518H1414L1412.5 778.518M1198.5 711.518H1361.5L1363 871.518M1368.5 558.018H1405.5";

import { EmergencyTypeModal, FloorSelectionModal, RoomSelectionModal } from './ReportModals';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Calculate responsive dimensions while maintaining aspect ratio (1500:975)
const MAP_WIDTH = SCREEN_WIDTH;
const MAP_HEIGHT = (SCREEN_WIDTH * BASE_HEIGHT) / BASE_WIDTH;
const ASPECT_RATIO = BASE_WIDTH / BASE_HEIGHT;

// Helper: Check if report is from today
const isToday = (dateString) => {
  const reportDate = new Date(dateString);
  const today = new Date();
  return reportDate.getDate() === today.getDate() &&
    reportDate.getMonth() === today.getMonth() &&
    reportDate.getFullYear() === today.getFullYear();
};

// Helper: Find matching building by coordinates
const findBuildingByCoordinates = (x, y) => {
  const svgX = (x / 100) * SVG_WIDTH;
  const svgY = (y / 100) * SVG_HEIGHT;

  for (const building of BUILDINGS) {
    if (building.hitbox) {
      const coords = building.hitbox.match(/(\d+\.?\d*),(\d+\.?\d*)/g);
      if (coords) {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        coords.forEach(c => {
          const [cx, cy] = c.split(',').map(Number);
          minX = Math.min(minX, cx);
          maxX = Math.max(maxX, cx);
          minY = Math.min(minY, cy);
          maxY = Math.max(maxY, cy);
        });

        if (svgX >= minX - 20 && svgX <= maxX + 20 && svgY >= minY - 20 && svgY <= maxY + 20) {
          return building;
        }
      }
    }
  }

  let closestBuilding = null;
  let minDistance = Infinity;

  BUILDINGS.forEach(building => {
    const distance = Math.sqrt(
      Math.pow(building.center.x - svgX, 2) +
      Math.pow(building.center.y - svgY, 2)
    );
    if (distance < minDistance) {
      minDistance = distance;
      closestBuilding = building;
    }
  });

  return closestBuilding;
};

const BuildingMarker = React.memo(({ building, reports, onReportPress, highlightReport }) => {
  const todayReports = reports.filter(r => isToday(r.createdAt));
  if (todayReports.length === 0) return null;

  const unresolvedReports = todayReports.filter(r => r.status !== 'RESOLVED');
  const allResolved = todayReports.every(r => r.status === 'RESOLVED');

  const latestReport = todayReports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  const typeConfig = EMERGENCY_TYPES.find(t => t.id === latestReport.type || t.name === latestReport.type) || EMERGENCY_TYPES[5];

  const leftPercent = (building.center.x / SVG_WIDTH) * 100;
  const topPercent = (building.center.y / SVG_HEIGHT) * 100;

  // Determine if this building contains the highlighted report
  const isHighlighted = highlightReport && reports.some(r => r._id === highlightReport._id);

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      style={[styles.markerContainer, { left: `${leftPercent}%`, top: `${topPercent}%` }]}
      onPress={() => onReportPress && onReportPress(reports, building)}
    >
      <View style={[
        styles.markerDot,
        {
          backgroundColor: typeConfig.color,
          borderColor: isHighlighted ? '#26f12cff' : (allResolved ? '#4CAF50' : 'white'),
          borderWidth: isHighlighted ? 4 : 3
        }
      ]}>
        <Image source={typeConfig.icon} style={styles.markerIconImage} resizeMode="contain" />
      </View>
      {unresolvedReports.length > 1 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unresolvedReports.length}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
});

const EvacuationRoute = React.memo(({ type }) => {
  const dashOffset = useSharedValue(0);

  useEffect(() => {
    if (type) {
      dashOffset.value = withRepeat(
        withTiming(-30, { duration: 1000, easing: Easing.linear }),
        -1,
        false
      );
    } else {
      dashOffset.value = 0;
    }
  }, [type]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: dashOffset.value
  }));

  if (!type) return null;

  const pathData = type === 'fire' ? FIRE_PATH : EARTHQUAKE_PATH;
  const color = type === 'fire' ? '#F44336' : '#FF9800';

  return (
    <Svg style={styles.svgOverlayFlow} viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`} pointerEvents="none">
      <G transform="translate(165, 275) scale(1.0)">
        {/* Glow effect for prominence */}
        <Path
          d={pathData}
          stroke={color}
          strokeWidth={30}
          strokeOpacity={0.25}
          fill="none"
          strokeLinecap="round"
        />
        {/* Animated dashed path */}
        <AnimatedPath
          d={pathData}
          stroke={color}
          strokeWidth={16}
          strokeDasharray="22, 18"
          animatedProps={animatedProps}
          fill="none"
          strokeLinecap="round"
        />
      </G>
    </Svg>
  );
});

// Earthquake evacuation zone highlights - pulsing orange boxes over Evacuation Area + Parking Lot
const EvacuationHighlight = React.memo(({ type }) => {
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (type === 'earthquake') {
      opacity.value = withRepeat(
        withTiming(0.65, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
    } else {
      opacity.value = withTiming(0, { duration: 300 });
    }
  }, [type]);

  const animatedProps = useAnimatedProps(() => ({
    fillOpacity: opacity.value,
    strokeOpacity: Math.min(opacity.value * 1.5, 1),
  }));

  if (type !== 'earthquake') return null;

  const zones = [
    {
      id: 'evacuation_area',
      path: 'M1935,880 L1742,880 L1739,930 L1626,932 L1627,1145 L1933,1146 Z',
      label: 'Evacuation',
      label2: 'Area',
      cx: 1780,
      cy: 1045,
    },
    {
      id: 'parking_lot',
      path: 'M1186,714 L1536,714 L1536,945 L1186,950 Z',
      label: 'Evacuation Area',
      cx: 1361,
      cy: 850,
    },
  ];

  return (
    <Svg style={styles.svgOverlayFlow} viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`} pointerEvents="none">
      {zones.map(zone => (
        <G key={zone.id}>
          {/* Pulsing fill */}
          <AnimatedPath
            d={zone.path}
            fill="#FF9800"
            stroke="#FF6F00"
            strokeWidth={14}
            animatedProps={animatedProps}
          />
          {/* Text shadow for readability */}
          <SvgText
            x={zone.cx}
            y={zone.label2 ? zone.cy - 38 : zone.cy}
            fill="rgba(0,0,0,0.45)"
            fontSize={45}
            fontWeight="bold"
            textAnchor="middle"
            dy={2}
            dx={2}
          >
            {zone.label}
          </SvgText>
          <SvgText
            x={zone.cx}
            y={zone.label2 ? zone.cy - 38 : zone.cy}
            fill="white"
            fontSize={45}
            fontWeight="bold"
            textAnchor="middle"
          >
            {zone.label}
          </SvgText>
          {zone.label2 && (
            <>
              <SvgText
                x={zone.cx}
                y={zone.cy + 38}
                fill="rgba(0,0,0,0.45)"
                fontSize={50}
                fontWeight="bold"
                textAnchor="middle"
                dy={2}
                dx={2}
              >
                {zone.label2}
              </SvgText>
              <SvgText
                x={zone.cx}
                y={zone.cy + 38}
                fill="white"
                fontSize={50}
                fontWeight="bold"
                textAnchor="middle"
              >
                {zone.label2}
              </SvgText>
            </>
          )}
        </G>
      ))}
    </Svg>
  );
});

const BuildingHitboxes = React.memo(({ flowStep, selectedBuildingId, onBuildingPress, buildings }) => {
  if (flowStep !== 'BUILDING') return null;

  return (
    <Svg
      width={MAP_WIDTH}
      height={MAP_HEIGHT}
      viewBox={`0 0 ${BASE_WIDTH} ${BASE_HEIGHT}`}
      style={styles.svgOverlay}
    >
      {(buildings || BUILDINGS).map((building) => (
        <Path
          key={building.id}
          d={building.hitbox}
          fill={selectedBuildingId === building.id ? 'rgba(76, 175, 80, 0.5)' : 'rgba(33, 150, 243, 0.2)'}
          stroke="rgba(255,255,255,0.6)"
          strokeWidth="2"
          onPress={() => onBuildingPress(building.id)}
        />
      ))}
    </Svg>
  );
});

const Map2D = React.forwardRef(({ activeReports = [], onReportSubmit, highlightReport, onFlowStart, onFlowEnd, onReportPress }, ref) => {
  const [flowStep, setFlowStep] = useState('IDLE');
  const [selectedType, setSelectedType] = useState(null);
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [selectedFloor, setSelectedFloor] = useState(null);

  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedScale = useSharedValue(1);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const zoomToCoordinates = useCallback((x, y) => {
    const targetScale = 2.5;
    const svgX = (x / 100) * SVG_WIDTH;
    const svgY = (y / 100) * SVG_HEIGHT;

    // Convert SVG coordinates to responsive map coordinates
    const mapX = (svgX / SVG_WIDTH) * MAP_WIDTH;
    const mapY = (svgY / SVG_HEIGHT) * MAP_HEIGHT;

    // Correct centering formula: (Center of Screen - Target Point) * Scale
    // However, with Reanimated scale, we center the content first
    const targetTranslateX = (MAP_WIDTH / 2 - mapX) * targetScale;
    const targetTranslateY = (MAP_HEIGHT / 2 - mapY) * targetScale;

    // Apply strict clamping to prevent showing empty space
    const maxX = Math.max(0, (MAP_WIDTH * targetScale - SCREEN_WIDTH) / 2);
    const maxY = Math.max(0, (MAP_HEIGHT * targetScale - MAP_HEIGHT) / 2);

    const finalX = Math.max(-maxX, Math.min(maxX, targetTranslateX));
    const finalY = Math.max(-maxY, Math.min(maxY, targetTranslateY));

    translateX.value = withTiming(finalX, { duration: 500 });
    translateY.value = withTiming(finalY, { duration: 500 });
    scale.value = withTiming(targetScale, { duration: 500 });

    savedScale.value = targetScale;
    savedTranslateX.value = finalX;
    savedTranslateY.value = finalY;
  }, []);

  useEffect(() => {
    if (highlightReport && highlightReport.location && flowStep === 'IDLE') {
      const x = highlightReport.location.x || 50;
      const y = highlightReport.location.y || 50;
      zoomToCoordinates(x, y);
    }
  }, [highlightReport?._id, zoomToCoordinates, flowStep]);

  React.useImperativeHandle(ref, () => ({
    startReportFlow: () => {
      // Return to full view when SOS is tapped
      scale.value = withTiming(1, { duration: 400 });
      translateX.value = withTiming(0, { duration: 400 });
      translateY.value = withTiming(0, { duration: 400 });
      savedScale.value = 1;
      savedTranslateX.value = 0;
      savedTranslateY.value = 0;

      setFlowStep('TYPE');
      setSelectedType(null);
      setSelectedBuilding(null);
      setSelectedFloor(null);
      if (onFlowStart) onFlowStart();
    },
    resetMap: () => {
      scale.value = withTiming(1, { duration: 500 });
      translateX.value = withTiming(0, { duration: 500 });
      translateY.value = withTiming(0, { duration: 500 });
      savedScale.value = 1;
      savedTranslateX.value = 0;
      savedTranslateY.value = 0;
    },
    zoomToCoordinates: zoomToCoordinates
  }), [zoomToCoordinates]);

  const clamp = (value, min, max) => {
    'worklet';
    return Math.max(min, Math.min(value, max));
  };

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      'worklet';
      scale.value = withTiming(1, { duration: 400 });
      translateX.value = withTiming(0, { duration: 400 });
      translateY.value = withTiming(0, { duration: 400 });
      savedScale.value = 1;
      savedTranslateX.value = 0;
      savedTranslateY.value = 0;
    });

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = clamp(savedScale.value * e.scale, 0.5, 3);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
    });

  const panGesture = Gesture.Pan()
    .minPointers(1)
    .averageTouches(true)
    .onUpdate((e) => {
      const maxX = Math.max(0, (MAP_WIDTH * scale.value - SCREEN_WIDTH) / 2);
      const maxY = Math.max(0, (MAP_HEIGHT * scale.value - MAP_HEIGHT) / 2);
      translateX.value = clamp(savedTranslateX.value + e.translationX, -maxX, maxX);
      translateY.value = clamp(savedTranslateY.value + e.translationY, -maxY, maxY);
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const composedGesture = Gesture.Simultaneous(doubleTapGesture, pinchGesture, panGesture);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const handleBuildingPress = useCallback((buildingId) => {
    if (flowStep === 'BUILDING') {
      const building = BUILDINGS.find(b => b.id === buildingId);
      setSelectedBuilding(building);

      // Automatic return to full view when tapping location
      scale.value = withTiming(1, { duration: 400 });
      translateX.value = withTiming(0, { duration: 400 });
      translateY.value = withTiming(0, { duration: 400 });
      savedScale.value = 1;
      savedTranslateX.value = 0;
      savedTranslateY.value = 0;

      if (building.type === 'structure') {
        setFlowStep('FLOOR');
      } else {
        finishReport(building.name);
      }
    }
  }, [flowStep]);

  const finishReport = useCallback((locationString) => {
    setFlowStep('IDLE');
    if (onFlowEnd) onFlowEnd();
    if (onReportSubmit) {
      let locX = 50, locY = 50;
      if (selectedBuilding) {
        locX = (selectedBuilding.center.x / SVG_WIDTH) * 100;
        locY = (selectedBuilding.center.y / SVG_HEIGHT) * 100;
      }
      onReportSubmit({
        type: selectedType,
        locationName: locationString,
        coordinates: { x: locX, y: locY }
      });
    }
  }, [selectedBuilding, selectedType, onReportSubmit]);

  const buildingReports = useMemo(() => {
    const grouped = {};
    activeReports.forEach(report => {
      let building = null;
      const locationLabel = report.location?.description || '';
      if (locationLabel) {
        building = BUILDINGS.find(b =>
          locationLabel === b.name || locationLabel.startsWith(`${b.name} - `)
        );
      }
      if (!building) {
        const x = report.location?.x || 50;
        const y = report.location?.y || 50;
        building = findBuildingByCoordinates(x, y);
      }
      if (building) {
        if (!grouped[building.id]) grouped[building.id] = [];
        grouped[building.id].push(report);
      }
    });
    return grouped;
  }, [activeReports]);

  const markers = useMemo(() => {
    return BUILDINGS.map(building => {
      const reports = buildingReports[building.id] || [];
      return (
        <BuildingMarker
          key={building.id}
          building={building}
          reports={reports}
          onReportPress={onReportPress}
          highlightReport={highlightReport}
        />
      );
    });
  }, [buildingReports, onReportPress, highlightReport]);

  const activeEvacuationRoute = useMemo(() => {
    // Priority: Fire > Earthquake
    const hasUnresolvedFire = activeReports.some(r =>
      (r.type?.toLowerCase() === 'fire') && r.status !== 'RESOLVED'
    );
    if (hasUnresolvedFire) return 'fire';

    const hasUnresolvedEarthquake = activeReports.some(r =>
      (r.type?.toLowerCase() === 'earthquake') && r.status !== 'RESOLVED'
    );
    if (hasUnresolvedEarthquake) return 'earthquake';

    return null;
  }, [activeReports]);

  const mapContent = (
    <View style={styles.container}>
      <Animated.View style={[styles.mapContent, animatedStyle]}>
        <Image
          source={require('../../assets/Map.png')}
          style={styles.mapImage}
          resizeMode="contain"
        />
        <View style={styles.svgContainer} pointerEvents={flowStep === 'BUILDING' ? 'auto' : 'none'}>
          <BuildingHitboxes
            flowStep={flowStep}
            selectedBuildingId={selectedBuilding?.id}
            onBuildingPress={handleBuildingPress}
            buildings={BUILDINGS}
          />
        </View>
        <EvacuationHighlight type={activeEvacuationRoute} />
        <EvacuationRoute type={activeEvacuationRoute} />
        {flowStep !== 'BUILDING' && markers}
      </Animated.View>

      {flowStep === 'BUILDING' && (
        <View style={styles.instructionBanner}>
          <Text style={styles.instructionText}>📍 Tap the location on the map</Text>
        </View>
      )}

      <EmergencyTypeModal
        visible={flowStep === 'TYPE'}
        onClose={() => {
          setFlowStep('IDLE');
          if (onFlowEnd) onFlowEnd();
        }}
        onSelect={(type) => {
          setSelectedType(type);
          setFlowStep('BUILDING');
        }}
      />

      <FloorSelectionModal
        visible={flowStep === 'FLOOR'}
        buildingName={selectedBuilding?.name}
        onSelect={(floor) => {
          setSelectedFloor(floor);
          setFlowStep('ROOM');
        }}
        onSkip={() => finishReport(selectedBuilding?.name)}
      />

      <RoomSelectionModal
        visible={flowStep === 'ROOM'}
        buildingName={selectedBuilding?.name}
        floorName={selectedFloor}
        onSelect={(room) => finishReport(`${selectedBuilding?.name} - ${selectedFloor} - ${room}`)}
        onSkip={() => finishReport(`${selectedBuilding?.name} - ${selectedFloor}`)}
      />
    </View>
  );

  // When selecting a building, bypass GestureDetector entirely so SVG
  // onPress handlers receive touches without competing with the pan gesture.
  if (flowStep === 'BUILDING') {
    return mapContent;
  }

  return (
    <GestureDetector gesture={composedGesture}>
      {mapContent}
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#e0e0e0',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapContent: { width: MAP_WIDTH, height: MAP_HEIGHT },
  mapImage: { width: MAP_WIDTH, height: MAP_HEIGHT },
  svgContainer: { position: 'absolute', top: 0, left: 0, width: MAP_WIDTH, height: MAP_HEIGHT },
  svgOverlay: { position: 'absolute', top: 0, left: 0 },
  svgOverlayFlow: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  markerContainer: {
    position: 'absolute',
    width: 50,
    height: 50,
    marginLeft: -25,
    marginTop: -25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  markerDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  markerIconImage: { width: 22, height: 22 },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: 'white',
    elevation: 8,
  },
  badgeText: { color: 'white', fontSize: 10, fontWeight: 'bold' },
  instructionBanner: {
    position: 'absolute',
    top: 20,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  instructionText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
});

export default Map2D;
