import Zeroconf from 'react-native-zeroconf';
import { updateApiConfig } from './api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, DeviceEventEmitter } from 'react-native';
import Constants from 'expo-constants';

// expo-device is a native-only module (not supported in Expo Go).
// Use Constants.isDevice from expo-constants as a safe cross-environment replacement.
const isDevice = Constants.isDevice ?? true;
import NetInfo from '@react-native-community/netinfo';

let zeroconf = null;
let isScanning = false;
let foundBackend = false;

// Standard types for Zeroconf
const SERVICE_TYPE = 'http';
const SERVICE_PROTOCOL = 'tcp';
const SERVICE_DOMAIN = 'local.';

export const startDiscovery = async () => {
    if (isScanning || foundBackend) {
        console.log(`[Discovery] Skipped start. Scanning: ${isScanning}, Found: ${foundBackend}`);
        return;
    }

    try {
        const netInfo = await NetInfo.fetch();
        console.log('[Discovery] Device Info:', {
            isDevice,
            osVersion: Platform.Version,
            ipAddress: netInfo.details?.ipAddress,
            subnet: netInfo.details?.subnet,
            isWifiEnabled: netInfo.type === 'wifi'
        });

        // Skip discovery on Emulator (Unsupported and causes code 0 errors)
        if (!isDevice) {
            console.log('[Discovery] Running on Emulator - skipping zeroconf.');
            return;
        }

        if (!zeroconf) {
            console.log('[Discovery] Creating new Zeroconf instance...');
            zeroconf = new Zeroconf();

            zeroconf.on('start', () => {
                console.log('[Discovery] Scanning started for _http._tcp.local...');
                isScanning = true;
            });

            zeroconf.on('stop', () => {
                console.log('[Discovery] Scanning stopped.');
                isScanning = false;
            });

            zeroconf.on('resolved', (service) => {
                console.log('[Discovery] Resolved service:', JSON.stringify(service, null, 2));

                // Check if this is our backend (Matching SafePoint as defined in backend/server.js)
                if (service.name.includes('SafePoint') || (service.txt && service.txt.path === '/api/health')) {
                    // User requested "Saferoute" log message specifically
                    console.log('[Discovery] Saferoute backend detected from backend bonjour');
                    connectToDiscoveredBackend(service);
                }
            });

            zeroconf.on('error', (err) => {
                const errMsg = err.toString();
                console.error('[Discovery] Error event:', errMsg);

                // Silence "code 0" (Internal Error) as it's common on start/stop/mismatched envs
                if (!errMsg.includes('code: 0')) {
                    console.error('[Discovery] Critical error during scan:', errMsg);
                }
                isScanning = false;

                if (errMsg.includes('code: 0')) {
                    console.log('[Discovery] Encountered code 0 error, stopping discovery to reset state.');
                    stopDiscovery();
                }
            });

            zeroconf.on('found', (name) => {
                console.log('[Discovery] Found service name:', name);
                // Zeroconf found a service, now it needs to be resolved
            });

            zeroconf.on('remove', (name) => {
                console.log('[Discovery] Service removed:', name);
            });

            zeroconf.on('update', () => {
                console.log('[Discovery] Service updated');
            });
        }

        console.log('[Discovery] Initializing scan...');
        // Try both formats if needed, but react-native-zeroconf docs say 'http', 'tcp'
        zeroconf.scan(SERVICE_TYPE, SERVICE_PROTOCOL, SERVICE_DOMAIN);

        // Start fallback subnet scan after 3 seconds if no backend found
        // Remove '&& isScanning' check so it runs even if Zeroconf errors/stops
        setTimeout(() => {
            if (!foundBackend) {
                console.log('[Discovery] mDNS quiet/blocked. Starting subnet fallback scan...');
                scanSubnet();
            }
        }, 3000);

        // Scan timeout
        setTimeout(() => {
            if (isScanning && !foundBackend) {
                console.log('[Discovery] Timeout reached. No backend found. Stopping.');
                stopDiscovery();
            }
        }, 30000);

    } catch (e) {
        console.error('[Discovery] Failed to start discovery:', e);
    }
};

export const stopDiscovery = () => {
    if (zeroconf) {
        try {
            console.log('[Discovery] Stopping Zeroconf scan (Subnet scan may continue).');
            zeroconf.stop();
            // zeroconf.removeDeviceListeners(); // Be careful with this if we want to reuse the instance
            isScanning = false;
        } catch (e) {
            console.warn('[Discovery] Error stopping:', e);
        }
    }
};

const scanSubnet = async () => {
    try {
        const netInfo = await NetInfo.fetch();
        const ip = netInfo.details?.ipAddress;

        if (!ip || !ip.includes('.')) {
            console.log('[Discovery] Invalid IP for subnet scan:', ip);
            return;
        }

        // Define subnets to scan
        const targetSubnets = new Set();
        if (ip && ip.includes('.')) {
            const localPrefix = ip.substring(0, ip.lastIndexOf('.'));
            targetSubnets.add(localPrefix);
        }
        // Common defaults
        targetSubnets.add('192.168.43');  // Android Hotspot
        targetSubnets.add('192.168.137'); // Windows Hotspot
        targetSubnets.add('192.168.254'); // Router
        targetSubnets.add('192.168.0');
        targetSubnets.add('192.168.1');

        console.log('[Discovery] Starting Optimized Multi-Subnet Scan:', Array.from(targetSubnets));

        // 1. Prioritize Gateways (x.x.x.1)
        const gatewayIps = [];
        const otherIps = [];

        for (const prefix of targetSubnets) {
            gatewayIps.push(`${prefix}.1`); // Try gateway first (likely host)
            for (let i = 2; i < 255; i++) {
                otherIps.push(`${prefix}.${i}`);
            }
        }

        const allIps = [...gatewayIps, ...otherIps];
        const BATCH_SIZE = 50; // Increased for speed

        // Process in batches
        for (let i = 0; i < allIps.length; i += BATCH_SIZE) {
            if (foundBackend) break;

            const batch = allIps.slice(i, i + BATCH_SIZE);
            if (i % 100 === 0) console.log(`[Discovery] Scanning batch ${i + 1}-${i + batch.length} of ${allIps.length}...`);

            await Promise.allSettled(batch.map(targetIp => checkIp(targetIp)));

            // Tiny delay to yield UI
            await new Promise(resolve => setTimeout(resolve, 20));
        }

        if (!foundBackend) {
            console.log('[Discovery] Scan complete. No backend found.');
        }

    } catch (e) {
        console.error('[Discovery] Subnet scan error:', e);
    }
};

const checkIp = async (ip) => {
    if (foundBackend) return;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1000); // 1s timeout (Fast!)

        // Race between Port 5000 (Backend) and Port 8080 (Proxy)
        // This finds EITHER the backend PC or the Mobile Host Proxy
        const checkPort = async (port) => {
            try {
                const res = await fetch(`http://${ip}:${port}/api/health`, {
                    signal: controller.signal,
                    method: 'GET'
                });
                return res.ok ? port : null;
            } catch { return null; }
        };

        const promises = [checkPort(5000)];
        // Only check 8080 if IP is likely a mobile device (optional, but checking both is safer)
        promises.push(checkPort(8080));

        const results = await Promise.all(promises);
        clearTimeout(timeoutId);

        const foundPort = results.find(p => p !== null);

        if (foundPort && !foundBackend) {
            console.log(`[Discovery] FOUND SERVICE AT ${ip}:${foundPort}`);
            connectToDiscoveredBackend({
                name: `Scanned Service (${foundPort})`,
                addresses: [ip],
                host: ip,
                port: foundPort
            });
        }
    } catch (e) {
        // Ignore
    }
};

const connectToDiscoveredBackend = async (service) => {
    try {
        if (foundBackend) return;

        const port = service.port || 5000;
        const host = service.host || (service.addresses && service.addresses[0]);
        if (!host) {
            console.warn('[Discovery] No host found in service:', service);
            return;
        }

        // Strip trailing dot from host if present
        const cleanHost = host.endsWith('.') ? host.slice(0, -1) : host;

        // SELF-DISCOVERY FILTER:
        // Do not auto-configure to ourselves if we are running a proxy.
        // This prevents the infinite Loop where the app proxies to its own proxy.
        const netInfo = await NetInfo.fetch();
        const myIp = netInfo.details?.ipAddress;

        if (port === 8080 && (cleanHost === myIp || cleanHost === '127.0.0.1' || cleanHost === 'localhost')) {
            console.log('[Discovery] Ignored self-discovery (Proxy on 8080)');
            return;
        }

        const url = `http://${cleanHost}:${port}/api`;

        console.log('[Discovery] Auto-configuring API to:', url);

        updateApiConfig(url);
        foundBackend = true;
        stopDiscovery();

        await AsyncStorage.setItem('CUSTOM_BASE_URL', url);
        console.log('[Discovery] Backend configuration saved.');

    } catch (e) {
        console.error('[Discovery] Error connecting to found backend:', e);
    }
};
