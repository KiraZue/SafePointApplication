// Base dimensions of the original map image (2000x1300)
export const SVG_WIDTH = 2000;
export const SVG_HEIGHT = 1300;
export const BASE_WIDTH = 2000;
export const BASE_HEIGHT = 1300;

// Emergency Types
export const EMERGENCY_TYPES = [
    { id: 'medical', name: 'Medical Emergency', icon: require('../../assets/SafePoint-assets/EmergencyIcons/medical.png'), color: '#E91E63' },
    { id: 'fire', name: 'Fire', icon: require('../../assets/SafePoint-assets/EmergencyIcons/fire.png'), color: '#F44336' },
    { id: 'earthquake', name: 'Earthquake', icon: require('../../assets/SafePoint-assets/EmergencyIcons/earthquake.png'), color: '#FF9800' },
    { id: 'security', name: 'Security Threat', icon: require('../../assets/SafePoint-assets/EmergencyIcons/security.png'), color: '#FFC107' },
    { id: 'accident', name: 'Accident', icon: require('../../assets/SafePoint-assets/EmergencyIcons/accident.png'), color: '#9C27B0' },
    { id: 'other', name: 'Other', icon: require('../../assets/SafePoint-assets/EmergencyIcons/other.png'), color: '#607D8B' }
];

// Buildings / Main Structures with hitbox coordinates
export const BUILDINGS = [
    {
        id: 'rbl_memorial',
        name: 'RBL Memorial Building',
        type: 'structure',
        center: { x: 1221, y: 233 },
        hitbox: 'M556,172 L1886,110 L1886,294 L560,355 Z'
    },
    {
        id: 'tech_voc',
        name: 'Tech Voc Building',
        type: 'structure',
        center: { x: 415, y: 291 },
        hitbox: 'M264,227 L555,215 L560,356 L269,370 Z'
    },
    {
        id: 'gymnasium',
        name: 'Gymnasium',
        type: 'structure',
        center: { x: 529, y: 562 },
        hitbox: 'M248,370 L794,347 L809,755 L265,784 Z'
    },

    {
        id: 'grand_stand',
        name: 'Grand Stand',
        type: 'structure',
        center: { x: 195, y: 555 },
        hitbox: 'M132,453 L250,450 L258,659 L140,666 Z'
    },

    {
        id: 'elementary',
        name: 'Elementary Building',
        type: 'structure',
        center: { x: 305, y: 1007 },
        hitbox: 'M186,856 L423,856 L423,1157 L186,1157 Z'
    },

    {
        id: 'senior_high',
        name: 'Senior Highschool Building',
        type: 'structure',
        center: { x: 988, y: 908 },
        hitbox: 'M793,837 L1182,837 L1182,979 L793,979 Z'
    },

    {
        id: 'tle_lab',
        name: 'TLE Laboratory',
        type: 'structure',
        center: { x: 956, y: 772 },
        hitbox: 'M808,706 L809,755 L784,757 L783,812 L924,818 L924,836 L1129,837 L1128,707 Z'
    },

    {
        id: 'tesda',
        name: 'TESDA Building',
        type: 'structure',
        center: { x: 1333, y: 1059 },
        hitbox: 'M1121,984 L1185,985 L1184,955 L1543,958 L1547,1160 L1121,1159 Z'
    },

    {
        id: 'admin1',
        name: 'Administration 1',
        type: 'structure',
        center: { x: 1767, y: 648 },
        hitbox: 'M1620,368 L1912,369 L1913,866 L1738,867 L1737,927 L1633,928 L1632,868 L1620,868 Z'
    },

    {
        id: 'admin2',
        name: 'Administration 2',
        type: 'structure',
        center: { x: 919, y: 1071 },
        hitbox: 'M771,984 L1066,984 L1066,1158 L771,1158 Z'
    },

    {
        id: 'canteen',
        name: 'Canteen',
        type: 'structure',
        center: { x: 1027, y: 542 },
        hitbox: 'M911,414 L1130,407 L1142,673 L922,685 Z'
    },

    // Areas / Zones
    {
        id: 'parking_lot',
        name: 'Parking Lot',
        type: 'zone',
        center: { x: 1361, y: 830 },
        hitbox: 'M1186,714 L1536,714 L1536,945 L1186,950 Z'
    },
    {
        id: 'wip',
        name: 'WIP',
        type: 'zone',
        center: { x: 1371, y: 560 },
        hitbox: 'M1188,417 L1532,405 L1537,700 L1192,710 Z'
    },
    {
        id: 'evacuation_area',
        name: 'Evacuation Area',
        type: 'zone',
        center: { x: 1780, y: 1013 },
        hitbox: 'M1935,880 L1742,880 L1739,930 L1626,932 L1627,1145 L1933,1146 Z'
    },
    {
        id: 'unaccessible',
        name: 'Unaccessible (zone)',
        type: 'zone',
        center: { x: 599, y: 975 },
        hitbox: 'M442,804 L755,804 L755,1146 L442,1146 Z'
    },

];

// Floor options
export const FLOORS = ['1st Floor', '2nd Floor', '3rd Floor', '4th Floor'];

// Sample room numbers
export const generateRoomOptions = (buildingName, floor) => {
    const baseRooms = ['Room 101', 'Room 102', 'Room 103', 'Room 104', 'Room 105'];
    return baseRooms;
};
