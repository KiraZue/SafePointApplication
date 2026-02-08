import TcpSocket from 'react-native-tcp-socket';
import { BASE_URL } from './api';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Buffer } from 'buffer';

let server = null;
const PROXY_PORT = 8080;
let proxyDisabled = false;

// ============================================
// IN-MEMORY STORAGE (Phase 1 Optimization)
// ============================================
let hostedReportsMemory = [];
let offlineQueueMemory = [];
let lastDiskSync = Date.now();
const DISK_SYNC_INTERVAL = 10000;

// ============================================
// PERSISTENT SOCKET MANAGEMENT (Phase 2)
// ============================================
const connectedClients = new Map();

export const isProxyActive = () => {
  return !!server && !proxyDisabled;
};

export const canStartProxy = () => {
  try {
    if (proxyDisabled) return false;
    if (!TcpSocket || typeof TcpSocket.createServer !== 'function') return false;
    let testServer = null;
    try {
      testServer = TcpSocket.createServer(() => {});
    } catch {
      return false;
    }
    const ok = !!testServer;
    try { if (testServer) testServer.close(); } catch {}
    return ok;
  } catch {
    return false;
  }
};

// ============================================
// MEMORY OPERATIONS (Fast!)
// ============================================

const loadFromDisk = async () => {
  try {
    const hostedStr = await AsyncStorage.getItem('HOSTED_REPORTS');
    const queueStr = await AsyncStorage.getItem('OFFLINE_QUEUE');
    
    if (hostedStr) {
      hostedReportsMemory = JSON.parse(hostedStr);
      console.log('[Proxy] Loaded', hostedReportsMemory.length, 'reports from disk');
    }
    
    if (queueStr) {
      offlineQueueMemory = JSON.parse(queueStr);
      console.log('[Proxy] Loaded', offlineQueueMemory.length, 'queue items from disk');
    }
  } catch (e) {
    console.error('[Proxy] Failed to load from disk:', e);
  }
};

let lastReportCount = 0;

const saveToDisk = async () => {
  try {
    await AsyncStorage.setItem('HOSTED_REPORTS', JSON.stringify(hostedReportsMemory));
    await AsyncStorage.setItem('OFFLINE_QUEUE', JSON.stringify(offlineQueueMemory));
    lastDiskSync = Date.now();
    
    if (hostedReportsMemory.length !== lastReportCount) {
      console.log('[Proxy] Backed up to disk:', hostedReportsMemory.length, 'reports');
      lastReportCount = hostedReportsMemory.length;
    }
  } catch (e) {
    console.error('[Proxy] Backup failed:', e);
  }
};

let diskBackupInterval = null;

const startDiskBackup = () => {
  if (diskBackupInterval) return;
  
  diskBackupInterval = setInterval(() => {
    saveToDisk();
  }, DISK_SYNC_INTERVAL);
  
  console.log('[Proxy] Started periodic disk backup (every', DISK_SYNC_INTERVAL, 'ms)');
};

const stopDiskBackup = () => {
  if (diskBackupInterval) {
    clearInterval(diskBackupInterval);
    diskBackupInterval = null;
    saveToDisk();
  }
};

// ✅ CRITICAL FIX: Preserve persistence flags during updates
const updateReportInMemory = (reportId, updates) => {
  const index = hostedReportsMemory.findIndex(r => r._id === reportId);
  if (index !== -1) {
    const existing = hostedReportsMemory[index];
    
    // Preserve critical persistence flags
    hostedReportsMemory[index] = { 
      ...hostedReportsMemory[index], 
      ...updates,
      sharedFromOnline: existing.sharedFromOnline !== undefined ? existing.sharedFromOnline : updates.sharedFromOnline,
      _isPersistentShare: existing._isPersistentShare !== undefined ? existing._isPersistentShare : updates._isPersistentShare,
      sharedAt: existing.sharedAt || updates.sharedAt,
      _lastModified: Date.now()
    };
    return hostedReportsMemory[index];
  }
  return null;
};

const addReportToMemory = (report) => {
  const exists = hostedReportsMemory.find(r => r._id === report._id);
  if (!exists) {
    hostedReportsMemory.push({
      ...report,
      _lastModified: Date.now()
    });
    return report;
  }
  return updateReportInMemory(report._id, report);
};

const removeReportFromMemory = (reportId) => {
  const index = hostedReportsMemory.findIndex(r => r._id === reportId);
  if (index !== -1) {
    hostedReportsMemory.splice(index, 1);
    return true;
  }
  return false;
};

// ============================================
// BROADCAST SYSTEM (Phase 3)
// ============================================

const broadcastToClients = (event) => {
  const message = JSON.stringify(event) + '\n\n';
  let sent = 0;
  let failed = 0;
  
  connectedClients.forEach((socket, clientId) => {
    try {
      if (socket && !socket.destroyed) {
        socket.write(`EVENT: ${message}`);
        sent++;
      } else {
        connectedClients.delete(clientId);
        failed++;
      }
    } catch (e) {
      console.error('[Proxy] Failed to broadcast to', clientId, ':', e.message);
      connectedClients.delete(clientId);
      failed++;
    }
  });
  
  if (sent > 0) {
    console.log('[Proxy] Broadcasted to', sent, 'clients');
  }
  
  return sent;
};

// ============================================
// BACKEND SYNC LOOP (Phase 4) - ✅ FIXED AUTH
// ============================================

let backendSyncInterval = null;
let lastBackendSync = 0;
const BACKEND_SYNC_INTERVAL = 15000;

const startBackendSync = async () => {
  if (backendSyncInterval) return;
  
  backendSyncInterval = setInterval(async () => {
    try {
      // ✅ CRITICAL FIX: Proper auth token handling with error handling
      let token = null;
      
      try {
        token = await AsyncStorage.getItem('userToken');
      } catch (storageError) {
        return;
      }
      
      if (!token) {
        if (Date.now() - lastBackendSync > 75000) {
          console.log('[Proxy] No auth token - shared reports will persist offline');
          lastBackendSync = Date.now();
        }
        return;
      }
      
      const response = await axios.get(`${BASE_URL}/reports`, {
        timeout: 5000,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.data && Array.isArray(response.data)) {
        let updated = 0;
        
        response.data.forEach(onlineReport => {
          const existing = hostedReportsMemory.find(r => r._id === onlineReport._id);
          
          // ✅ CRITICAL: Only update if it's a shared report (persistent or auto-shared)
          if (existing && (existing.sharedFromOnline || existing._isPersistentShare)) {
            const needsUpdate = 
              new Date(onlineReport.updatedAt) > new Date(existing.updatedAt) ||
              (onlineReport.statusHistory?.length || 0) > (existing.statusHistory?.length || 0);
            
            if (needsUpdate) {
              // ✅ CRITICAL: Preserve persistence flags during sync
              updateReportInMemory(onlineReport._id, {
                ...onlineReport,
                sharedFromOnline: existing.sharedFromOnline,
                _isPersistentShare: existing._isPersistentShare,
                sharedAt: existing.sharedAt,
                hostedInGroup: true
              });
              updated++;
              
              broadcastToClients({
                type: 'report_updated',
                reportId: onlineReport._id,
                report: {
                  ...onlineReport,
                  sharedFromOnline: existing.sharedFromOnline,
                  _isPersistentShare: existing._isPersistentShare,
                  hostedInGroup: true
                }
              });
            }
          }
        });
        
        lastBackendSync = Date.now();
        
        if (updated > 0) {
          console.log('[Proxy] Backend sync:', updated, 'updated');
        }
      }
    } catch (e) {
      if (e.response?.status === 401 || e.response?.status === 403) {
        console.log('[Proxy] Auth error - token may be expired');
      }
    }
  }, BACKEND_SYNC_INTERVAL);
  
  console.log('[Proxy] Started backend sync (every', BACKEND_SYNC_INTERVAL, 'ms)');
};

const stopBackendSync = () => {
  if (backendSyncInterval) {
    clearInterval(backendSyncInterval);
    backendSyncInterval = null;
    console.log('[Proxy] Stopped backend sync');
  }
};

// ============================================
// HTTP PARSING (Legacy - for compatibility)
// ============================================

const parseHeadersBuffered = (buf) => {
  const marker = Buffer.from('\r\n\r\n', 'utf8');
  const headerEnd = buf.indexOf(marker);
  if (headerEnd === -1) return { ready: false };
  const headerStr = buf.slice(0, headerEnd).toString();
  const lines = headerStr.split('\r\n');
  const [method, url] = lines[0].split(' ');
  const headers = {};
  for (let i = 1; i < lines.length; i++) {
    const sepIdx = lines[i].indexOf(':');
    if (sepIdx > 0) {
      const key = lines[i].slice(0, sepIdx).trim().toLowerCase();
      const value = lines[i].slice(sepIdx + 1).trim();
      headers[key] = value;
    }
  }
  const rest = buf.slice(headerEnd + 4);
  const cl = parseInt(headers['content-length'] || '0', 10);
  if (rest.length < cl) {
    return { ready: false, method, url, headers, need: cl - rest.length, headerEnd };
  }
  const body = cl > 0 ? rest.slice(0, cl) : Buffer.alloc(0);
  return { ready: true, method, url, headers, body, consumed: headerEnd + 4 + cl };
};

// ============================================
// REQUEST HANDLERS (Optimized with Auth)
// ============================================

const handleP2POnline = async (socket, request) => {
  const bodyStr = JSON.stringify({ reports: hostedReportsMemory });
  const response = `HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${bodyStr.length}\r\nAccess-Control-Allow-Origin: *\r\nConnection: keep-alive\r\n\r\n${bodyStr}`;
  socket.write(response);
};

const handleP2POffline = async (socket) => {
  const reportItems = hostedReportsMemory.map(r => ({
    id: r._id,
    type: 'emergency_report',
    payload: {
      ...r,
      fromHost: true,
      isOffline: true,
      hostedInGroup: true
    },
    status: 'pending',
    ts: new Date(r.createdAt).getTime()
  }));
  
  const allItems = [...offlineQueueMemory, ...reportItems];
  const bodyStr = JSON.stringify({ items: allItems });
  const response = `HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${bodyStr.length}\r\nAccess-Control-Allow-Origin: *\r\nConnection: keep-alive\r\n\r\n${bodyStr}`;
  socket.write(response);
};

const handleP2PReport = async (socket, request) => {
  try {
    const bodyStr = request.body.toString();
    const data = JSON.parse(bodyStr);
    
    console.log('[Proxy] Received report from client:', data.payload?._id);
    
    const existingIndex = hostedReportsMemory.findIndex(r => r._id === data.payload?._id);
    
    if (existingIndex !== -1) {
      const existing = hostedReportsMemory[existingIndex];
      const mergedHistory = [...(existing.statusHistory || [])];
      
      (data.payload?.statusHistory || []).forEach(newEntry => {
        const exists = mergedHistory.some(
          h => h.status === newEntry.status && 
               h.updatedBy?._id === newEntry.updatedBy?._id
        );
        if (!exists) {
          mergedHistory.push(newEntry);
        }
      });
      
      // ✅ Update while preserving persistence flags
      const updated = updateReportInMemory(data.payload._id, {
        ...data.payload,
        statusHistory: mergedHistory,
        syncedToBackend: false,
        fromHost: false,
        hostedInGroup: true
      });
      
      broadcastToClients({
        type: 'report_updated',
        reportId: data.payload._id,
        report: updated
      });
      
      console.log('[Proxy] Updated existing report:', data.payload._id);
    } else {
      const newReport = addReportToMemory({
        _id: data.payload?._id || `offline_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
        ...data.payload,
        isOffline: true,
        synced: false,
        syncedToBackend: false,
        fromHost: false,
        hostedInGroup: true,
        receivedAt: Date.now(),
        statusHistory: data.payload?.statusHistory || []
      });
      
      broadcastToClients({
        type: 'report_added',
        report: newReport
      });
      
      console.log('[Proxy] ✓ Added new report:', newReport._id);
    }
    
    const responseBody = JSON.stringify({ status: 'queued', id: data.payload?._id || `offline_${Date.now()}` });
    const response = `HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${responseBody.length}\r\nAccess-Control-Allow-Origin: *\r\nConnection: keep-alive\r\n\r\n${responseBody}`;
    socket.write(response);
  } catch (e) {
    console.error('[Proxy] /p2p/report error:', e);
    const errorBody = JSON.stringify({ error: 'bad_request', message: e.message });
    const response = `HTTP/1.1 400 Bad Request\r\nContent-Type: application/json\r\nContent-Length: ${errorBody.length}\r\nAccess-Control-Allow-Origin: *\r\nConnection: keep-alive\r\n\r\n${errorBody}`;
    socket.write(response);
  }
};

const handleP2PStatus = async (socket, request) => {
  try {
    const bodyStr = request.body.toString();
    const data = JSON.parse(bodyStr);
    
    console.log('[Proxy] Status update:', data.reportId, '→', data.status);
    
    const reportIndex = hostedReportsMemory.findIndex(r => r._id === data.reportId);
    
    if (reportIndex !== -1) {
      const report = hostedReportsMemory[reportIndex];
      
      const alreadyExists = (report.statusHistory || []).some(
        h => h.status === data.status && 
             h.updatedBy?._id === data.updatedBy?._id
      );
      
      if (!alreadyExists) {
        const statusEntry = {
          status: data.status,
          updatedBy: data.updatedBy || {
            _id: 'offline_user',
            firstName: 'Unknown',
            lastName: 'User',
            role: 'User'
          },
          updatedAt: data.updatedAt || new Date().toISOString(),
          timestamp: data.updatedAt || new Date().toISOString(),
          syncedToBackend: false
        };
        
        // ✅ Update while preserving persistence flags
        const updated = updateReportInMemory(data.reportId, {
          status: data.status,
          statusHistory: [...(report.statusHistory || []), statusEntry]
        });
        
        broadcastToClients({
          type: 'status_update',
          reportId: data.reportId,
          status: data.status,
          report: updated
        });
        
        console.log('[Proxy] ✓ Status updated and broadcasted');
      }
      
      const responseBody = JSON.stringify({ status: 'updated', reportId: data.reportId });
      const response = `HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${responseBody.length}\r\nAccess-Control-Allow-Origin: *\r\nConnection: keep-alive\r\n\r\n${responseBody}`;
      socket.write(response);
    } else {
      const responseBody = JSON.stringify({ status: 'not_found', reportId: data.reportId });
      const response = `HTTP/1.1 404 Not Found\r\nContent-Type: application/json\r\nContent-Length: ${responseBody.length}\r\nAccess-Control-Allow-Origin: *\r\nConnection: keep-alive\r\n\r\n${responseBody}`;
      socket.write(response);
    }
  } catch (e) {
    console.error('[Proxy] /p2p/status error:', e);
    const errorBody = JSON.stringify({ error: 'bad_request' });
    const response = `HTTP/1.1 400 Bad Request\r\nContent-Type: application/json\r\nContent-Length: ${errorBody.length}\r\nAccess-Control-Allow-Origin: *\r\nConnection: keep-alive\r\n\r\n${errorBody}`;
    socket.write(response);
  }
};

// ============================================
// SERVER STARTUP
// ============================================

export const startProxyServer = async () => {
  if (server) {
    console.log('[Proxy] Server already running');
    return true;
  }

  try {
    if (!canStartProxy()) {
      console.log('[Proxy] TcpSocket not available');
      return false;
    }

    await loadFromDisk();

    server = TcpSocket.createServer((socket) => {
      const clientId = `${socket.remoteAddress}:${socket.remotePort}`;
      connectedClients.set(clientId, socket);
      
      console.log('[Proxy] Client connected:', clientId, '| Total:', connectedClients.size);
      
      socket._buf = Buffer.alloc(0);
      
      socket.on('data', async (data) => {
        try {
          socket._buf = Buffer.concat([socket._buf, Buffer.isBuffer(data) ? data : Buffer.from(data)]);
          const parsed = parseHeadersBuffered(socket._buf);
          if (!parsed.ready) return;
          
          const request = { 
            method: parsed.method, 
            url: parsed.url, 
            headers: parsed.headers, 
            body: parsed.body 
          };
          socket._buf = socket._buf.slice(parsed.consumed);

          // ✅ CRITICAL FIX: Filter Socket.io requests to prevent spam
          if (request.url && request.url.includes('/socket.io/')) {
            const response = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n";
            socket.write(response);
            return;
          }

          // Health check
          if (request.url === '/health' || request.url === '/api/health') {
            const bodyStr = JSON.stringify({ status: 'ok', proxy: true, timestamp: Date.now() });
            const response = `HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${bodyStr.length}\r\nAccess-Control-Allow-Origin: *\r\nConnection: keep-alive\r\n\r\n${bodyStr}`;
            socket.write(response);
            return;
          }

          // CORS
          if (request.method === 'OPTIONS') {
            const response = "HTTP/1.1 204 No Content\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type, Authorization\r\nConnection: keep-alive\r\n\r\n";
            socket.write(response);
            return;
          }

          // P2P Endpoints (FAST - memory only)
          if (request.url === '/p2p/online' && request.method === 'GET') {
            await handleP2POnline(socket, request);
            return;
          }

          if (request.url === '/p2p/offline' && request.method === 'GET') {
            await handleP2POffline(socket);
            return;
          }

          if (request.url === '/p2p/report' && request.method === 'POST') {
            await handleP2PReport(socket, request);
            return;
          }

          if (request.url === '/p2p/status' && request.method === 'POST') {
            await handleP2PStatus(socket, request);
            return;
          }

          if (request.url === '/p2p/identify' && request.method === 'POST') {
            const bodyStr = request.body.toString();
            const data = JSON.parse(bodyStr);
            
            if (data.fullName && data.deviceName) {
              const { DeviceEventEmitter } = require('react-native');
              DeviceEventEmitter.emit('P2P_PEER_IDENTIFY', {
                fullName: data.fullName,
                deviceName: data.deviceName
              });
            }
            
            const responseBody = JSON.stringify({ status: 'ok' });
            const response = `HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${responseBody.length}\r\nAccess-Control-Allow-Origin: *\r\nConnection: keep-alive\r\n\r\n${responseBody}`;
            socket.write(response);
            return;
          }

          // Proxy to backend (only for non-P2P requests)
          const backendUrl = `${BASE_URL}${request.url}`;
          
          try {
            let authToken = request.headers['authorization'];
            if (!authToken) {
              try {
                const token = await AsyncStorage.getItem('userToken');
                if (token) {
                  authToken = `Bearer ${token}`;
                }
              } catch (storageError) {
                // Silent fail
              }
            }
            
            const response = await axios({
              method: request.method,
              url: backendUrl,
              headers: {
                ...request.headers,
                host: undefined,
                'content-length': undefined,
                ...(authToken && { 'authorization': authToken })
              },
              data: request.body.length > 0 ? request.body : undefined,
              validateStatus: () => true,
              responseType: 'arraybuffer',
              timeout: 10000
            });
            
            const statusLine = `HTTP/1.1 ${response.status} ${response.statusText || 'OK'}\r\n`;
            let headerLines = '';
            Object.entries(response.headers).forEach(([k, v]) => {
              if (k.toLowerCase() !== 'transfer-encoding') {
                headerLines += `${k}: ${v}\r\n`;
              }
            });
            headerLines += 'Access-Control-Allow-Origin: *\r\n';
            headerLines += 'Connection: keep-alive\r\n';
            
            socket.write(`${statusLine}${headerLines}\r\n`);
            
            if (Buffer.isBuffer(response.data)) {
              socket.write(response.data);
            } else if (typeof response.data === 'string') {
              socket.write(Buffer.from(response.data, 'utf8'));
            } else {
              socket.write(Buffer.from(JSON.stringify(response.data), 'utf8'));
            }
          } catch (err) {
            if (err.code !== 'ECONNREFUSED' && err.code !== 'ETIMEDOUT') {
              console.error('[Proxy] Backend error:', err.message);
            }
            const errorBody = `Proxy Error: ${err.message}`;
            const errorResponse = `HTTP/1.1 502 Bad Gateway\r\nContent-Type: text/plain\r\nContent-Length: ${errorBody.length}\r\nAccess-Control-Allow-Origin: *\r\nConnection: keep-alive\r\n\r\n${errorBody}`;
            socket.write(errorResponse);
          }

        } catch (e) {
          console.error('[Proxy] Socket data error:', e.message);
        }
      });

      socket.on('error', (error) => {
        if (error && error.message) {
          console.error('[Proxy] Socket error:', error.message);
        }
        connectedClients.delete(clientId);
      });
      
      socket.on('close', () => {
        connectedClients.delete(clientId);
        console.log('[Proxy] Client disconnected:', clientId, '| Remaining:', connectedClients.size);
      });
    });

    if (!server || typeof server.listen !== 'function') {
      console.error('[Proxy] Server creation failed');
      return false;
    }

    let bound = false;
    
    console.log('[Proxy] Starting server...');
    
    for (let attempt = 0; attempt < 12 && !bound; attempt++) {
      try {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Bind timeout')), 8000);
          
          server.listen({ 
            port: PROXY_PORT, 
            host: '0.0.0.0',
            reuseAddress: true 
          }, (err) => {
            clearTimeout(timeout);
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        });
        
        bound = true;
        console.log('[Proxy] ✓ Server bound on 0.0.0.0:', PROXY_PORT);
        
        await new Promise(r => setTimeout(r, 3000));
        
        startDiskBackup();
        startBackendSync();
        
        console.log('[Proxy] ✓✓✓ Server fully operational');
        return true;
        
      } catch (err) {
        console.error('[Proxy] Bind attempt', attempt + 1, 'failed:', err.message);
        
        if (attempt < 11) {
          await new Promise(r => setTimeout(r, (attempt + 2) * 1000));
        }
      }
    }
    
    console.error('[Proxy] Failed to bind after all attempts');
    proxyDisabled = true;
    try { server.close(); } catch {}
    server = null;
    return false;
    
  } catch (e) {
    console.error('[Proxy] Start failed:', e);
    proxyDisabled = true;
    try { if (server) server.close(); } catch {}
    server = null;
    return false;
  }
};

export const stopProxyServer = () => {
  if (server) {
    console.log('[Proxy] Stopping server...');
    
    stopDiskBackup();
    stopBackendSync();
    
    connectedClients.forEach((socket, clientId) => {
      try {
        socket.destroy();
      } catch (e) {}
    });
    connectedClients.clear();
    
    try {
      server.close();
    } catch (e) {
      console.error('[Proxy] Error closing server:', e);
    }
    server = null;
    
    console.log('[Proxy] Server stopped');
  }
};

// Expose memory operations for external use
export const getHostedReportsMemory = () => hostedReportsMemory;
export const updateHostedReportInMemory = updateReportInMemory;
export const addHostedReportToMemory = addReportToMemory;
export const removeHostedReportFromMemory = removeReportFromMemory;